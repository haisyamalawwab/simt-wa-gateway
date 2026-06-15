import dotenv from 'dotenv';

// Load .env before anything else — must be first import side-effect
dotenv.config();

import { PORT } from './config';
import { logger } from './utils/logger';
import { restoreSessions } from './services/whatsapp';
import app from './app';

// Auto-initialize existing sessions from disk on startup
restoreSessions();

app.listen(PORT, () => {
  logger.info(`[SIMT WA GATEWAY] Server is running on port ${PORT}`);
});
