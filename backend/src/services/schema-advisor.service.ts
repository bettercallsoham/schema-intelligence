import prisma from '../config/database';
import { logger } from '../utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NormalFormResult {
  form: '1NF' | '2NF' | '3NF' | 'BCNF';
  compliant: boolean;
  issues: string[];
  details: string;
}

export interface TableNFAnalysis {
  tableName: string;
  schemaName: string;
  normalForms: NormalFormResult[];
  overallCompliance: 'PASS' | 'WARN' | 'FAIL';
}

export interface Pitfall {
  id: string;
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  affectedTables: string[];
  sqlFix?: string;
}

export interface BestPractice {
  id: string;
  category: string;
  title: string;
  description: string;
  why: string;
  compliant: boolean;
  violations: string[];
  recommendation?: string;
  sqlExample?: string;
}

export interface TableImprovement {
  tableName: string;
  schemaName: string;
  currentIssues: string[];
  suggestedDDL: string;
  improvedColumns: string[];
  rationale: string;
}

export interface SchemaAdvisorReport {
  snapshotId: string;
  databaseName: string;
  analyzedAt: string;
  overallScore: number;
  overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: {
    totalTables: number;
    totalColumns: number;
    totalIndexes: number;
    totalForeignKeys: number;
    pitfallsFound: number;
    bestPracticesFollowed: number;
    bestPracticesTotal: number;
    normalFormViolations: number;
  };
  normalFormAnalysis: TableNFAnalysis[];
  pitfalls: Pitfall[];
  bestPractices: BestPractice[];
  tableImprovements: TableImprovement[];
  isOptimalSchema: boolean;
  optimality: {
    verdict: string;
    strengths: string[];
    weaknesses: string[];
  };
}

// ─── Normal Form Analysis ────────────────────────────────────────────────────

function analyze1NF(table: any): NormalFormResult {
  const issues: string[] = [];

  // Check for repeating groups / multi-value column names
  const multiValueNames = ['tags', 'categories', 'emails', 'phones', 'items', 'values', 'ids', 'types', 'list', 'array'];
  for (const col of table.columns || []) {
    if (
      multiValueNames.some((n) => col.name.toLowerCase() === n) &&
      (col.type.toLowerCase().includes('text') ||
        col.type.toLowerCase().includes('varchar') ||
        col.type.toLowerCase().includes('char'))
    ) {
      issues.push(`Column "${col.name}" (${col.type}) may store multiple comma-separated values`);
    }
  }

  // Check for numbered columns like col1, col2, col3 (repeating group)
  const colNames = (table.columns || []).map((c: any) => c.name.toLowerCase());
  const numberedPattern = /^(.+?)(\d+)$/;
  const baseCounts: Record<string, number> = {};
  for (const name of colNames) {
    const match = name.match(numberedPattern);
    if (match) {
      const base = match[1];
      baseCounts[base] = (baseCounts[base] || 0) + 1;
    }
  }
  for (const [base, count] of Object.entries(baseCounts)) {
    if (count >= 2) {
      issues.push(`Repeating column group detected: "${base}1", "${base}2"... — indicates unnormalized repeating group`);
    }
  }

  // Check for columns that suggest embedded JSON-like structures
  for (const col of table.columns || []) {
    if (
      col.type.toLowerCase().includes('json') ||
      col.type.toLowerCase().includes('jsonb')
    ) {
      issues.push(`Column "${col.name}" uses JSON/JSONB — ensure atomic values are not embedded as unstructured JSON`);
    }
  }

  return {
    form: '1NF',
    compliant: issues.length === 0,
    issues,
    details: issues.length === 0
      ? 'All columns appear atomic with no repeating groups detected'
      : 'Potential 1NF violations found: each column should hold a single atomic value',
  };
}

function analyze2NF(table: any): NormalFormResult {
  const issues: string[] = [];

  // 2NF only applies to tables with composite primary keys
  // Heuristic: If a table has no foreign keys back to multiple tables but has many non-key columns
  // that follow patterns suggesting partial dependencies
  const pkCols = (table.columns || []).filter((c: any) => c.isPrimaryKey);

  if (pkCols.length <= 1) {
    return {
      form: '2NF',
      compliant: true,
      issues: [],
      details: 'Table has a single-column primary key — 2NF is automatically satisfied (partial dependencies only apply to composite keys)',
    };
  }

  // Has composite PK — check for non-key columns that might depend on only part of the key
  const nonKeyCols = (table.columns || []).filter((c: any) => !c.isPrimaryKey && !c.isForeignKey);
  if (nonKeyCols.length > 0) {
    issues.push(
      `Table has a composite primary key (${pkCols.map((c: any) => c.name).join(', ')}) with ${nonKeyCols.length} non-key columns — verify each non-key column depends on the ENTIRE composite key, not just a part of it`
    );
  }

  return {
    form: '2NF',
    compliant: issues.length === 0,
    issues,
    details: issues.length === 0
      ? 'No partial dependencies detected'
      : 'Possible partial dependency: non-key attributes should depend on the full composite primary key',
  };
}

