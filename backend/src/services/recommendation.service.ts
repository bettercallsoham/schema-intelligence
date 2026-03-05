import prisma from '../config/database';
import { logger } from '../utils/logger';
import { explainSpecificIssue } from './llm.service';
import { loadKnowledgeBaseText } from './knowledge.service';

export const generateSqlRecommendations = async (issueId: string) => {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: {
      table: {
        include: {
          columns: true,
          indexes: true,
          foreignKeys: true,
        },
      },
    },
  });

  if (!issue) {
    throw new Error('Issue not found');
  }

  // ── Try AI-powered generation first ─────────────────────────────────────
  try {
    const knowledgeBaseText = loadKnowledgeBaseText();

    const issueContext = {
      tableName: issue.table?.name,
      severity: issue.severity,
      category: issue.category,
      title: issue.title,
      description: issue.description,
      recommendation: issue.recommendation || undefined,
    };

    const schemaContext = {
      databaseName: issue.table?.schemaName || 'unknown',
      tablesCount: 1,
      tableNames: issue.table ? [issue.table.name] : [],
      tablesWithDetails: issue.table
        ? [
            {
              name: issue.table.name,
              columnCount: issue.table.columns?.length || 0,
              rowCount: issue.table.rowCount ?? null,
              hasPrimaryKey:
                issue.table.columns?.some((c: any) => c.isPrimaryKey) || false,
              hasIndexes: (issue.table.indexes?.length || 0) > 0,
              indexCount: issue.table.indexes?.length || 0,
              foreignKeyCount: issue.table.foreignKeys?.length || 0,
            },
          ]
        : [],
      issuesCount: 1,
      topIssues: [issueContext],
    };

    const aiResult = await explainSpecificIssue(
      issueContext,
      schemaContext,
      knowledgeBaseText,
    );

    const recommendations = [];

    // Persist each AI-generated SQL suggestion
    if (aiResult.sqlSuggestions && aiResult.sqlSuggestions.length > 0) {
      for (const sql of aiResult.sqlSuggestions) {
        if (!sql.trim()) continue;

        // Check if this exact SQL already exists for the issue to avoid duplicates
        const existing = await prisma.sqlRecommendation.findFirst({
          where: { issueId: issue.id, sql },
        });
        if (existing) {
          recommendations.push(existing);
          continue;
        }

        const rec = await prisma.sqlRecommendation.create({
          data: {
            issueId: issue.id,
            snapshotId: issue.snapshotId || undefined,
            sql,
            description: `AI-generated fix: ${issue.title}`,
            explanation: aiResult.explanation
              ? aiResult.explanation.slice(0, 500)
              : `AI-recommended SQL to resolve: ${issue.description}`,
            safeToRun: !sql.trim().toUpperCase().startsWith('DROP'),
          },
        });
        recommendations.push(rec);
      }
    }

    // If AI returned SQL we are done
    if (recommendations.length > 0) {
      logger.info('AI SQL recommendations generated', {
        issueId,
        count: recommendations.length,
      });
      return recommendations;
    }

    logger.warn(
      'AI returned no SQL suggestions, falling back to rule-based generation',
      { issueId },
    );
  } catch (aiError) {
    logger.warn('AI SQL generation failed, falling back to rule-based logic', {
      issueId,
      error: aiError instanceof Error ? aiError.message : String(aiError),
    });
  }

  // ── Rule-based fallback ──────────────────────────────────────────────────
  const recommendations = [];

  if (issue.category === 'FOREIGN_KEYS' && issue.severity === 'HIGH') {
    const fk = issue.table?.foreignKeys?.find((fk) =>
      issue.description.includes(fk.columnName),
    );

    if (fk) {
      const sql = `CREATE INDEX idx_${issue.table?.name}_${fk.columnName} ON ${issue.table?.schemaName}.${issue.table?.name}(${fk.columnName});`;
      const description = `Index on foreign key column ${fk.columnName}`;
      const explanation = `This index will improve join performance when querying ${issue.table?.name} with its referenced table.`;

      const recommendation = await prisma.sqlRecommendation.create({
        data: {
          issueId: issue.id,
          snapshotId: issue.snapshotId || undefined,
          sql,
          description,
          explanation,
          safeToRun: true,
        },
      });

      recommendations.push(recommendation);
    }
  }

  if (issue.category === 'INDEX' && issue.severity === 'MEDIUM') {
    const primaryKeyColumn = issue.table?.columns?.find(
      (col) => col.isPrimaryKey,
    );
    if (primaryKeyColumn) {
      const sql = `CREATE INDEX idx_${issue.table?.name}_${primaryKeyColumn.name} ON ${issue.table?.schemaName}.${issue.table?.name}(${primaryKeyColumn.name});`;
      const description = `Primary index on ${primaryKeyColumn.name}`;
      const explanation = `This index will improve query performance for the primary key column.`;

      const recommendation = await prisma.sqlRecommendation.create({
        data: {
          issueId: issue.id,
          snapshotId: issue.snapshotId || undefined,
          sql,
          description,
          explanation,
          safeToRun: true,
        },
      });

      recommendations.push(recommendation);
    }
  }

  if (issue.category === 'CONSTRAINTS' && issue.severity === 'CRITICAL') {
    const primaryKeyColumn = issue.table?.columns?.find((col) =>
      col.name.toLowerCase().includes('id'),
    );
    if (primaryKeyColumn) {
      const sql = `ALTER TABLE ${issue.table?.schemaName}.${issue.table?.name} ADD CONSTRAINT pk_${issue.table?.name} PRIMARY KEY (${primaryKeyColumn.name});`;
      const description = `Add primary key constraint to ${issue.table?.name}`;
      const explanation = `This will ensure data integrity and improve query performance.`;

      const recommendation = await prisma.sqlRecommendation.create({
        data: {
          issueId: issue.id,
          snapshotId: issue.snapshotId || undefined,
          sql,
          description,
          explanation,
          safeToRun: false,
        },
      });

      recommendations.push(recommendation);
    }
  }

  if (issue.category === 'DATA_TYPES' && issue.severity === 'MEDIUM') {
    const nullableColumn = issue.table?.columns?.find(
      (col) => issue.description.includes(col.name) && col.nullable,
    );

    if (nullableColumn) {
      const sql = `ALTER TABLE ${issue.table?.schemaName}.${issue.table?.name} ALTER COLUMN ${nullableColumn.name} SET NOT NULL;`;
      const description = `Make ${nullableColumn.name} NOT NULL`;
      const explanation = `This will enforce data integrity by preventing null values in critical columns.`;

      const recommendation = await prisma.sqlRecommendation.create({
        data: {
          issueId: issue.id,
          snapshotId: issue.snapshotId || undefined,
          sql,
          description,
          explanation,
          safeToRun: false,
        },
      });

      recommendations.push(recommendation);
    }
  }

  logger.info('Rule-based SQL recommendations generated', {
    issueId,
    count: recommendations.length,
  });

  return recommendations;
};

export const getRecommendationsForIssue = async (issueId: string) => {
  return await prisma.sqlRecommendation.findMany({
    where: { issueId },
    orderBy: { createdAt: 'desc' },
  });
};

export const getRecommendationsForSnapshot = async (snapshotId: string) => {
  const snapshot = await prisma.schemaSnapshot.findUnique({
    where: { snapshotId },
  });

  if (!snapshot) {
    throw new Error('Snapshot not found');
  }

  return await prisma.sqlRecommendation.findMany({
    where: { snapshotId: snapshot.id },
    include: {
      issue: {
        include: {
          table: {
            select: {
              name: true,
              schemaName: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};
