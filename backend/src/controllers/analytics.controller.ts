import { Request, Response } from 'express';
import { createDbPool, parseConnectionString } from '../utils/db-connection';

// Helper to safely escape SQL identifiers
function escapeIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

interface AnalyticsRequest extends Request {
  body: {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    table?: string;
    column?: string;
    dateColumn?: string;
    categoryColumn?: string;
    metricColumn?: string;
    limit?: number;
    startDate?: string;
    endDate?: string;
  };
}

/**
 * Get database schema (tables and columns)
 */
export const getSchemaController = async (req: AnalyticsRequest, res: Response) => {
  try {
    const { connectionString, host, port, database, user, password } = req.body;

    if (!connectionString && (!host || !database || !user || !password)) {
      return res.status(400).json({
        status: 'error',
        message: 'Connection string or individual connection parameters required',
      });
    }

    const config = connectionString
      ? parseConnectionString(connectionString)
      : {
          host: host!,
          port: port || 5432,
          database: database!,
          user: user!,
          password: password!,
        };

    const pool = createDbPool(config);

    try {
      // Get all tables
      const tablesResult = await pool.query(`
        SELECT 
          table_schema,
          table_name,
          (SELECT COUNT(*) 
           FROM information_schema.columns 
           WHERE table_schema = t.table_schema 
           AND table_name = t.table_name) as column_count
        FROM information_schema.tables t
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name
      `);

      const tables = await Promise.all(
        tablesResult.rows.map(async (table) => {
          // Get columns for each table
          const columnsResult = await pool.query(
            `
            SELECT 
              column_name,
              data_type,
              is_nullable,
              column_default,
              character_maximum_length,
              numeric_precision,
              numeric_scale
            FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2
            ORDER BY ordinal_position
          `,
            [table.table_schema, table.table_name]
          );

          const columns = columnsResult.rows.map((col) => ({
            name: col.column_name,
            type: col.data_type,
            nullable: col.is_nullable === 'YES',
            defaultValue: col.column_default,
            maxLength: col.character_maximum_length,
            precision: col.numeric_precision,
            scale: col.numeric_scale,
            // Detect column type for analytics
            isDate: ['date', 'timestamp', 'timestamp without time zone', 'timestamp with time zone'].includes(
              col.data_type.toLowerCase()
            ),
            isNumeric: ['integer', 'bigint', 'smallint', 'decimal', 'numeric', 'real', 'double precision'].includes(
              col.data_type.toLowerCase()
            ),
            isText: ['character varying', 'varchar', 'text', 'char'].includes(col.data_type.toLowerCase()),
          }));

          return {
            schema: table.table_schema,
            name: table.table_name,
            columnCount: parseInt(table.column_count),
            columns,
          };
        })
      );

      await pool.end();

      return res.json({
        status: 'success',
        data: {
          tables,
        },
      });
    } catch (error: any) {
      await pool.end();
      throw error;
    }
  } catch (error: any) {
    console.error('Error fetching schema:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch database schema',
    });
  }
};

/**
 * Get summary metrics (counts, totals, averages)
 */
export const getMetricsController = async (req: AnalyticsRequest, res: Response) => {
  try {
    const { connectionString, host, port, database, user, password, table, metricColumn } = req.body;

    if (!table) {
      return res.status(400).json({
        status: 'error',
        message: 'Table name is required',
      });
    }

    const config = connectionString
      ? parseConnectionString(connectionString)
      : {
          host: host!,
          port: port || 5432,
          database: database!,
          user: user!,
          password: password!,
        };

    const pool = createDbPool(config);

    try {
      const schema = 'public'; // Default schema, could be made configurable
      // Use parameterized query with identifier escaping
      const countResult = await pool.query(
        `SELECT COUNT(*) as count FROM ${escapeIdentifier(schema)}.${escapeIdentifier(table)}`
      );
      const rowCount = parseInt(countResult.rows[0].count);

      const metrics: any = {
        rowCount,
      };

      // If metric column is provided, calculate aggregations
      if (metricColumn) {
        const safeColumn = escapeIdentifier(metricColumn);
        const safeTable = `${escapeIdentifier(schema)}.${escapeIdentifier(table)}`;
        const numericMetrics = await pool.query(`
          SELECT 
            COUNT(*) as count,
            SUM(${safeColumn}) as total,
            AVG(${safeColumn}) as average,
            MIN(${safeColumn}) as min,
            MAX(${safeColumn}) as max
          FROM ${safeTable}
          WHERE ${safeColumn} IS NOT NULL
        `);

        if (numericMetrics.rows[0]) {
          metrics.metric = {
            count: parseInt(numericMetrics.rows[0].count),
            total: parseFloat(numericMetrics.rows[0].total || 0),
            average: parseFloat(numericMetrics.rows[0].average || 0),
            min: parseFloat(numericMetrics.rows[0].min || 0),
            max: parseFloat(numericMetrics.rows[0].max || 0),
          };
        }
      }

      await pool.end();

      return res.json({
        status: 'success',
        data: metrics,
      });
    } catch (error: any) {
      await pool.end();
      throw error;
    }
  } catch (error: any) {
    console.error('Error fetching metrics:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch metrics',
    });
  }
};

/**
 * Get time-series data
 */
