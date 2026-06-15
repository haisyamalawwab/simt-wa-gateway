# SIMT WA Gateway — Development Report

**Tanggal**: 15 Juni 2026  
**Versi**: 1.0.0  
**Status**: ✅ Aktif Dikembangkan

---

## 1. Ringkasan Proyek

**SIMT WA Gateway** adalah WhatsApp Multi-Session Gateway berbasis [Baileys](https://github.com/WhiskeySockets/Baileys) dan Express.js yang memungkinkan banyak tenant/klien menggunakan satu instance gateway untuk mengirim dan menerima pesan WhatsApp secara independen.

### Stack Teknologi

| Layer | Teknologi |
|---|---|
| Runtime | Node.js 20 (Alpine) |
| Language | TypeScript 5.4 |
| Framework | Express.js 4.19 |
| WA Library | @whiskeysockets/baileys 6.6 |
| Logger | Pino 9.1 + pino-pretty (dev) |
| QR Code | qrcode 1.5 |
| Serverless | serverless-http 4.0 |
| Container | Docker (multi-stage build) |

---

## 2. Pekerjaan yang Telah Diselesaikan

### 2.1 Containerisasi (Docker)

- ✅ Dibuat `Dockerfile` dengan **multi-stage build** (builder + runtime)
- ✅ Dibuat `.dockerignore` untuk mengecualikan `node_modules`, `dist`, `sessions`, `.env`, dll
- Image berbasis `node:20-alpine` — minimal dan ringan
- Port expose: **8081**

```dockerfile
FROM node:20-alpine AS builder   # Build stage
FROM node:20-alpine              # Runtime stage (tanpa devDependencies)
```

---

### 2.2 Modularisasi Codebase

Kode monolitik `src/index.ts` (375 baris) dipecah menjadi arsitektur modular:

```
src/
├── index.ts              — Bootstrap: dotenv, listen, restoreSessions
├── app.ts                — Express app factory (cors, json, routes, error handler)
├── config.ts             — Environment variables & constants
├── types.ts              — TypeScript interfaces (Session)
├── middlewares/
│   └── auth.ts           — API Key authentication middleware
├── routes/
│   └── index.ts          — Semua REST API route definitions
├── services/
│   └── whatsapp.ts       — Baileys session management (start/stop/send/restore)
└── utils/
    ├── logger.ts          — Pino logger instance (env-aware)
    └── webhook.ts         — Laravel callback trigger via axios
```

**Hasil**: Build TypeScript berhasil tanpa error (`tsc`).

---

### 2.3 Persiapan Deploy Vercel & Netlify

- ✅ Dibuat `vercel.json` — routing semua request ke `src/app.ts` via `@vercel/node`
- ✅ Dibuat `netlify.toml` — build config + redirect rules ke Netlify Functions
- ✅ Dibuat `netlify/functions/api.ts` — handler `serverless-http` wrapping Express app
- ✅ Dipisahkan `src/app.ts` (Express app) dari `src/index.ts` (server listen) agar bisa diimport serverless tanpa menjalankan server

> **Catatan**: Platform serverless tidak direkomendasikan untuk produksi karena WebSocket Baileys dan filesystem sesi bersifat ephemeral. Gunakan Railway/Render/Fly.io/VPS untuk produksi.

---

### 2.4 Code Review & Bug Fixes

Ditemukan dan diperbaiki **10 masalah**:

| # | Severity | File | Masalah | Perbaikan |
|---|---|---|---|---|
| 1 | 🔴 Bug | `whatsapp.ts` | `require('qrcode')` blocking di async | Ganti `import` + `await QRCode.toDataURL()` |
| 2 | 🔴 Bug | `whatsapp.ts` | `(logger as any).warn` type casting palsu | Gunakan `logger.warn()` langsung |
| 3 | 🔴 Bug | `whatsapp.ts` | `__dirname` tidak reliable di serverless | Ganti dengan `process.cwd()` |
| 4 | 🟡 Design | `whatsapp.ts` | Tidak ada fungsi `stopSession()` terpusat | Tambah `stopSession()` di service layer |
| 5 | 🟡 Design | `routes/index.ts` | Import `path`/`fs` tidak tepat di route layer | Hapus, delegasi ke `stopSession()` |
| 6 | 🟡 Design | `config.ts` | `dotenv.config()` di modul konfigurasi | Pindahkan ke `index.ts` (entrypoint) |
| 7 | 🟡 Quality | `logger.ts` | Log level `info` hardcoded | `debug`+pino-pretty (dev), `info` (prod) |
| 8 | 🟡 Security | `app.ts` | Tidak ada error handler & body size limit | Tambah 404, global error handler, `1mb` limit, disable `x-powered-by` |
| 9 | 🟢 DX | `package.json` | `@types/qrcode` tidak terinstall | Install `@types/qrcode` |
| 10 | 🟢 DX | `package.json` | `pino-pretty` tidak ada | Install `pino-pretty` sebagai devDependency |

---

### 2.5 Environment Variables

Berkas `.env.example` diperbarui dan `.env` lokal dibuat:

```env
# Server
PORT=8081                     # Opsional di Vercel/Netlify

# Authentication
WA_GATEWAY_API_KEY=...        # API Key buatan sendiri (generate via crypto.randomBytes)

# Webhook Callback
LARAVEL_WEBHOOK_URL=...       # URL endpoint Laravel penerima callback
WA_CALLBACK_SECRET=...        # Secret header X-Callback-Secret untuk validasi
```

**Cara generate API Key yang aman:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 3. Arsitektur Multi-Tenant

Gateway ini **sudah mendukung** banyak nomor WhatsApp sekaligus:

```
Gateway Server (1 instance)
├── sessions["tenant-A"]  →  WA nomor 0812-xxxx
├── sessions["tenant-B"]  →  WA nomor 0813-xxxx
└── sessions["tenant-C"]  →  WA nomor 0821-xxxx
```

### REST API Endpoints

| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| GET | `/api/health` | ❌ | Health check |
| POST | `/api/tenant` | ✅ | Daftarkan tenant |
| POST | `/api/tenant/:id/session/start` | ✅ | Mulai sesi WA + generate QR |
| GET | `/api/tenant/:id/session/qr` | ✅ | Ambil QR code |
| GET | `/api/tenant/:id/session/status` | ✅ | Cek status koneksi |
| POST | `/api/tenant/:id/session/stop` | ✅ | Putuskan sesi WA |
| POST | `/api/tenant/:id/send` | ✅ | Kirim pesan via tenant |
| POST | `/send` | ✅ | Alias kirim pesan (Laravel Job format) |

---

## 4. Rencana Pengembangan Selanjutnya

### 4.1 Database Logging (Prisma ORM) — 📋 Planned
> Lihat: `DEV_DOCS/003_database_logging_prisma.md`

Akan menyimpan semua log dan aktivitas ke database:

| Tabel | Isi |
|---|---|
| `tenants` | Metadata tenant terdaftar |
| `session_logs` | Event koneksi WA (connected, disconnected, qr) |
| `message_logs` | Pesan terkirim & masuk |
| `webhook_logs` | Hasil callback ke Laravel |
| `api_request_logs` | Semua request API masuk |

**Database Support**:
- Lokal/Docker: SQLite (`file:./database.db`)
- Cloud: PostgreSQL via Supabase / Neon / Aiven

---

## 5. Catatan Penting

> [!WARNING]
> Penggunaan Baileys melanggar **Terms of Service WhatsApp**. Nomor WhatsApp berisiko di-ban permanen. Untuk penggunaan produksi bisnis, gunakan **WhatsApp Business Cloud API** resmi dari Meta.

> [!NOTE]
> Platform serverless (Vercel/Netlify) **tidak direkomendasikan** untuk gateway ini di production. Gunakan platform yang mendukung long-running process dan persistent filesystem:
> - Railway · Render · Fly.io · Heroku · DigitalOcean App Platform · VPS

---

## 6. File Index

```
simt-wa-gateway/
├── src/
│   ├── index.ts                    — Entrypoint server
│   ├── app.ts                      — Express factory
│   ├── config.ts                   — Konfigurasi environment
│   ├── types.ts                    — TypeScript types
│   ├── middlewares/auth.ts         — Auth middleware
│   ├── routes/index.ts             — API routes
│   ├── services/whatsapp.ts        — WA session manager
│   └── utils/
│       ├── logger.ts               — Pino logger
│       └── webhook.ts              — Webhook caller
├── netlify/functions/api.ts        — Netlify function handler
├── DEV_DOCS/
│   ├── 001_implementation_plan.md  — Modularisasi
│   ├── 002_deploy_vercel_netlify.md — Deployment serverless
│   ├── 003_database_logging_prisma.md — Database logging plan
│   └── 004_dev_report.md           — Dokumen ini
├── Dockerfile                      — Multi-stage Docker build
├── .dockerignore
├── vercel.json                     — Vercel routing config
├── netlify.toml                    — Netlify build & redirect config
├── .env                            — Environment lokal (tidak di-commit)
├── .env.example                    — Template environment
├── .gitignore
├── package.json
└── tsconfig.json
```
