import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  ConnectionState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';
import pino from 'pino';
import QRCode from 'qrcode';
import { Session } from '../types';
import { logger } from '../utils/logger';
import { triggerWebhook } from '../utils/webhook';

export const sessions = new Map<string, Session>();

export async function startSession(tenantId: string, force = false): Promise<Session> {
  if (sessions.has(tenantId) && !force) {
    const existing = sessions.get(tenantId)!;
    if (existing.status === 'CONNECTED' || existing.status === 'CONNECTING') {
      return existing;
    }
  }

  const sessionDir = path.join(process.cwd(), 'sessions', tenantId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  let version: [number, number, number] | undefined;
  try {
    const fetched = await fetchLatestBaileysVersion();
    version = fetched.version;
  } catch (err) {
    logger.error({ err }, `Failed to fetch latest Baileys version for ${tenantId}`);
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const socket = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  const sessionObj: Session = {
    id: tenantId,
    socket,
    status: 'CONNECTING',
  };
  sessions.set(tenantId, sessionObj);

  socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      sessionObj.status = 'QR_READY';
      try {
        sessionObj.qr = await QRCode.toDataURL(qr);
      } catch (err) {
        logger.error({ err }, `Failed to generate QR code for ${tenantId}`);
      }
      logger.info(`Session ${tenantId}: QR Code generated.`);
    }

    if (connection === 'open') {
      sessionObj.status = 'CONNECTED';
      sessionObj.qr = undefined;
      const userJid = socket.user?.id;
      sessionObj.number = userJid ? userJid.split(':')[0] : undefined;
      logger.info(`Session ${tenantId}: Connected successfully as ${sessionObj.number}`);

      triggerWebhook(tenantId, {
        event: 'session_connected',
        status: 'CONNECTED',
        number: sessionObj.number
      });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      logger.warn(`Session ${tenantId}: Connection closed. Reason: ${String(lastDisconnect?.error)}. Reconnecting: ${shouldReconnect}`);

      if (!shouldReconnect) {
        sessionObj.status = 'DISCONNECTED';
        sessionObj.qr = undefined;
        sessionObj.number = undefined;
        sessionObj.socket = undefined;
        sessions.delete(tenantId);
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (e) {
          logger.error({ err: e }, `Failed to delete session dir for ${tenantId}`);
        }
        triggerWebhook(tenantId, { event: 'session_disconnected', status: 'DISCONNECTED' });
      } else {
        sessionObj.status = 'CONNECTING';
        sessionObj.socket = undefined;
        setTimeout(() => {
          logger.info(`Session ${tenantId}: Reconnecting...`);
          startSession(tenantId, true).catch(err => {
            logger.error({ err }, `Error during reconnection for ${tenantId}`);
          });
        }, 5000);
      }
    }
  });

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('messages.upsert', async (m) => {
    if (m.type === 'notify') {
      for (const msg of m.messages) {
        if (!msg.key.fromMe && msg.message) {
          const from = msg.key.remoteJid;
          if (from) {
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            if (text) {
              logger.info(`Session ${tenantId}: Incoming message from ${from}: ${text}`);
              triggerWebhook(tenantId, {
                event: 'message_received',
                from: from.split('@')[0],
                senderName: msg.pushName || '',
                message: text,
                messageId: msg.key.id
              }).catch(err => {
                logger.error({ err }, `Failed to forward incoming message to webhook for tenant ${tenantId}`);
              });
            }
          }
        }
      }
    }
  });

  return sessionObj;
}

export async function stopSession(tenantId: string): Promise<void> {
  const session = sessions.get(tenantId);
  if (!session) return;

  const sessionDir = path.join(process.cwd(), 'sessions', tenantId);

  if (session.socket) {
    await session.socket.logout();
  } else {
    sessions.delete(tenantId);
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (e) {
      logger.error({ err: e }, `Failed to delete session dir for ${tenantId}`);
    }
  }
}

export async function sendMessage(tenantId: string, to: string, text: string, referenceId?: string): Promise<any> {
  const session = sessions.get(tenantId);
  if (!session || session.status !== 'CONNECTED' || !session.socket) {
    throw new Error('WhatsApp session is not connected for this tenant');
  }

  // Normalize phone number to international format with @s.whatsapp.net suffix
  let formattedTo = to.replace(/[^0-9]/g, '');
  if (formattedTo.startsWith('08')) {
    formattedTo = '628' + formattedTo.slice(2);
  }
  if (!formattedTo.endsWith('@s.whatsapp.net')) {
    formattedTo = formattedTo + '@s.whatsapp.net';
  }

  const sentMessage = await session.socket.sendMessage(formattedTo, { text });

  // Asynchronously trigger delivery webhook to close the loop on Laravel side
  if (referenceId) {
    setTimeout(() => {
      triggerWebhook(tenantId, {
        event: 'message_delivered',
        referenceId,
        messageId: sentMessage?.key?.id,
        status: 'delivered'
      });
    }, 1000);
  }

  return sentMessage;
}

export function restoreSessions() {
  const sessionsPath = path.join(process.cwd(), 'sessions');
  if (fs.existsSync(sessionsPath)) {
    const folders = fs.readdirSync(sessionsPath);
    for (const folder of folders) {
      if (fs.statSync(path.join(sessionsPath, folder)).isDirectory()) {
        logger.info(`Auto-restoring session for tenant: ${folder}`);
        startSession(folder).catch(err => {
          logger.error({ err }, `Error auto-restoring session for ${folder}`);
        });
      }
    }
  }
}
