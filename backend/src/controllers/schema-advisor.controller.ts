import { Response } from 'express';
import { analyzeSchemaAdvisor } from '../services/schema-advisor.service';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/database';

export const getSchemaAdvisorReportController = async (req: AuthRequest, res: Response): Promise<void> => {
  const { snapshotId } = req.params;

  if (!snapshotId) {
    throw new AppError('Snapshot ID is required', 400);
  }

  const report = await analyzeSchemaAdvisor(snapshotId);

  res.json({
    status: 'success',
    data: report,
  });
};

export const getLatestSchemaAdvisorReportController = async (req: AuthRequest, res: Response): Promise<void> => {
  const { dbName } = req.params;

  if (!dbName) {
    throw new AppError('Database name is required', 400);
  }

  // Find the latest snapshot for this database
  const latestSnapshot = await prisma.schemaSnapshot.findFirst({
    where: {
      database: { name: dbName },
    },
    orderBy: { createdAt: 'desc' },
    select: { snapshotId: true },
  });

  if (!latestSnapshot) {
    throw new AppError(`No snapshots found for database "${dbName}"`, 404);
  }

  const report = await analyzeSchemaAdvisor(latestSnapshot.snapshotId);

  res.json({
    status: 'success',
    data: report,
  });
};

