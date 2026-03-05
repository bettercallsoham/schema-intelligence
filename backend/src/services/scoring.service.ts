import prisma from '../config/database';
import { logger } from '../utils/logger';
import type { IssueSeverity, IssueCategory } from '@prisma/client';
import { predictIndexImprovement, calculateFeatures } from './ml-prediction.service';

interface ScoringRule {
  name: string;
  severity: IssueSeverity;
  category: IssueCategory;
  check: (table: any) => boolean;
  description: (table: any) => string;
  recommendation: (table: any) => string;
}

const scoringRules: ScoringRule[] = [
  // ─── FOREIGN KEY RULES ──────────────────────────────────────────────────────
  {
    name: 'Missing index on foreign key',
    severity: 'HIGH',
    category: 'FOREIGN_KEYS',
    check: (table) => {
      const hasForeignKeys = table.foreignKeys && table.foreignKeys.length > 0;
      if (!hasForeignKeys) return false;

      return table.foreignKeys.some((fk: any) => {
        const columnHasIndex = table.indexes?.some((idx: any) =>
          idx.columns.includes(fk.columnName)
        );
        return !columnHasIndex;
      });
    },
    description: (table) => {
      const fkWithoutIndex = table.foreignKeys.find((fk: any) => {
        const columnHasIndex = table.indexes?.some((idx: any) =>
          idx.columns.includes(fk.columnName)
        );
        return !columnHasIndex;
      });
      return `${table.name}.${fkWithoutIndex?.columnName} is a foreign key but lacks an index`;
    },
    recommendation: (table) => {
      const fkWithoutIndex = table.foreignKeys.find((fk: any) => {
        const columnHasIndex = table.indexes?.some((idx: any) =>
          idx.columns.includes(fk.columnName)
        );
        return !columnHasIndex;
      });
      return `Create an index on ${table.name}.${fkWithoutIndex?.columnName} to improve join performance`;
    },
  },
  {
    name: 'Column with _id suffix missing foreign key constraint',
    severity: 'MEDIUM',
    category: 'FOREIGN_KEYS',
    check: (table) => {
      const idCols = table.columns?.filter((col: any) =>
        col.name.toLowerCase().endsWith('_id') && !col.isPrimaryKey
      ) || [];
      return idCols.some((col: any) => {
        const hasFk = table.foreignKeys?.some((fk: any) => fk.columnName === col.name);
        return !hasFk;
      });
    },
    description: (table) => {
      const problematicCol = table.columns?.find((col: any) =>
        col.name.toLowerCase().endsWith('_id') &&
        !col.isPrimaryKey &&
        !table.foreignKeys?.some((fk: any) => fk.columnName === col.name)
      );
      return `${table.name}.${problematicCol?.name} looks like a foreign key reference but has no FK constraint defined`;
    },
    recommendation: (table) => {
      const problematicCol = table.columns?.find((col: any) =>
        col.name.toLowerCase().endsWith('_id') &&
        !col.isPrimaryKey &&
        !table.foreignKeys?.some((fk: any) => fk.columnName === col.name)
      );
      return `Add a FOREIGN KEY constraint on ${table.name}.${problematicCol?.name} to enforce referential integrity and prevent orphaned records`;
    },
  },

  // ─── INDEX RULES ────────────────────────────────────────────────────────────
  {
    name: 'Large table without indexes',
    severity: 'MEDIUM',
    category: 'INDEX',
    check: (table) => {
      const rowCount = table.rowCount || 0;
      const hasIndexes = table.indexes && table.indexes.length > 0;
      return rowCount > 10000 && !hasIndexes;
    },
    description: (table) => {
      return `${table.name} has ${table.rowCount?.toLocaleString()} rows but no indexes — full table scans will be extremely slow`;
    },
    recommendation: (table) => {
      return `Add indexes on frequently queried columns in ${table.name}. Start with the primary key and any columns used in WHERE, JOIN, or ORDER BY clauses`;
    },
  },
  {
    name: 'Over-indexed table',
    severity: 'LOW',
    category: 'INDEX',
    check: (table) => {
      const indexCount = table.indexes?.length || 0;
      const columnCount = table.columns?.length || 0;
      return indexCount > columnCount && columnCount > 0;
    },
    description: (table) => {
      return `${table.name} has ${table.indexes?.length} indexes for only ${table.columns?.length} columns, which degrades INSERT/UPDATE/DELETE performance`;
    },
    recommendation: (table) => {
      return `Audit ${table.name} indexes using pg_stat_user_indexes to identify unused indexes. Remove low-usage indexes to improve write performance`;
    },
  },

  // ─── NORMALIZATION RULES ────────────────────────────────────────────────────
  {
    name: 'Too many columns — possible normalization issue',
    severity: 'LOW',
    category: 'NORMALIZATION',
    check: (table) => {
      const columnCount = table.columns?.length || 0;
      return columnCount > 30;
    },
    description: (table) => {
      return `${table.name} has ${table.columns?.length} columns. Tables with many columns often violate 3NF and indicate multiple concerns mixed into one table`;
    },
    recommendation: (table) => {
      return `Review ${table.name} for 3NF compliance. Consider splitting into smaller, focused tables — e.g., separate profile data, settings, and audit fields into their own tables`;
    },
  },
  {
    name: 'Potential 1NF violation — multi-valued column',
    severity: 'MEDIUM',
    category: 'NORMALIZATION',
    check: (table) => {
      const multiValueIndicators = ['tags', 'categories', 'emails', 'phones', 'items', 'values', 'ids', 'types'];
      return table.columns?.some((col: any) =>
        multiValueIndicators.some((ind) => col.name.toLowerCase() === ind) &&
        (col.type.toLowerCase().includes('text') ||
         col.type.toLowerCase().includes('varchar') ||
         col.type.toLowerCase().includes('json') ||
         col.type.toLowerCase().includes('char'))
      ) || false;
    },
    description: (table) => {
      const multiValueIndicators = ['tags', 'categories', 'emails', 'phones', 'items', 'values', 'ids', 'types'];
      const col = table.columns?.find((col: any) =>
        multiValueIndicators.some((ind) => col.name.toLowerCase() === ind)
      );
      return `${table.name}.${col?.name} may store multiple values in a single column, violating First Normal Form (1NF)`;
    },
    recommendation: (table) => {
      const multiValueIndicators = ['tags', 'categories', 'emails', 'phones', 'items', 'values', 'ids', 'types'];
      const col = table.columns?.find((col: any) =>
        multiValueIndicators.some((ind) => col.name.toLowerCase() === ind)
      );
      return `Create a separate junction table (e.g., ${table.name}_${col?.name}) with a proper foreign key back to ${table.name}, or use PostgreSQL's native array/jsonb type with proper indexing`;
    },
  },
  {
    name: 'Potential transitive dependency — 3NF violation',
    severity: 'LOW',
    category: 'NORMALIZATION',
    check: (table) => {
      // Heuristic: columns like city+state+zip or first_name+last_name alongside a user_id suggest embedded entity
      const addressFields = ['city', 'state', 'zip', 'zipcode', 'postal_code', 'country', 'street', 'address'];
      const addressCount = table.columns?.filter((col: any) =>
        addressFields.some((f) => col.name.toLowerCase().includes(f))
      ).length || 0;
      return addressCount >= 3;
    },
    description: (table) => {
      return `${table.name} contains multiple address/location fields. This may indicate a transitive dependency where location data depends on another attribute, not the primary key — violating 3NF`;
    },
    recommendation: (table) => {
      return `Extract address fields from ${table.name} into a separate Address table and reference it via a foreign key. This eliminates update anomalies and improves reusability`;
    },
  },

  // ─── CONSTRAINT RULES ───────────────────────────────────────────────────────
  {
    name: 'Missing primary key',
    severity: 'CRITICAL',
    category: 'CONSTRAINTS',
    check: (table) => {
      const hasPrimaryKey = table.columns?.some((col: any) => col.isPrimaryKey);
      return !hasPrimaryKey;
    },
    description: (table) => {
      return `${table.name} is missing a primary key constraint — this prevents unique row identification and violates relational integrity`;
    },
    recommendation: (table) => {
      return `Add a primary key to ${table.name}. Recommended: use UUID (gen_random_uuid()) or BIGSERIAL for high-volume tables. Example: ALTER TABLE ${table.name} ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid()`;
    },
  },
  {
    name: 'Missing UNIQUE constraint on email column',
    severity: 'HIGH',
    category: 'CONSTRAINTS',
    check: (table) => {
      const emailCol = table.columns?.find((col: any) =>
        col.name.toLowerCase() === 'email'
      );
      if (!emailCol) return false;
      const hasUniqueIndex = table.indexes?.some((idx: any) =>
        idx.unique && idx.columns.length === 1 && idx.columns.includes('email')
      );
      return !hasUniqueIndex && !emailCol.isPrimaryKey;
    },
    description: (table) => {
      return `${table.name}.email lacks a UNIQUE constraint, allowing duplicate email addresses to be inserted`;
    },
    recommendation: (table) => {
      return `Add UNIQUE constraint: CREATE UNIQUE INDEX idx_${table.name}_email_unique ON ${table.schemaName}.${table.name}(email); This prevents duplicate registrations and improves lookup performance`;
    },
  },
  {
    name: 'Missing audit timestamp columns',
    severity: 'LOW',
    category: 'CONSTRAINTS',
    check: (table) => {
      const auditCreated = ['created_at', 'createdat', 'create_date', 'inserted_at', 'created_date'];
      const auditUpdated = ['updated_at', 'updatedat', 'update_date', 'modified_at', 'last_modified', 'modified_date'];
      const hasCreatedAt = table.columns?.some((col: any) =>
        auditCreated.includes(col.name.toLowerCase())
      );
      const hasUpdatedAt = table.columns?.some((col: any) =>
        auditUpdated.includes(col.name.toLowerCase())
      );
      return !hasCreatedAt || !hasUpdatedAt;
    },
    description: (table) => {
      const auditCreated = ['created_at', 'createdat', 'create_date', 'inserted_at', 'created_date'];
      const auditUpdated = ['updated_at', 'updatedat', 'update_date', 'modified_at', 'last_modified', 'modified_date'];
      const hasCreatedAt = table.columns?.some((col: any) => auditCreated.includes(col.name.toLowerCase()));
      const hasUpdatedAt = table.columns?.some((col: any) => auditUpdated.includes(col.name.toLowerCase()));
      const missing = [];
      if (!hasCreatedAt) missing.push('created_at');
      if (!hasUpdatedAt) missing.push('updated_at');
      return `${table.name} is missing audit timestamp columns: ${missing.join(', ')}`;
    },
    recommendation: (table) => {
      return `Add audit columns to ${table.name}: ALTER TABLE ${table.schemaName}.${table.name} ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(); Use a trigger to auto-update updated_at on row changes`;
    },
  },

  // ─── DATA TYPE RULES ────────────────────────────────────────────────────────
  {
    name: 'Nullable columns in critical fields',
    severity: 'MEDIUM',
    category: 'DATA_TYPES',
    check: (table) => {
      const criticalColumns = ['email', 'username', 'user_id', 'id'];
      return table.columns?.some((col: any) => {
        return criticalColumns.some((critical) =>
          col.name.toLowerCase().includes(critical.toLowerCase())
        ) && col.nullable;
      }) || false;
    },
    description: (table) => {
      const nullableCritical = table.columns?.find((col: any) => {
        const criticalColumns = ['email', 'username', 'user_id'];
        return criticalColumns.some((critical) =>
          col.name.toLowerCase().includes(critical.toLowerCase())
        ) && col.nullable;
      });
      return `${table.name}.${nullableCritical?.name} should not be nullable — null values in identity fields cause unpredictable application behavior`;
    },
    recommendation: (table) => {
      const nullableCritical = table.columns?.find((col: any) => {
        const criticalColumns = ['email', 'username', 'user_id'];
        return criticalColumns.some((critical) =>
          col.name.toLowerCase().includes(critical.toLowerCase())
        ) && col.nullable;
      });
      return `Make ${table.name}.${nullableCritical?.name} NOT NULL: ALTER TABLE ${table.schemaName}.${table.name} ALTER COLUMN ${nullableCritical?.name} SET NOT NULL. Backfill any existing NULLs before applying this constraint`;
    },
  },
  {
    name: 'Overuse of generic VARCHAR types',
    severity: 'LOW',
    category: 'DATA_TYPES',
    check: (table) => {
      if (!table.columns || table.columns.length <= 3) return false;
      const varcharCols = table.columns.filter((col: any) =>
        col.type.toLowerCase().includes('varchar') ||
        col.type.toLowerCase().includes('character varying')
      ).length;
      return varcharCols / table.columns.length > 0.6;
    },
    description: (table) => {
      const varcharCount = table.columns?.filter((col: any) =>
        col.type.toLowerCase().includes('varchar') ||
        col.type.toLowerCase().includes('character varying')
      ).length;
      return `${table.name} has ${varcharCount} out of ${table.columns?.length} columns as VARCHAR — consider using more appropriate PostgreSQL-specific types`;
    },
    recommendation: (table) => {
      return `Replace generic VARCHARs in ${table.name} with PostgreSQL-native types: TEXT for unbounded strings, INTEGER/BIGINT for numeric IDs, BOOLEAN for true/false flags, TIMESTAMPTZ for timestamps, NUMERIC(p,s) for monetary values, and ENUM/CHECK constraints for status fields`;
    },
  },
  {
    name: 'Possible boolean stored as string',
    severity: 'LOW',
    category: 'DATA_TYPES',
    check: (table) => {
      const booleanPatterns = ['is_', 'has_', 'can_', 'should_', 'flag', 'active', 'enabled', 'disabled', 'deleted'];
      return table.columns?.some((col: any) =>
        booleanPatterns.some((pattern) => col.name.toLowerCase().startsWith(pattern)) &&
        (col.type.toLowerCase().includes('char') ||
         col.type.toLowerCase().includes('varchar') ||
         col.type.toLowerCase().includes('int'))
      ) || false;
    },
    description: (table) => {
      const booleanPatterns = ['is_', 'has_', 'can_', 'should_', 'flag', 'active', 'enabled', 'disabled', 'deleted'];
      const suspectCol = table.columns?.find((col: any) =>
        booleanPatterns.some((pattern) => col.name.toLowerCase().startsWith(pattern)) &&
        (col.type.toLowerCase().includes('char') || col.type.toLowerCase().includes('varchar'))
      );
      return `${table.name}.${suspectCol?.name} appears to be a boolean flag but is stored as a character type`;
    },
    recommendation: (table) => {
      const booleanPatterns = ['is_', 'has_', 'can_', 'should_', 'flag', 'active', 'enabled', 'disabled', 'deleted'];
      const suspectCol = table.columns?.find((col: any) =>
        booleanPatterns.some((pattern) => col.name.toLowerCase().startsWith(pattern)) &&
        (col.type.toLowerCase().includes('char') || col.type.toLowerCase().includes('varchar'))
      );
      return `Change ${table.name}.${suspectCol?.name} to BOOLEAN type: ALTER TABLE ${table.schemaName}.${table.name} ALTER COLUMN ${suspectCol?.name} TYPE BOOLEAN USING (${suspectCol?.name}::boolean). This saves storage and enables proper boolean operators`;
    },
  },
];

