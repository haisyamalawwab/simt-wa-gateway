# Plan to Prepare Vercel and Netlify Deployment

This plan outlines the steps and configurations required to support deployment on Vercel and Netlify.

> [!WARNING]
> ### ⚠️ Batasan Penting Serverless untuk WhatsApp Gateway
> WhatsApp Gateway berbasis **Baileys** memerlukan:
> 1. **Koneksi WebSocket yang selalu aktif (persistent)** untuk menerima pesan secara *real-time* dan mempertahankan koneksi ke server WhatsApp.
> 2. **Penyimpanan berkas lokal yang persisten** untuk menyimpan sesi login (`sessions/` via `useMultiFileAuthState`).
>
> **Platform Serverless (Vercel & Netlify) memiliki batasan berikut:**
> - **Execution Timeout**: Fungsi API akan mati setelah beberapa detik (ephemeral). Koneksi WebSocket tidak bisa tetap hidup di latar belakang untuk menerima pesan masuk.
> - **Read-Only / Ephemeral Filesystem**: Sesi login yang tersimpan di disk lokal akan hilang setiap kali kontainer serverless melakukan *recycle/restart*. Pengguna harus melakukan pemindaji QR code ulang berulang kali.
>
> **Rekomendasi**: Disarankan menggunakan platform VPS (seperti DigitalOcean, Vultr) atau platform PaaS yang mendukung stateful long-running Node.js (seperti Railway, Render, Fly.io, Heroku) dengan volume penyimpanan persisten.
>
> Rencana di bawah ini disediakan agar aplikasi *bisa berjalan* di Vercel/Netlify untuk kebutuhan pengujian API *statik/on-demand* (misal mengirim pesan dengan inisialisasi koneksi instan).

---

## Proposed Changes

We will introduce deployment configurations, install the adapter for Netlify, and adjust the entrypoint.

### Dependencies
- Install `serverless-http` to bridge Express to Netlify functions.

---

### Components

#### [NEW] [vercel.json](file:///d:/laragon/www/simt-wa-gateway/vercel.json)
Create Vercel configuration to route all traffic to `src/index.ts` using `@vercel/node`.

#### [NEW] [netlify.toml](file:///d:/laragon/www/simt-wa-gateway/netlify.toml)
Create Netlify configuration to compile code and route API requests to a serverless function handler.

#### [NEW] [netlify/functions/api.ts](file:///d:/laragon/www/simt-wa-gateway/netlify/functions/api.ts)
Create the Netlify function handler wrapping the Express application with `serverless-http`.

#### [MODIFY] [src/index.ts](file:///d:/laragon/www/simt-wa-gateway/src/index.ts)
- Prevent `app.listen()` from running if on Vercel or Netlify.
- Export `app` so it can be loaded by Vercel and Netlify function runners.

---

## Verification Plan

### Automated Tests
- Run `npm run build` to verify compiling works.
- Verify configuration files are syntactically valid.
