import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { env } from './config/env';
import healthRoutes from './routes/health.route';
import authRoutes from './routes/auth.route';
import schemaRoutes from './routes/schema.route';
import impactRoutes from './routes/impact.route';
import recommendationRoutes from './routes/recommendation.route';
import assistantRoutes from './routes/assistant.route';
import analyticsRoutes from './routes/analytics.route';
import conversationRoutes from './routes/conversation.route';
import schemaAdvisorRoutes from './routes/schema-advisor.route';
import { errorHandler } from './middleware/errorHandler';

const app: Express = express();

app.use(cors({
  origin: env.corsOrigin,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/v1/schema', schemaRoutes);
app.use('/api/v1/impact', impactRoutes);
app.use('/api/v1/recommendations', recommendationRoutes);
app.use('/api/v1/assistant', assistantRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/conversations', conversationRoutes);
app.use('/api/v1/schema-advisor', schemaAdvisorRoutes);

// Root route - API information
app.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Schema Intelligence API',
    version: '1.0.0',
    info: 'Visit any endpoint base path (e.g., /api/auth, /api/v1/schema/info) to see available sub-routes',
    endpoints: {
      health: '/api/health/health',
      auth: {
        base: '/api/auth',
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
      },
      schema: {
        base: '/api/v1/schema/info',
        note: 'Most endpoints require authentication',
      },
      impact: {
        base: '/api/v1/impact',
        note: 'All endpoints require authentication',
      },
      recommendations: {
        base: '/api/v1/recommendations',
        note: 'All endpoints require authentication',
      },
      assistant: {
        base: '/api/v1/assistant',
        note: 'All endpoints require authentication',
      },
      analytics: {
        base: '/api/v1/analytics',
        note: 'All endpoints require authentication',
      },
    },
    note: 'Access any base path (e.g., /api/auth) to see detailed endpoint information and examples.',
  });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
  });
});

app.use(errorHandler);

export default app;

