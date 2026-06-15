import pino from 'pino';
import { IS_DEV } from '../config';

export const logger = pino({
  level: IS_DEV ? 'debug' : 'info',
  ...(IS_DEV && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true }
    }
  })
});