export const getTimeSeriesController = async (req: AnalyticsRequest, res: Response) => {
  try {
    const {
      connectionString,
      host,
      port,
      database,
      user,
      password,
      table,
      dateColumn,
      metricColumn,
      startDate,
      endDate,
    } = req.body;

    if (!table || !dateColumn) {
      return res.status(400).json({
        status: 'error',
        message: 'Table name and date column are required',
      });
    }

    const config = connectionString
      ? parseConnectionString(connectionString)
      : {
          host: host!,
          port: port || 5432,
          database: database!,
          user: user!,
          password: password!,
        };

    const pool = createDbPool(config);

    try {
      const schema = 'public';
      const safeTable = `${escapeIdentifier(schema)}.${escapeIdentifier(table)}`;
      const safeDateColumn = escapeIdentifier(dateColumn);

      let query = '';

      // Detect date type and format accordingly
      await pool.query(
        `
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_schema = $1 
        AND table_name = $2 
        AND column_name = $3
      `,
        [schema, table, dateColumn]
      );

      if (metricColumn) {
        const safeMetricColumn = escapeIdentifier(metricColumn);
        query = `
          SELECT 
            DATE(${safeDateColumn}) as date,
            COUNT(*) as count,
            SUM(${safeMetricColumn}) as total,
            AVG(${safeMetricColumn}) as average
          FROM ${safeTable}
          WHERE ${safeDateColumn} IS NOT NULL
        `;
      } else {
        query = `
          SELECT 
            DATE(${safeDateColumn}) as date,
            COUNT(*) as count
          FROM ${safeTable}
          WHERE ${safeDateColumn} IS NOT NULL
        `;
      }

      if (startDate) {
        query += ` AND ${safeDateColumn} >= $1::date`;
      }
      if (endDate) {
        query += startDate ? ` AND ${safeDateColumn} <= $2::date` : ` AND ${safeDateColumn} <= $1::date`;
      }

      query += ` GROUP BY DATE(${safeDateColumn}) ORDER BY date`;

      const params: any[] = [];
      if (startDate) params.push(startDate);
      if (endDate) params.push(endDate);

      const result = await pool.query(query, params.length > 0 ? params : undefined);

      await pool.end();

      return res.json({
        status: 'success',
        data: result.rows.map((row) => ({
          date: row.date,
          count: parseInt(row.count),
          total: row.total ? parseFloat(row.total) : undefined,
          average: row.average ? parseFloat(row.average) : undefined,
        })),
      });
    } catch (error: any) {
      await pool.end();
      throw error;
    }
  } catch (error: any) {
    console.error('Error fetching time series:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch time series data',
    });
  }
};

/**
 * Get category distribution
 */
export const getDistributionController = async (req: AnalyticsRequest, res: Response) => {
  try {
    const { connectionString, host, port, database, user, password, table, categoryColumn, limit = 10 } = req.body;

    if (!table || !categoryColumn) {
      return res.status(400).json({
        status: 'error',
        message: 'Table name and category column are required',
      });
    }

    const config = connectionString
      ? parseConnectionString(connectionString)
      : {
          host: host!,
          port: port || 5432,
          database: database!,
          user: user!,
          password: password!,
        };

    const pool = createDbPool(config);

    try {
      const schema = 'public';
      const safeTable = `${escapeIdentifier(schema)}.${escapeIdentifier(table)}`;
      const safeCategoryColumn = escapeIdentifier(categoryColumn);

      const result = await pool.query(
        `
        SELECT 
          ${safeCategoryColumn} as category,
          COUNT(*) as count
        FROM ${safeTable}
        WHERE ${safeCategoryColumn} IS NOT NULL
        GROUP BY ${safeCategoryColumn}
        ORDER BY count DESC
        LIMIT $1
      `,
        [limit]
      );

      await pool.end();

      return res.json({
        status: 'success',
        data: result.rows.map((row) => ({
          category: row.category,
          count: parseInt(row.count),
        })),
      });
    } catch (error: any) {
      await pool.end();
      throw error;
    }
  } catch (error: any) {
    console.error('Error fetching distribution:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch distribution data',
    });
  }
};

/**
 * Get top-N entities
 */
export const getTopNController = async (req: AnalyticsRequest, res: Response) => {
  try {
    const {
      connectionString,
      host,
      port,
      database,
      user,
      password,
      table,
      column,
      metricColumn,
      limit = 10,
    } = req.body;

    if (!table || !column) {
      return res.status(400).json({
        status: 'error',
        message: 'Table name and column are required',
      });
    }

    const config = connectionString
      ? parseConnectionString(connectionString)
      : {
          host: host!,
          port: port || 5432,
          database: database!,
          user: user!,
          password: password!,
        };

    const pool = createDbPool(config);

    try {
      const schema = 'public';
      const safeTable = `${escapeIdentifier(schema)}.${escapeIdentifier(table)}`;
      const safeColumn = escapeIdentifier(column);

      let query = '';
      if (metricColumn) {
        const safeMetricColumn = escapeIdentifier(metricColumn);
        query = `
          SELECT 
            ${safeColumn} as entity,
            COUNT(*) as count,
            SUM(${safeMetricColumn}) as total,
            AVG(${safeMetricColumn}) as average
          FROM ${safeTable}
          WHERE ${safeColumn} IS NOT NULL
          GROUP BY ${safeColumn}
          ORDER BY total DESC
          LIMIT $1
        `;
      } else {
        query = `
          SELECT 
            ${safeColumn} as entity,
            COUNT(*) as count
          FROM ${safeTable}
          WHERE ${safeColumn} IS NOT NULL
          GROUP BY ${safeColumn}
          ORDER BY count DESC
          LIMIT $1
        `;
      }

      const result = await pool.query(query, [limit]);

      await pool.end();

      return res.json({
        status: 'success',
        data: result.rows.map((row) => ({
          entity: row.entity,
          count: parseInt(row.count),
          total: row.total ? parseFloat(row.total) : undefined,
          average: row.average ? parseFloat(row.average) : undefined,
        })),
      });
    } catch (error: any) {
      await pool.end();
      throw error;
    }
  } catch (error: any) {
    console.error('Error fetching top N:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch top N data',
    });
  }
};
