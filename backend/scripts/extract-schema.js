/**
 * PostgreSQL Schema Extractor
 * 
 * Extracts schema metadata from a PostgreSQL database and outputs JSON
 * in the format required by the Schema Intelligence backend.
 * 
 * Usage:
 *   node extract-schema.js
 * 
 * Set environment variables:
 *   DB_HOST=localhost
 *   DB_PORT=5432
 *   DB_NAME=your_database
 *   DB_USER=your_username
 *   DB_PASSWORD=your_password
 *   OUTPUT_FILE=schema.json (optional, defaults to schema.json)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');
const fs = require('fs');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};

const outputFile = process.env.OUTPUT_FILE || 'schema.json';

if (!config.database || !config.user) {
  console.error('Error: DB_NAME and DB_USER environment variables are required');
  console.error('\nUsage:');
  console.error('  DB_HOST=localhost DB_PORT=5432 DB_NAME=mydb DB_USER=myuser DB_PASSWORD=mypass node extract-schema.js');
  process.exit(1);
}

const client = new Client(config);

async function extractSchema() {
  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected successfully');

    const dbName = config.database;

    // Get all tables
    console.log('Extracting tables...');
    const tablesResult = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name
    `);

    const tables = [];

    for (const table of tablesResult.rows) {
      console.log(`  Processing table: ${table.table_schema}.${table.table_name}`);

      // Get columns with full type information including size/precision
      const columnsResult = await client.query(`
        SELECT 
          column_name,
          data_type,
          udt_name,
          character_maximum_length,
          numeric_precision,
          numeric_scale,
          datetime_precision,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [table.table_schema, table.table_name]);

      // Get primary keys
      const pkResult = await client.query(`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = $1
        AND tc.table_name = $2
        AND tc.constraint_type = 'PRIMARY KEY'
      `, [table.table_schema, table.table_name]);

      const primaryKeys = new Set(pkResult.rows.map(r => r.column_name));

      // Get indexes
      const indexesResult = await client.query(`
        SELECT 
          i.indexname,
          i.indexdef,
          ix.indisunique
        FROM pg_indexes i
        JOIN pg_class c ON c.relname = i.tablename
        JOIN pg_index ix ON ix.indexrelid = (
          SELECT oid FROM pg_class WHERE relname = i.indexname
        )
        WHERE i.schemaname = $1 AND i.tablename = $2
      `, [table.table_schema, table.table_name]);

      // Get foreign keys
      const fkResult = await client.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_schema AS referenced_schema,
          ccu.table_name AS referenced_table,
          ccu.column_name AS referenced_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu 
        ON ccu.constraint_name = tc.constraint_name
        WHERE tc.table_schema = $1
        AND tc.table_name = $2
        AND tc.constraint_type = 'FOREIGN KEY'
      `, [table.table_schema, table.table_name]);

      // Get row count
      let rowCount = 0;
      try {
        const countResult = await client.query(`
          SELECT COUNT(*)::bigint as count
          FROM ${client.escapeIdentifier(table.table_schema)}.${client.escapeIdentifier(table.table_name)}
        `);
        rowCount = parseInt(countResult.rows[0].count);
      } catch (err) {
        console.warn(`    Warning: Could not get row count for ${table.table_schema}.${table.table_name}`);
      }

      // Get table size
      let sizeBytes = null;
      let sizeFormatted = null;
      try {
        const sizeResult = await client.query(`
          SELECT 
            pg_total_relation_size($1::regclass) as size_bytes
        `, [`${table.table_schema}.${table.table_name}`]);
        sizeBytes = parseInt(sizeResult.rows[0].size_bytes);
        sizeFormatted = formatBytes(sizeBytes);
      } catch (err) {
        // Ignore size errors
      }

      // Build column type string with full precision/size information
      const buildColumnType = (col) => {
        let type = col.data_type;
        
        // Handle character types (VARCHAR, CHAR, TEXT variants)
        if (col.character_maximum_length !== null && col.character_maximum_length !== undefined) {
          type += `(${col.character_maximum_length})`;
        }
        // Handle numeric types (NUMERIC, DECIMAL, INTEGER variants with precision/scale)
        else if (col.numeric_precision !== null && col.numeric_precision !== undefined) {
          if (col.numeric_scale !== null && col.numeric_scale !== undefined && col.numeric_scale > 0) {
            type += `(${col.numeric_precision},${col.numeric_scale})`;
          } else {
            type += `(${col.numeric_precision})`;
          }
        }
        // Handle datetime types with precision (TIMESTAMP(6), TIME(3), etc.)
        else if (col.datetime_precision !== null && col.datetime_precision !== undefined && col.datetime_precision > 0) {
          type += `(${col.datetime_precision})`;
        }
        
        return type;
      };

      const columns = columnsResult.rows.map(col => {
        const isPK = primaryKeys.has(col.column_name);
        const fk = fkResult.rows.find(f => f.column_name === col.column_name);
        return {
          name: col.column_name,
          type: buildColumnType(col),
          nullable: col.is_nullable === 'YES',
          defaultValue: col.column_default,
          isPrimaryKey: isPK,
          isForeignKey: !!fk,
        };
      });

      // Parse index columns from indexdef
      const parseIndexColumns = (indexdef) => {
        const match = indexdef.match(/\(([^)]+)\)/);
        if (match) {
          return match[1].split(',').map(c => c.trim().replace(/"/g, ''));
        }
        return [];
      };

      const indexes = indexesResult.rows.map(idx => ({
        name: idx.indexname,
        columns: parseIndexColumns(idx.indexdef),
        unique: idx.indisunique,
        type: 'btree',
      }));

      const foreignKeys = fkResult.rows.map(fk => ({
        name: fk.constraint_name,
        columnName: fk.column_name,
        referencedTable: fk.referenced_table,
        referencedColumn: fk.referenced_column,
      }));

      tables.push({
        name: table.table_name,
        schemaName: table.table_schema,
        rowCount: rowCount || undefined,
        sizeBytes: sizeBytes || undefined,
        sizeFormatted: sizeFormatted || undefined,
        columns,
        indexes,
        foreignKeys,
      });
    }

    const schema = {
      databaseName: dbName,
      databaseType: 'postgresql',
      tables: tables,
    };

    const outputPath = path.resolve(outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));
    console.log(`\n✅ Schema extracted successfully!`);
    console.log(`📄 Output file: ${outputPath}`);
    console.log(`📊 Tables extracted: ${tables.length}`);
    console.log(`\nNext steps:`);
    console.log(`1. Go to the Databases page in the app`);
    console.log(`2. Upload the file: ${outputFile}`);
    console.log(`3. Or paste the JSON content directly`);

  } catch (error) {
    console.error('Error extracting schema:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

extractSchema();

