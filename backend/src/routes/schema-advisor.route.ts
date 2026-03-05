import { Router } from 'express';
import {
  getSchemaAdvisorReportController,
  getLatestSchemaAdvisorReportController,
} from '../controllers/schema-advisor.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// GET /api/v1/schema-advisor/snapshot/:snapshotId
// Full schema advisor report for a specific snapshot
router.get('/snapshot/:snapshotId', authenticate, getSchemaAdvisorReportController);

// GET /api/v1/schema-advisor/db/:dbName
// Schema advisor report using the latest snapshot for a database
router.get('/db/:dbName', authenticate, getLatestSchemaAdvisorReportController);

export default router;

