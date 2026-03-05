import { Response } from 'express';
import { schemaIngestSchema, compareSchemasSchema } from '../utils/validation';
import { ingestSchema, getLatestSnapshot, getSnapshotById, getAllSnapshots, deleteSnapshot, deleteAllSnapshots } from '../services/schema.service';
import { compareSnapshots } from '../services/comparison.service';
import { analyzeSchema } from '../services/scoring.service';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth.middleware';

export const ingestSchemaController = async (req: AuthRequest, res: Response): Promise<void> => {
  const validated = schemaIngestSchema.parse(req.body);
  const snapshot = await ingestSchema(validated);
  
  await analyzeSchema(snapshot.snapshotId);

  res.status(201).json({
    status: 'success',
    data: {
      snapshotId: snapshot.snapshotId,
      version: snapshot.version,
      databaseId: snapshot.databaseId,
      createdAt: snapshot.createdAt,
    },
  });
};

export const getSchemaController = async (req: AuthRequest, res: Response): Promise<void> => {
  const { dbName } = req.params;
  const snapshot = await getLatestSnapshot(dbName);

  if (!snapshot) {
    throw new AppError('Schema not found', 404);
  }

  res.json({
    status: 'success',
    data: {
      snapshotId: snapshot.snapshotId,
      version: snapshot.version,
      createdAt: snapshot.createdAt,
      tables: snapshot.tables.map((table) => ({
        id: table.id,
        name: table.name,
        schemaName: table.schemaName,
        rowCount: table.rowCount,
        sizeFormatted: table.sizeFormatted,
        columns: table.columns,
        indexes: table.indexes,
        foreignKeys: table.foreignKeys,
      })),
    },
  });
};

export const getSnapshotController = async (req: AuthRequest, res: Response): Promise<void> => {
  const { snapshotId } = req.params;
  const snapshot = await getSnapshotById(snapshotId);

  if (!snapshot) {
    throw new AppError('Snapshot not found', 404);
  }

  res.json({
    status: 'success',
    data: {
      snapshotId: snapshot.snapshotId,
      version: snapshot.version,
      createdAt: snapshot.createdAt,
      tables: snapshot.tables.map((table) => ({
        id: table.id,
        name: table.name,
        schemaName: table.schemaName,
        rowCount: table.rowCount,
        sizeFormatted: table.sizeFormatted,
        columns: table.columns,
        indexes: table.indexes,
        foreignKeys: table.foreignKeys,
      })),
    },
  });
};

export const getAllSnapshotsController = async (req: AuthRequest, res: Response): Promise<void> => {
  const dbName = req.query.dbName as string | undefined;
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;

  const result = await getAllSnapshots(dbName, page, pageSize);

  res.json({
    status: 'success',
    data: result.data.map((snapshot) => ({
      id: snapshot.snapshotId,
      version: snapshot.version,
      databaseName: snapshot.database.name,
      createdAt: snapshot.createdAt,
      tablesCount: snapshot._count.tables,
      issuesCount: snapshot._count.issues,
    })),
    pagination: {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    },
  });
};

export const deleteSnapshotController = async (req: AuthRequest, res: Response): Promise<void> => {
  const { snapshotId } = req.params;
  
  if (!snapshotId) {
    throw new AppError('Snapshot ID is required', 400);
  }

  await deleteSnapshot(snapshotId);

  res.json({
    status: 'success',
    message: 'Snapshot deleted successfully',
  });
};

export const deleteAllSnapshotsController = async (req: AuthRequest, res: Response): Promise<void> => {
  const dbName = req.query.dbName as string | undefined;

  const result = await deleteAllSnapshots(dbName);

  res.json({
    status: 'success',
    message: `Successfully deleted ${result.deletedCount} snapshot(s)`,
    data: result,
  });
};

/** Recursively convert BigInt to number for JSON serialization (Express res.json cannot serialize BigInt). */
function serializeForJson(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (Array.isArray(obj)) return obj.map(serializeForJson);
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = serializeForJson(v);
    return out;
  }
  return obj;
}

export const compareSchemasController = async (req: AuthRequest, res: Response): Promise<void> => {
  const validated = compareSchemasSchema.parse(req.body);
  const comparison = await compareSnapshots(validated.snapshotId1, validated.snapshotId2);

  res.json({
    status: 'success',
    data: serializeForJson(comparison),
  });
};