function analyze3NF(table: any): NormalFormResult {
  const issues: string[] = [];

  // Heuristic checks for transitive dependencies
  // Pattern 1: Address fields embedded (city + state + zip = transitive dependency via zip → city, state)
  const addressFields = ['city', 'state', 'zip', 'zipcode', 'postal_code', 'country', 'street', 'address_line'];
  const addressCount = (table.columns || []).filter((col: any) =>
    addressFields.some((f) => col.name.toLowerCase().includes(f))
  ).length;
  if (addressCount >= 3) {
    issues.push(
      `Table contains ${addressCount} address-related fields — consider extracting into a separate Address table to eliminate transitive dependencies (zip → city → state)`
    );
  }

  // Pattern 2: Denormalized name fields (first_name + last_name alongside person_id)
  const hasPersonId = (table.columns || []).some((c: any) =>
    ['person_id', 'user_id', 'customer_id', 'employee_id'].includes(c.name.toLowerCase())
  );
  const hasNameFields = (table.columns || []).some((c: any) =>
    ['first_name', 'last_name', 'full_name', 'display_name'].includes(c.name.toLowerCase())
  );
  if (hasPersonId && hasNameFields) {
    issues.push(
      `Table stores name fields alongside a person reference ID — the name likely depends on the person, not the table's primary key (transitive dependency)`
    );
  }

  // Pattern 3: Category + category_description (description depends on category)
  const hasCategoryAndDesc = (table.columns || []).some((c: any) => c.name.toLowerCase() === 'category') &&
    (table.columns || []).some((c: any) =>
      c.name.toLowerCase() === 'category_description' ||
      c.name.toLowerCase() === 'category_name'
    );
  if (hasCategoryAndDesc) {
    issues.push(
      `Both "category" and "category_description/name" present — category_description transitively depends on category, not the primary key`
    );
  }

  // Pattern 4: Status with status_description
  const hasStatusAndDesc = (table.columns || []).some((c: any) =>
    ['status', 'status_code'].includes(c.name.toLowerCase())
  ) && (table.columns || []).some((c: any) =>
    ['status_description', 'status_name', 'status_label'].includes(c.name.toLowerCase())
  );
  if (hasStatusAndDesc) {
    issues.push(
      `"status" and "status_description" columns co-exist — this transitive dependency should be resolved with a Status lookup table`
    );
  }

  return {
    form: '3NF',
    compliant: issues.length === 0,
    issues,
    details: issues.length === 0
      ? 'No obvious transitive dependencies detected'
      : 'Transitive dependencies found: non-key attributes should depend only on the primary key, not on other non-key attributes',
  };
}

function analyzeBCNF(table: any): NormalFormResult {
  const issues: string[] = [];

  // BCNF: Every determinant must be a candidate key
  // Heuristic: If a unique index exists on a non-PK column that also has other columns depending on it
  const uniqueIndexes = (table.indexes || []).filter((idx: any) => idx.unique && !idx.columns.some(
    (col: string) => (table.columns || []).find((c: any) => c.name === col)?.isPrimaryKey
  ));

  for (const idx of uniqueIndexes) {
    const nonPkCols = (table.columns || []).filter(
      (c: any) => !c.isPrimaryKey && !idx.columns.includes(c.name) && !c.isForeignKey
    );
    if (nonPkCols.length > 0 && idx.columns.length === 1) {
      issues.push(
        `Unique index on "${idx.columns[0]}" suggests it is a candidate key, but there are ${nonPkCols.length} other non-key columns — verify all determinants are candidate keys (BCNF requirement)`
      );
    }
  }

  return {
    form: 'BCNF',
    compliant: issues.length === 0,
    issues,
    details: issues.length === 0
      ? 'No BCNF violations detected based on available index information'
      : 'Possible BCNF violation: every functional determinant should be a candidate key',
  };
}

function computeTableNFAnalysis(table: any): TableNFAnalysis {
  const nf1 = analyze1NF(table);
  const nf2 = analyze2NF(table);
  const nf3 = analyze3NF(table);
  const bcnf = analyzeBCNF(table);

  const totalIssues = nf1.issues.length + nf2.issues.length + nf3.issues.length + bcnf.issues.length;

  let overallCompliance: 'PASS' | 'WARN' | 'FAIL';
  if (totalIssues === 0) {
    overallCompliance = 'PASS';
  } else if (totalIssues <= 2) {
    overallCompliance = 'WARN';
  } else {
    overallCompliance = 'FAIL';
  }

  return {
    tableName: table.name,
    schemaName: table.schemaName,
    normalForms: [nf1, nf2, nf3, bcnf],
    overallCompliance,
  };
}

// ─── Pitfalls Detection ──────────────────────────────────────────────────────

