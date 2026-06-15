# Modularization Plan for simt-wa-gateway

Refactor `src/index.ts` from a single monolithic file into a modular structure. This will improve code readability, maintainability, and testability.

## Proposed Changes

We will split the application into the following modules under the `src/` directory:

1. **`src/config.ts`**: Contains environment configurations and defaults.
2. **`src/utils/logger.ts`**: Contains the logger instance (`pino`).
3. **`src/utils/webhook.ts`**: Contains the helper function to send webhook callbacks to Laravel.
4. **`src/types.ts`**: Contains typescript definitions (e.g., `Session`).
5. **`src/services/whatsapp.ts`**: Manages the WhatsApp sessions, Baileys sockets, connections, session restoration, and message sending.
6. **`src/middlewares/auth.ts`**: Contains API Key authentication middleware.
7. **`src/routes/index.ts`**: Defines REST API endpoints and routes.
8. **`src/index.ts`**: Entry point of the application, configuring Express middleware, loading routes, and running the server.

---

### Components

#### [NEW] [config.ts](file:///d:/laragon/www/simt-wa-gateway/src/config.ts)
Will expose:
- `PORT`
- `API_KEY`
- `LARAVEL_WEBHOOK_URL`
- `CALLBACK_SECRET`

#### [NEW] [logger.ts](file:///d:/laragon/www/simt-wa-gateway/src/utils/logger.ts)
Creates and exports the `pino` logger.

#### [NEW] [webhook.ts](file:///d:/laragon/www/simt-wa-gateway/src/utils/webhook.ts)
Contains `triggerWebhook` which posts status updates back to Laravel.

#### [NEW] [types.ts](file:///d:/laragon/www/simt-wa-gateway/src/types.ts)
Declares and exports the `Session` interface.

#### [NEW] [whatsapp.ts](file:///d:/laragon/www/simt-wa-gateway/src/services/whatsapp.ts)
Manages:
- `sessions` Map.
- `startSession` function.
- `sendMessage` function.
- `restoreSessions` (auto-initialize existing sessions from disk on startup).

#### [NEW] [auth.ts](file:///d:/laragon/www/simt-wa-gateway/src/middlewares/auth.ts)
Exposes `authMiddleware` to protect API endpoints.

#### [NEW] [routes.ts](file:///d:/laragon/www/simt-wa-gateway/src/routes/index.ts)
Defines all API routing logic:
- `GET /api/health`
- `POST /api/tenant`
- `POST /api/tenant/:id/session/start`
- `GET /api/tenant/:id/session/qr`
- `GET /api/tenant/:id/session/status`
- `POST /api/tenant/:id/session/stop`
- `POST /api/tenant/:id/send`
- `POST /send`

#### [MODIFY] [index.ts](file:///d:/laragon/www/simt-wa-gateway/src/index.ts)
Will serve as the lightweight app bootstrapper, loading environment variables, initiating routes, starting session auto-restore, and listening on the server port.

---

## Verification Plan

### Automated Tests
- Run `npm run build` to ensure all TypeScript compiles successfully.
- Verify that standard TypeScript type checking is error-free.

### Manual Verification
- Test all API endpoints:
  - `GET /api/health`
  - Auth checks for endpoint access.
  - Verify multi-tenant session connection and webhook triggers (if mock/sandbox env allows).
