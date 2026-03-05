import prisma from '../config/database';
import { logger } from '../utils/logger';

export const compareSnapshots = async (snapshotId1: string, snapshotId2: string) => {
  const [snapshot1, snapshot2] = await Promise.all([
    prisma.schemaSnapshot.findUnique({
      where: { snapshotId: snapshotId1 },
      include: {
        tables: {
          include: {
            columns: true,
            indexes: true,
            foreignKeys: true,
          },
        },
      },
    }),
    prisma.schemaSnapshot.findUnique({
      where: { snapshotId: snapshotId2 },
      include: {
        tables: {
          include: {
            columns: true,
            indexes: true,
            foreignKeys: true,
          },
        },
      },
    }),
  ]);

  if (!snapshot1 || !snapshot2) {
    throw new Error('One or both snapshots not found');
  }

  const tables1 = new Map(snapshot1.tables.map((t) => [`${t.schemaName}.${t.name}`, t]));
  const tables2 = new Map(snapshot2.tables.map((t) => [`${t.schemaName}.${t.name}`, t]));

  const addedTables: any[] = [];
  const removedTables: any[] = [];
  const modifiedTables: any[] = [];

  for (const [key, table2] of tables2) {
    const table1 = tables1.get(key);
    if (!table1) {
      addedTables.push({
        name: table2.name,
        schemaName: table2.schemaName,
        columnCount: table2.columns?.length || 0,
        // Rollback: drop the table that was added in snapshot2
        rollbackSql: `DROP TABLE IF EXISTS "${table2.schemaName}"."${table2.name}";`,
      });
    } else {
      const changes = compareTable(table1, table2);
      if (changes.hasChanges) {
        modifiedTables.push({
          tableName: `${table2.schemaName}.${table2.name}`,
          changes,
          rollbackSql: buildRollbackSql(table2.schemaName, table2.name, changes),
        });
      }
    }
  }

  for (const [key, table1] of tables1) {
    if (!tables2.has(key)) {
      const colDefs = table1.columns
        .map((c: any) => `  "${c.name}" ${c.type}${c.nullable ? '' : ' NOT NULL'}`)
        .join(',\n');
      removedTables.push({
        name: table1.name,
        schemaName: table1.schemaName,
        columnCount: table1.columns?.length || 0,
        // Rollback: recreate the table that was removed in snapshot2
        rollbackSql: `CREATE TABLE IF NOT EXISTS "${table1.schemaName}"."${table1.name}" (\n${colDefs}\n);`,
      });
    }
  }

  logger.info('Schema comparison completed', {
    snapshotId1,
    snapshotId2,
    added: addedTables.length,
    removed: removedTables.length,
    modified: modifiedTables.length,
  });

  return {
    snapshot1: {
      id: snapshot1.snapshotId,
      version: snapshot1.version,
      createdAt: snapshot1.createdAt,
    },
    snapshot2: {
      id: snapshot2.snapshotId,
      version: snapshot2.version,
      createdAt: snapshot2.createdAt,
    },
    addedTables,
    removedTables,
    modifiedTables,
  };
};