function detectPitfalls(tables: any[]): Pitfall[] {
  const pitfalls: Pitfall[] = [];

  // 1. Tables without primary keys
  const noPKTables = tables.filter((t) => !t.columns?.some((c: any) => c.isPrimaryKey));
  if (noPKTables.length > 0) {
    pitfalls.push({
      id: 'pitfall-no-pk',
      category: 'Data Integrity',
      severity: 'CRITICAL',
      title: 'Tables without Primary Keys',
      description:
        'Tables without primary keys cannot uniquely identify rows, leading to data duplication, inability to establish relationships, and severe application bugs.',
      affectedTables: noPKTables.map((t) => `${t.schemaName}.${t.name}`),
      sqlFix: noPKTables
        .map((t) => `ALTER TABLE ${t.schemaName}.${t.name} ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid();`)
        .join('\n'),
    });
  }

  // 2. FK columns without indexes
  const fkNoIndexTables: string[] = [];
  for (const table of tables) {
    const fksWithoutIndex = (table.foreignKeys || []).filter((fk: any) =>
      !table.indexes?.some((idx: any) => idx.columns.includes(fk.columnName))
    );
    if (fksWithoutIndex.length > 0) {
      fkNoIndexTables.push(`${table.schemaName}.${table.name} (${fksWithoutIndex.map((fk: any) => fk.columnName).join(', ')})`);
    }
  }
  if (fkNoIndexTables.length > 0) {
    pitfalls.push({
      id: 'pitfall-fk-no-index',
      category: 'Performance',
      severity: 'HIGH',
      title: 'Foreign Key Columns Without Indexes',
      description:
        'JOIN operations on unindexed foreign key columns result in full table scans, causing severe performance degradation as data grows. PostgreSQL does NOT automatically create indexes on foreign key columns.',
      affectedTables: fkNoIndexTables,
      sqlFix: tables
        .flatMap((t) =>
          (t.foreignKeys || [])
            .filter((fk: any) => !t.indexes?.some((idx: any) => idx.columns.includes(fk.columnName)))
            .map((fk: any) => `CREATE INDEX idx_${t.name}_${fk.columnName} ON ${t.schemaName}.${t.name}(${fk.columnName});`)
        )
        .join('\n'),
    });
  }

  // 3. Missing email uniqueness
  const emailNoUniqueTables = tables.filter((t) => {
    const emailCol = t.columns?.find((c: any) => c.name.toLowerCase() === 'email');
    if (!emailCol) return false;
    return !t.indexes?.some((idx: any) => idx.unique && idx.columns.includes('email'));
  });
  if (emailNoUniqueTables.length > 0) {
    pitfalls.push({
      id: 'pitfall-email-not-unique',
      category: 'Data Integrity',
      severity: 'HIGH',
      title: 'Email Columns Without UNIQUE Constraint',
      description:
        'Without a UNIQUE constraint on email columns, your application can have duplicate user accounts, causing login issues, double-billing, and broken auth flows.',
      affectedTables: emailNoUniqueTables.map((t) => `${t.schemaName}.${t.name}`),
      sqlFix: emailNoUniqueTables
        .map((t) => `CREATE UNIQUE INDEX idx_${t.name}_email ON ${t.schemaName}.${t.name}(email);`)
        .join('\n'),
    });
  }

  // 4. Nullable FK columns
  const nullableFKTables: string[] = [];
  for (const table of tables) {
    for (const fk of table.foreignKeys || []) {
      const col = table.columns?.find((c: any) => c.name === fk.columnName);
      if (col?.nullable) {
        nullableFKTables.push(`${table.schemaName}.${table.name}.${fk.columnName}`);
      }
    }
  }
  if (nullableFKTables.length > 0) {
    pitfalls.push({
      id: 'pitfall-nullable-fk',
      category: 'Data Integrity',
      severity: 'MEDIUM',
      title: 'Nullable Foreign Key Columns',
      description:
        'Nullable foreign keys allow orphaned references and make JOIN logic complex (LEFT JOIN vs INNER JOIN). Unless a NULL FK is intentionally representing "optional relationship", this is a design flaw.',
      affectedTables: nullableFKTables,
    });
  }

  // 5. Missing timestamp columns
  const missingTimestampTables: string[] = [];
  const auditCreated = ['created_at', 'createdat', 'create_date', 'inserted_at'];
  const auditUpdated = ['updated_at', 'updatedat', 'update_date', 'modified_at'];
  for (const table of tables) {
    const hasCreated = table.columns?.some((c: any) => auditCreated.includes(c.name.toLowerCase()));
    const hasUpdated = table.columns?.some((c: any) => auditUpdated.includes(c.name.toLowerCase()));
    if (!hasCreated || !hasUpdated) {
      missingTimestampTables.push(`${table.schemaName}.${table.name}`);
    }
  }
  if (missingTimestampTables.length > 0) {
    pitfalls.push({
      id: 'pitfall-no-timestamps',
      category: 'Auditability',
      severity: 'LOW',
      title: 'Missing Audit Timestamp Columns',
      description:
        'Without created_at and updated_at columns, you lose the ability to audit data changes, debug production issues, implement caching strategies, or comply with data retention regulations.',
      affectedTables: missingTimestampTables,
      sqlFix: missingTimestampTables
        .map((t) => {
          const [schema, name] = t.split('.');
          return `ALTER TABLE ${schema}.${name}\n  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`;
        })
        .join('\n\n'),
    });
  }

  // 6. Very wide tables (over 20 columns)
  const wideTables = tables.filter((t) => (t.columns?.length || 0) > 20);
  if (wideTables.length > 0) {
    pitfalls.push({
      id: 'pitfall-wide-tables',
      category: 'Normalization',
      severity: 'MEDIUM',
      title: 'Overly Wide Tables',
      description:
        'Tables with more than 20 columns often indicate a violation of the Single Responsibility Principle. They typically mix multiple concerns (e.g., user profile + authentication + billing), leading to poor query performance, difficult migrations, and complex application code.',
      affectedTables: wideTables.map((t) => `${t.schemaName}.${t.name} (${t.columns?.length} columns)`),
    });
  }

  // 7. Tables without any foreign keys (isolated tables)
  if (tables.length > 3) {
    const isolatedTables = tables.filter((t) => {
      const hasFKOut = (t.foreignKeys || []).length === 0;
      const hasFKIn = tables.some((other) =>
        other.name !== t.name &&
        (other.foreignKeys || []).some((fk: any) => fk.referencedTable === t.name)
      );
      return hasFKOut && !hasFKIn;
    });
    if (isolatedTables.length > 0) {
      pitfalls.push({
        id: 'pitfall-isolated-tables',
        category: 'Relationships',
        severity: 'LOW',
        title: 'Isolated Tables With No Relationships',
        description:
          'Tables with no foreign keys (inbound or outbound) may be orphaned lookup tables, missing FK constraints, or data that should be integrated with the rest of the schema.',
        affectedTables: isolatedTables.map((t) => `${t.schemaName}.${t.name}`),
      });
    }
  }

  // 8. Duplicate-sounding column names across tables (potential denormalization)
  const colNameCounts: Record<string, string[]> = {};
  for (const table of tables) {
    for (const col of table.columns || []) {
      if (['id', 'name', 'created_at', 'updated_at'].includes(col.name.toLowerCase())) continue;
      const key = col.name.toLowerCase();
      if (!colNameCounts[key]) colNameCounts[key] = [];
      colNameCounts[key].push(`${table.schemaName}.${table.name}`);
    }
  }
  const duplicatedCols = Object.entries(colNameCounts)
    .filter(([, tableList]) => tableList.length >= 3)
    .map(([colName, tableList]) => ({ colName, tableList }));
  if (duplicatedCols.length > 0) {
    pitfalls.push({
      id: 'pitfall-duplicated-columns',
      category: 'Normalization',
      severity: 'LOW',
      title: 'Same Column Name Repeated Across Many Tables',
      description:
        `Columns appearing in 3+ tables (${duplicatedCols.map((d) => `"${d.colName}"`).join(', ')}) may indicate denormalization where data is duplicated instead of being referenced via foreign keys.`,
      affectedTables: [...new Set(duplicatedCols.flatMap((d) => d.tableList))],
    });
  }

  return pitfalls;
}