export const analyzeSchema = async (snapshotId: string) => {
  const snapshot = await prisma.schemaSnapshot.findUnique({
    where: { snapshotId },
    include: {
      tables: {
        include: {
          columns: true,
          indexes: true,
          foreignKeys: true,
        },
      },
    },
  });

  if (!snapshot) {
    throw new Error('Snapshot not found');
  }

  const issues = [];

  for (const table of snapshot.tables) {
    for (const rule of scoringRules) {
      if (rule.check(table)) {
        // For index-related issues, predict performance improvement using ML
        let predictedImprovement: number | null = null;
        
        if (rule.category === 'INDEX' || rule.category === 'FOREIGN_KEYS') {
          try {
            const tableRowCount = table.rowCount || 0;
            
            // Calculate features for ML prediction
            const features = calculateFeatures(tableRowCount, {
              // Estimate join depth: foreign keys typically involve 2 tables, large tables may have more
              joinDepth: table.foreignKeys && table.foreignKeys.length > 0 ? 2 : 1,
            });
            
            // Get ML prediction
            const prediction = await predictIndexImprovement(features);
            predictedImprovement = prediction.predictedImprovement;
            
            logger.info('ML prediction for index issue', {
              tableName: table.name,
              predictedImprovement,
              modelUsed: prediction.modelUsed,
            });
          } catch (error) {
            logger.warn('Failed to get ML prediction for index issue', {
              error: error instanceof Error ? error.message : String(error),
              tableName: table.name,
            });
            // Continue without prediction if ML fails
          }
        }
        
        const issue = await prisma.issue.create({
          data: {
            snapshot: {
              connect: { id: snapshot.id },
            },
            table: {
              connect: { id: table.id },
            },
            severity: rule.severity,
            category: rule.category,
            title: rule.name,
            description: rule.description(table),
            recommendation: rule.recommendation(table),
            predictedImprovement: predictedImprovement,
          },
        });
        issues.push(issue);
      }
    }
  }

  logger.info('Schema analysis completed', { snapshotId, issuesFound: issues.length });

  return issues;
};