const compareTable = (table1: any, table2: any) => {
  const changes: any = {
    hasChanges: false,
    columns: {
      added: [],
      removed: [],
      modified: [],
    },
    indexes: {
      added: [],
      removed: [],
    },
    foreignKeys: {
      added: [],
      removed: [],
    },
  };

  const cols1 = new Map(table1.columns.map((c: any) => [c.name, c]));
  const cols2 = new Map(table2.columns.map((c: any) => [c.name, c]));

  for (const [name, col2] of cols2) {
    const col1 = cols1.get(name);
    if (!col1) {
      changes.columns.added.push({ name: (col2 as any).name, type: (col2 as any).type, nullable: (col2 as any).nullable });
      changes.hasChanges = true;
    } else {
      const col1Typed = col1 as { name: string; type: string; nullable: boolean };
      const col2Typed = col2 as { name: string; type: string; nullable: boolean };
      
      // Check for type changes (including size changes)
      const typeChanged = col1Typed.type !== col2Typed.type;
      const nullableChanged = col1Typed.nullable !== col2Typed.nullable;
      
      if (typeChanged || nullableChanged) {
        // Detect if it's a size-only change (same base type, different size/precision)
        const baseType1 = col1Typed.type.replace(/\([^)]*\)/g, '').toLowerCase().trim();
        const baseType2 = col2Typed.type.replace(/\([^)]*\)/g, '').toLowerCase().trim();
        const isSizeOnlyChange = typeChanged && baseType1 === baseType2;
        
        changes.columns.modified.push({
          name: col1Typed.name,
          from: { type: col1Typed.type, nullable: col1Typed.nullable },
          to: { type: col2Typed.type, nullable: col2Typed.nullable },
          changeType: isSizeOnlyChange ? 'size' : nullableChanged && !typeChanged ? 'nullable' : 'type',
        });
        changes.hasChanges = true;
      }
    }
  }

  for (const [name, col1] of cols1) {
    if (!cols2.has(name)) {
      changes.columns.removed.push({ name: (col1 as any).name, type: (col1 as any).type, nullable: (col1 as any).nullable });
      changes.hasChanges = true;
    }
  }

  const idx1 = new Set(table1.indexes.map((i: any) => i.name));
  const idx2 = new Set(table2.indexes.map((i: any) => i.name));

  for (const idxName of idx2) {
    if (!idx1.has(idxName)) {
      const idx = table2.indexes.find((i: any) => i.name === idxName);
      changes.indexes.added.push({ name: idxName, columns: idx?.columns || [] });
      changes.hasChanges = true;
    }
  }

  for (const idxName of idx1) {
    if (!idx2.has(idxName)) {
      const idx = table1.indexes.find((i: any) => i.name === idxName);
      changes.indexes.removed.push({ name: idxName, columns: idx?.columns || [] });
      changes.hasChanges = true;
    }
  }

  const fk1 = new Set(table1.foreignKeys.map((fk: any) => fk.name));
  const fk2 = new Set(table2.foreignKeys.map((fk: any) => fk.name));

  for (const fkName of fk2) {
    if (!fk1.has(fkName)) {
      const fk = table2.foreignKeys.find((f: any) => f.name === fkName);
      changes.foreignKeys.added.push({ name: fkName, columnName: fk?.columnName });
      changes.hasChanges = true;
    }
  }

  for (const fkName of fk1) {
    if (!fk2.has(fkName)) {
      const fk = table1.foreignKeys.find((f: any) => f.name === fkName);
      changes.foreignKeys.removed.push({ name: fkName, columnName: fk?.columnName });
      changes.hasChanges = true;
    }
  }

  return changes;
};

/**
 * Build rollback SQL for a modified table.
 * Rolling back means reverting snapshot2 → snapshot1.
 */
const buildRollbackSql = (schemaName: string, tableName: string, changes: any): string[] => {
  const sqls: string[] = [];
  const q = `"${schemaName}"."${tableName}"`;

  // Rollback added columns → DROP them
  for (const col of changes.columns.added || []) {
    sqls.push(`ALTER TABLE ${q} DROP COLUMN IF EXISTS "${col.name}";`);
  }

  // Rollback removed columns → ADD them back
  for (const col of changes.columns.removed || []) {
    const nullStr = col.nullable ? '' : ' NOT NULL';
    sqls.push(`ALTER TABLE ${q} ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}${nullStr};`);
  }

  // Rollback modified columns → revert to old type/nullability
  for (const col of changes.columns.modified || []) {
    const nullStr = col.from.nullable ? 'DROP NOT NULL' : 'SET NOT NULL';
    sqls.push(`ALTER TABLE ${q} ALTER COLUMN "${col.name}" TYPE ${col.from.type} USING "${col.name}"::${col.from.type};`);
    sqls.push(`ALTER TABLE ${q} ALTER COLUMN "${col.name}" ${nullStr};`);
  }

  // Rollback added indexes → DROP them
  for (const idx of changes.indexes.added || []) {
    sqls.push(`DROP INDEX IF EXISTS "${idx.name}";`);
  }

  // Rollback removed indexes → recreate them (best-effort with column info)
  for (const idx of changes.indexes.removed || []) {
    const cols = Array.isArray(idx.columns) ? idx.columns.join('", "') : idx.columns;
    if (cols) {
      sqls.push(`CREATE INDEX IF NOT EXISTS "${idx.name}" ON ${q}("${cols}");`);
    }
  }

  // Rollback added FK constraints → DROP them
  for (const fk of changes.foreignKeys.added || []) {
    sqls.push(`ALTER TABLE ${q} DROP CONSTRAINT IF EXISTS "${fk.name}";`);
  }

  return sqls;
};