// ─── Best Practices (PostgreSQL-Specific) ────────────────────────────────────

function evaluateBestPractices(tables: any[]): BestPractice[] {
  const practices: BestPractice[] = [];

  // 1. Use TIMESTAMPTZ instead of TIMESTAMP
  const timestampWithoutTZ: string[] = [];
  for (const table of tables) {
    for (const col of table.columns || []) {
      if (
        col.type.toLowerCase() === 'timestamp' ||
        col.type.toLowerCase() === 'timestamp without time zone'
      ) {
        timestampWithoutTZ.push(`${table.schemaName}.${table.name}.${col.name}`);
      }
    }
  }
  practices.push({
    id: 'bp-timestamptz',
    category: 'PostgreSQL Data Types',
    title: 'Use TIMESTAMPTZ (timestamp with time zone) for all date/time columns',
    description: 'PostgreSQL stores TIMESTAMPTZ as UTC internally and converts to session timezone on read.',
    why: 'Using plain TIMESTAMP stores local time with no timezone info, causing ambiguous data when your app or users span multiple timezones. TIMESTAMPTZ eliminates timezone-related bugs in global applications.',
    compliant: timestampWithoutTZ.length === 0,
    violations: timestampWithoutTZ,
    recommendation: 'Replace all TIMESTAMP columns with TIMESTAMPTZ.',
    sqlExample: 'ALTER TABLE your_table ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE \'UTC\';',
  });

  // 2. Use TEXT instead of VARCHAR(255) for arbitrary strings
  const varchar255Cols: string[] = [];
  for (const table of tables) {
    for (const col of table.columns || []) {
      if (
        col.type.toLowerCase() === 'character varying(255)' ||
        col.type.toLowerCase() === 'varchar(255)'
      ) {
        varchar255Cols.push(`${table.schemaName}.${table.name}.${col.name}`);
      }
    }
  }
  practices.push({
    id: 'bp-text-over-varchar255',
    category: 'PostgreSQL Data Types',
    title: 'Prefer TEXT over VARCHAR(255) for variable-length strings',
    description: 'In PostgreSQL, TEXT and VARCHAR have identical performance characteristics. VARCHAR(255) is an arbitrary limit inherited from MySQL.',
    why: 'VARCHAR(255) is a MySQL-ism. In PostgreSQL, TEXT has the same storage and performance as VARCHAR(n). Using TEXT avoids arbitrary length constraints that cause application errors when data slightly exceeds 255 chars.',
    compliant: varchar255Cols.length === 0,
    violations: varchar255Cols,
    recommendation: 'Replace VARCHAR(255) with TEXT for columns where you don\'t need a specific length constraint.',
    sqlExample: 'ALTER TABLE your_table ALTER COLUMN description TYPE TEXT;',
  });

  // 3. Use UUID as primary key where appropriate
  const serialPKTables: string[] = [];
  for (const table of tables) {
    const pkCols = (table.columns || []).filter((c: any) => c.isPrimaryKey);
    for (const pk of pkCols) {
      if (
        pk.type.toLowerCase().includes('serial') ||
        pk.type.toLowerCase().includes('integer') ||
        pk.type.toLowerCase() === 'int' ||
        pk.type.toLowerCase() === 'int4'
      ) {
        serialPKTables.push(`${table.schemaName}.${table.name}.${pk.name} (${pk.type})`);
      }
    }
  }
  practices.push({
    id: 'bp-uuid-pk',
    category: 'Primary Keys',
    title: 'Consider UUID primary keys for distributed systems and public-facing APIs',
    description: 'UUID keys (gen_random_uuid()) prevent ID enumeration attacks and work well in distributed architectures.',
    why: 'Sequential integer IDs expose your data volume to attackers (ID enumeration), are harder to merge in distributed systems, and can cause issues when inserting records in bulk from multiple sources. UUIDs solve all these problems at negligible storage cost.',
    compliant: serialPKTables.length === 0,
    violations: serialPKTables,
    recommendation: 'For new tables or tables exposed via public APIs, use UUID: id UUID PRIMARY KEY DEFAULT gen_random_uuid(). For high-volume write tables where sequential inserts are critical, BIGSERIAL is acceptable.',
    sqlExample: 'CREATE TABLE example (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ...);',
  });

  // 4. Every FK column should have an index
  const unindexedFKCols: string[] = [];
  for (const table of tables) {
    for (const fk of table.foreignKeys || []) {
      const hasIndex = (table.indexes || []).some((idx: any) => idx.columns.includes(fk.columnName));
      if (!hasIndex) {
        unindexedFKCols.push(`${table.schemaName}.${table.name}.${fk.columnName}`);
      }
    }
  }
  practices.push({
    id: 'bp-index-fk',
    category: 'Indexing',
    title: 'Index all foreign key columns',
    description: 'PostgreSQL does NOT automatically create indexes on FK columns. Every FK column used in JOINs should have an index.',
    why: 'Without an index, every JOIN on a foreign key causes a sequential scan of the entire table. As tables grow to millions of rows, these sequential scans make queries unusably slow. This is one of the most common PostgreSQL performance mistakes.',
    compliant: unindexedFKCols.length === 0,
    violations: unindexedFKCols,
    recommendation: 'Create a BTREE index on every foreign key column.',
    sqlExample: 'CREATE INDEX idx_orders_customer_id ON public.orders(customer_id);',
  });

  // 5. Use NUMERIC for monetary values, not FLOAT
  const floatMoneyCols: string[] = [];
  const moneyKeywords = ['price', 'amount', 'cost', 'salary', 'balance', 'total', 'tax', 'fee', 'revenue', 'discount'];
  for (const table of tables) {
    for (const col of table.columns || []) {
      if (
        moneyKeywords.some((k) => col.name.toLowerCase().includes(k)) &&
        (col.type.toLowerCase().includes('float') ||
          col.type.toLowerCase().includes('double') ||
          col.type.toLowerCase().includes('real'))
      ) {
        floatMoneyCols.push(`${table.schemaName}.${table.name}.${col.name} (${col.type})`);
      }
    }
  }
  practices.push({
    id: 'bp-numeric-money',
    category: 'PostgreSQL Data Types',
    title: 'Use NUMERIC(p,s) or BIGINT for monetary/financial values, not FLOAT',
    description: 'Floating-point types (FLOAT, DOUBLE, REAL) cannot represent most decimal fractions exactly.',
    why: 'Floating-point arithmetic introduces rounding errors. 0.1 + 0.2 ≠ 0.3 in floating point. For financial data, even 1-cent discrepancies accumulate and cause serious accounting errors. NUMERIC is exact. Alternatively, store amounts as BIGINT cents.',
    compliant: floatMoneyCols.length === 0,
    violations: floatMoneyCols,
    recommendation: 'Replace FLOAT with NUMERIC(15,2) for monetary columns, or store as BIGINT (integer cents).',
    sqlExample: 'ALTER TABLE orders ALTER COLUMN total_amount TYPE NUMERIC(15,2);',
  });

  // 6. Add NOT NULL to non-nullable business columns
  const unnecessaryNullCols: string[] = [];
  const shouldBeNotNull = ['email', 'username', 'name', 'title', 'status', 'type', 'code'];
  for (const table of tables) {
    for (const col of table.columns || []) {
      if (
        shouldBeNotNull.some((k) => col.name.toLowerCase() === k) &&
        col.nullable &&
        !col.isPrimaryKey
      ) {
        unnecessaryNullCols.push(`${table.schemaName}.${table.name}.${col.name}`);
      }
    }
  }
  practices.push({
    id: 'bp-not-null',
    category: 'Constraints',
    title: 'Add NOT NULL constraints to business-critical columns',
    description: 'Columns like email, name, status should never be NULL in a well-designed schema.',
    why: 'NULL values in critical columns like email or username make application logic brittle — every read requires null-checks, and GROUP BY / JOIN operations with NULLs produce unexpected results. Enforce business rules at the database level, not just the application level.',
    compliant: unnecessaryNullCols.length === 0,
    violations: unnecessaryNullCols,
    recommendation: 'Add NOT NULL constraints to columns that should always have a value.',
    sqlExample: 'ALTER TABLE users ALTER COLUMN email SET NOT NULL;',
  });

  // 7. Naming conventions (snake_case)
  const nonSnakeCaseCols: string[] = [];
  const snakeCaseRegex = /^[a-z][a-z0-9_]*$/;
  for (const table of tables) {
    for (const col of table.columns || []) {
      if (!snakeCaseRegex.test(col.name)) {
        nonSnakeCaseCols.push(`${table.schemaName}.${table.name}.${col.name}`);
      }
    }
    if (!snakeCaseRegex.test(table.name)) {
      nonSnakeCaseCols.push(`${table.schemaName}.${table.name} (table name)`);
    }
  }
  practices.push({
    id: 'bp-snake-case',
    category: 'Naming Conventions',
    title: 'Use snake_case for all table and column names',
    description: 'PostgreSQL identifiers are case-insensitive and are lowercased by default. Mixed case names require quoting.',
    why: 'PostgreSQL converts unquoted identifiers to lowercase. Using camelCase (e.g., "firstName") requires always quoting the column name in every query, which is error-prone. snake_case (first_name) works naturally without quoting and is the PostgreSQL community standard.',
    compliant: nonSnakeCaseCols.length === 0,
    violations: nonSnakeCaseCols,
    recommendation: 'Rename all tables and columns to use snake_case.',
    sqlExample: 'ALTER TABLE users RENAME COLUMN "firstName" TO first_name;',
  });

  // 8. Use BIGINT/BIGSERIAL for high-volume tables instead of INT
  const intPKHugeTable: string[] = [];
  for (const table of tables) {
    const rowCount = table.rowCount || 0;
    if (rowCount > 1000000) {
      const pkCols = (table.columns || []).filter((c: any) => c.isPrimaryKey);
      for (const pk of pkCols) {
        if (pk.type.toLowerCase() === 'integer' || pk.type.toLowerCase() === 'serial' || pk.type.toLowerCase() === 'int4') {
          intPKHugeTable.push(`${table.schemaName}.${table.name}.${pk.name} (${rowCount.toLocaleString()} rows, type: ${pk.type})`);
        }
      }
    }
  }
  practices.push({
    id: 'bp-bigint-pk',
    category: 'PostgreSQL Data Types',
    title: 'Use BIGINT/BIGSERIAL for primary keys on high-volume tables',
    description: 'INTEGER has a max value of ~2.1 billion. High-volume tables can overflow this limit.',
    why: 'INT primary keys max out at 2,147,483,647. A table with 10 million inserts/day would overflow in ~215 days. Migrating a PK type after overflow is an emergency operation requiring downtime. Use BIGSERIAL proactively for any table expected to have high write volume.',
    compliant: intPKHugeTable.length === 0,
    violations: intPKHugeTable,
    recommendation: 'Use BIGSERIAL or BIGINT for primary keys on tables projected to exceed 1 billion rows.',
    sqlExample: 'CREATE TABLE events (id BIGSERIAL PRIMARY KEY, ...);',
  });

  // 9. Avoid SELECT * — reflected in schema design by checking for too many columns on core tables
  const veryWideTables: string[] = [];
  for (const table of tables) {
    if ((table.columns?.length || 0) > 25) {
      veryWideTables.push(`${table.schemaName}.${table.name} (${table.columns?.length} columns)`);
    }
  }
  practices.push({
    id: 'bp-table-width',
    category: 'Schema Design',
    title: 'Keep tables focused — avoid tables with more than 20-25 columns',
    description: 'Tables with many columns often mix multiple concerns and make queries inefficient.',
    why: 'Wide tables force PostgreSQL to read more data per row, reducing cache efficiency. They also make migrations harder, complicate index design, and signal that the table is trying to do too much. Vertical partitioning (splitting a wide table) improves both performance and maintainability.',
    compliant: veryWideTables.length === 0,
    violations: veryWideTables,
    recommendation: 'Split wide tables by concern. For example, separate "users" into "users" (auth), "user_profiles" (display data), and "user_preferences" (settings).',
    sqlExample: 'CREATE TABLE user_profiles (user_id UUID PRIMARY KEY REFERENCES users(id), bio TEXT, avatar_url TEXT, ...);',
  });

  // 10. Partial indexes for soft-delete / status patterns
  const softDeleteWithoutPartialIndex: string[] = [];
  for (const table of tables) {
    const hasDeletedAt = (table.columns || []).some((c: any) =>
      ['deleted_at', 'is_deleted', 'deleted', 'is_active'].includes(c.name.toLowerCase())
    );
    const hasPartialIndex = (table.indexes || []).some((idx: any) =>
      idx.name?.toLowerCase().includes('partial') ||
      idx.name?.toLowerCase().includes('active') ||
      idx.name?.toLowerCase().includes('deleted')
    );
    if (hasDeletedAt && !hasPartialIndex && (table.rowCount || 0) > 1000) {
      softDeleteWithoutPartialIndex.push(`${table.schemaName}.${table.name}`);
    }
  }
  practices.push({
    id: 'bp-partial-index',
    category: 'Indexing',
    title: 'Use partial indexes for soft-delete and status-filtered queries',
    description: 'If you filter by status=\'active\' or deleted_at IS NULL in most queries, partial indexes are far more efficient.',
    why: 'A full index on a column where 90% of rows share the same value (e.g., deleted_at IS NULL) wastes space and slows writes. A partial index only indexes the minority subset (active records), making it smaller, faster to maintain, and more likely to be used by the query planner.',
    compliant: softDeleteWithoutPartialIndex.length === 0,
    violations: softDeleteWithoutPartialIndex,
    recommendation: 'Create partial indexes for your most common filtered queries.',
    sqlExample: 'CREATE INDEX idx_orders_active ON orders(created_at) WHERE deleted_at IS NULL;\nCREATE INDEX idx_users_active ON users(email) WHERE is_active = true;',
  });

  return practices;
}