export const getImpactScore = async (snapshotId: string) => {
  const snapshot = await prisma.schemaSnapshot.findUnique({
    where: { snapshotId },
  });

  if (!snapshot) {
    throw new Error('Snapshot not found');
  }

  const issues = await prisma.issue.findMany({
    where: { snapshotId: snapshot.id },
  });

  const severityWeights = {
    CRITICAL: 10,
    HIGH: 5,
    MEDIUM: 2,
    LOW: 1,
  };

  let totalScore = 0;
  const severityCounts = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };

  for (const issue of issues) {
    totalScore += severityWeights[issue.severity];
    severityCounts[issue.severity]++;
  }

  const maxPossibleScore = 100;
  const healthScore = Math.max(0, Math.min(100, maxPossibleScore - totalScore));

  return {
    healthScore,
    totalIssues: issues.length,
    severityCounts,
    breakdown: {
      critical: severityCounts.CRITICAL,
      high: severityCounts.HIGH,
      medium: severityCounts.MEDIUM,
      low: severityCounts.LOW,
    },
  };
};

export const getRankedIssues = async (snapshotId: string, limit = 10) => {
  const snapshot = await prisma.schemaSnapshot.findUnique({
    where: { snapshotId },
  });

  if (!snapshot) {
    throw new Error('Snapshot not found');
  }

  const issues = await prisma.issue.findMany({
    where: { snapshotId: snapshot.id, status: 'OPEN' },
    include: {
      table: {
        select: {
          name: true,
          schemaName: true,
        },
      },
    },
    orderBy: [
      { severity: 'asc' },
      { createdAt: 'desc' },
    ],
    take: limit,
  });

  const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const sorted = issues.sort((a, b) => {
    const aIndex = severityOrder.indexOf(a.severity);
    const bIndex = severityOrder.indexOf(b.severity);
    return aIndex - bIndex;
  });

  return sorted;
};

