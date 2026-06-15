import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import router from './routes';
import { logger } from './utils/logger';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Disable X-Powered-By header for security
app.disable('x-powered-by');

// Load routes
app.use('/', router);

// 404 handler — must be after all routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler — must be last middleware (4 params)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ success: false, message: 'Internal server error' });
});

export default app;