// ─── Table-Level Improvement Suggestions ────────────────────────────────────

function generateTableImprovements(tables: any[]): TableImprovement[] {
  const improvements: TableImprovement[] = [];

  for (const table of tables) {
    const issues: string[] = [];
    const improvedColumns: string[] = [];
    const ddlLines: string[] = [];
    const alterStatements: string[] = [];

    // Check each column for improvements
    for (const col of table.columns || []) {
      let improvedType = col.type;
      let improved = false;

      // VARCHAR(255) → TEXT
      if (
        col.type.toLowerCase() === 'character varying(255)' ||
        col.type.toLowerCase() === 'varchar(255)'
      ) {
        improvedType = 'TEXT';
        issues.push(`"${col.name}": VARCHAR(255) → TEXT (PostgreSQL best practice)`);
        alterStatements.push(`ALTER TABLE ${table.schemaName}.${table.name} ALTER COLUMN ${col.name} TYPE TEXT;`);
        improved = true;
      }

      // TIMESTAMP → TIMESTAMPTZ
      if (
        col.type.toLowerCase() === 'timestamp' ||
        col.type.toLowerCase() === 'timestamp without time zone'
      ) {
        improvedType = 'TIMESTAMPTZ';
        issues.push(`"${col.name}": TIMESTAMP → TIMESTAMPTZ (timezone-aware)`);
        alterStatements.push(`ALTER TABLE ${table.schemaName}.${table.name} ALTER COLUMN ${col.name} TYPE TIMESTAMPTZ USING ${col.name} AT TIME ZONE 'UTC';`);
        improved = true;
      }

      // Float monetary → NUMERIC
      const moneyKeywords = ['price', 'amount', 'cost', 'salary', 'balance', 'total', 'tax', 'fee', 'revenue', 'discount'];
      if (
        moneyKeywords.some((k) => col.name.toLowerCase().includes(k)) &&
        (col.type.toLowerCase().includes('float') || col.type.toLowerCase().includes('double') || col.type.toLowerCase().includes('real'))
      ) {
        improvedType = 'NUMERIC(15,2)';
        issues.push(`"${col.name}": FLOAT → NUMERIC(15,2) (exact monetary arithmetic)`);
        alterStatements.push(`ALTER TABLE ${table.schemaName}.${table.name} ALTER COLUMN ${col.name} TYPE NUMERIC(15,2);`);
        improved = true;
      }

      if (improved) {
        improvedColumns.push(`${col.name}: ${col.type} → ${improvedType}`);
      }

      // Build the DDL column line
      const colConstraints = [];
      if (col.isPrimaryKey) colConstraints.push('PRIMARY KEY');
      else if (!col.nullable) colConstraints.push('NOT NULL');
      if (col.defaultValue) colConstraints.push(`DEFAULT ${col.defaultValue}`);
      ddlLines.push(`  ${col.name} ${improvedType}${colConstraints.length > 0 ? ' ' + colConstraints.join(' ') : ''}`);
    }

    // Check for missing audit columns
    const auditCreated = ['created_at', 'createdat', 'create_date', 'inserted_at'];
    const auditUpdated = ['updated_at', 'updatedat', 'update_date', 'modified_at'];
    const hasCreatedAt = table.columns?.some((c: any) => auditCreated.includes(c.name.toLowerCase()));
    const hasUpdatedAt = table.columns?.some((c: any) => auditUpdated.includes(c.name.toLowerCase()));

    if (!hasCreatedAt) {
      issues.push('Missing "created_at" audit column');
      ddlLines.push('  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
      alterStatements.push(`ALTER TABLE ${table.schemaName}.${table.name} ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
    }
    if (!hasUpdatedAt) {
      issues.push('Missing "updated_at" audit column');
      ddlLines.push('  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
      alterStatements.push(`ALTER TABLE ${table.schemaName}.${table.name} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
    }

    // Add FK indexes
    for (const fk of table.foreignKeys || []) {
      const hasIndex = (table.indexes || []).some((idx: any) => idx.columns.includes(fk.columnName));
      if (!hasIndex) {
        issues.push(`Missing index on foreign key "${fk.columnName}"`);
        alterStatements.push(`CREATE INDEX IF NOT EXISTS idx_${table.name}_${fk.columnName} ON ${table.schemaName}.${table.name}(${fk.columnName});`);
      }
    }

    if (issues.length === 0) continue; // Skip tables with no improvements needed

    const suggestedDDL = alterStatements.length > 0
      ? `-- Improvements for ${table.schemaName}.${table.name}\n` + alterStatements.join('\n')
      : '';

    improvements.push({
      tableName: table.name,
      schemaName: table.schemaName,
      currentIssues: issues,
      suggestedDDL,
      improvedColumns,
      rationale: `These changes align ${table.name} with PostgreSQL best practices: exact data types prevent data corruption, timezone-aware timestamps prevent timezone bugs, audit columns enable change tracking, and FK indexes prevent slow JOINs.`,
    });
  }

  return improvements;
}

// ─── Overall Score Calculation ───────────────────────────────────────────────

function computeOverallScore(
  pitfalls: Pitfall[],
  bestPractices: BestPractice[],
  nfAnalysis: TableNFAnalysis[]
): { score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' } {
  let score = 100;

  // Deduct for pitfalls
  for (const p of pitfalls) {
    if (p.severity === 'CRITICAL') score -= 15;
    else if (p.severity === 'HIGH') score -= 10;
    else if (p.severity === 'MEDIUM') score -= 5;
    else score -= 2;
  }

  // Deduct for best practice violations
  const bpViolations = bestPractices.filter((bp) => !bp.compliant);
  score -= bpViolations.length * 3;

  // Deduct for NF violations
  for (const nf of nfAnalysis) {
    if (nf.overallCompliance === 'FAIL') score -= 5;
    else if (nf.overallCompliance === 'WARN') score -= 2;
  }

  score = Math.max(0, Math.min(100, score));

  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 75) grade = 'B';
  else if (score >= 60) grade = 'C';
  else if (score >= 45) grade = 'D';
  else grade = 'F';

  return { score, grade };
}

// ─── Main Analysis Function ──────────────────────────────────────────────────

export const analyzeSchemaAdvisor = async (snapshotId: string): Promise<SchemaAdvisorReport> => {
  const snapshot = await prisma.schemaSnapshot.findUnique({
    where: { snapshotId },
    include: {
      database: true,
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

  const tables = snapshot.tables;

  // Run all analyses
  const normalFormAnalysis = tables.map(computeTableNFAnalysis);
  const pitfalls = detectPitfalls(tables);
  const bestPractices = evaluateBestPractices(tables);
  const tableImprovements = generateTableImprovements(tables);

  const { score, grade } = computeOverallScore(pitfalls, bestPractices, normalFormAnalysis);

  const bpFollowed = bestPractices.filter((bp) => bp.compliant).length;
  const nfViolations = normalFormAnalysis.reduce(
    (sum, t) => sum + t.normalForms.reduce((s, nf) => s + nf.issues.length, 0),
    0
  );

  // Determine optimality
  const criticalPitfalls = pitfalls.filter((p) => p.severity === 'CRITICAL' || p.severity === 'HIGH');
  const isOptimalSchema = score >= 85 && criticalPitfalls.length === 0;

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (!pitfalls.some((p) => p.id === 'pitfall-no-pk')) strengths.push('All tables have primary keys');
  if (!pitfalls.some((p) => p.id === 'pitfall-fk-no-index')) strengths.push('All foreign key columns are properly indexed');
  if (!pitfalls.some((p) => p.id === 'pitfall-email-not-unique')) strengths.push('Email columns have UNIQUE constraints');
  if (bestPractices.find((bp) => bp.id === 'bp-snake-case')?.compliant) strengths.push('Consistent snake_case naming convention');
  if (bestPractices.find((bp) => bp.id === 'bp-timestamptz')?.compliant) strengths.push('Timezone-aware timestamp columns');

  for (const p of pitfalls.filter((p) => p.severity === 'CRITICAL' || p.severity === 'HIGH')) {
    weaknesses.push(p.title);
  }
  for (const bp of bestPractices.filter((bp) => !bp.compliant && ['bp-index-fk', 'bp-not-null', 'bp-numeric-money'].includes(bp.id))) {
    weaknesses.push(`Best practice not followed: ${bp.title}`);
  }

  const verdict = isOptimalSchema
    ? 'This schema follows most PostgreSQL best practices and is well-designed. Minor improvements are possible.'
    : score >= 75
    ? 'This schema has a solid foundation but has notable issues that should be addressed before production scale.'
    : score >= 60
    ? 'This schema has significant design issues that will cause performance, integrity, or maintenance problems at scale.'
    : 'This schema requires substantial redesign. Critical issues present could cause data loss or application failures.';

  const report: SchemaAdvisorReport = {
    snapshotId: snapshot.snapshotId,
    databaseName: snapshot.database.name,
    analyzedAt: new Date().toISOString(),
    overallScore: score,
    overallGrade: grade,
    summary: {
      totalTables: tables.length,
      totalColumns: tables.reduce((sum, t) => sum + (t.columns?.length || 0), 0),
      totalIndexes: tables.reduce((sum, t) => sum + (t.indexes?.length || 0), 0),
      totalForeignKeys: tables.reduce((sum, t) => sum + (t.foreignKeys?.length || 0), 0),
      pitfallsFound: pitfalls.length,
      bestPracticesFollowed: bpFollowed,
      bestPracticesTotal: bestPractices.length,
      normalFormViolations: nfViolations,
    },
    normalFormAnalysis,
    pitfalls,
    bestPractices,
    tableImprovements,
    isOptimalSchema,
    optimality: {
      verdict,
      strengths,
      weaknesses,
    },
  };

  logger.info('Schema advisor analysis completed', {
    snapshotId,
    score,
    grade,
    pitfallsFound: pitfalls.length,
  });

  return report;
};

