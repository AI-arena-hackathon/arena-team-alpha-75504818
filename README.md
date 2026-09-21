# Acquisition‑Signal

Team alpha — spec §3.2 hackathon build.

**One-liner:** A privacy‑first, server‑plus‑browser tracking stack that turns raw activation events into a low‑cost, real‑time CAC engine for micro‑SaaS founders.

**Problem:** Micro‑SaaS founders spend $200‑$500 per new user because they can’t see which paid touchpoints actually trigger activation, while browser‑only tracking is blocked by ad‑blockers, cookie limits and mobile traffic, and existing attribution tools are too heavy for 10‑50 users/month.

**Solution:** An optional lightweight browser extension that captures first‑party click data, paired with a server‑side SDK or API hook that records activation events (sign‑ups, plan upgrades, trial starts). The system stitches these streams, applies deterministic and probabilistic matching, and outputs a real‑time dashboard that: 1) shows channel‑by‑channel CAC, 2) flags which creative/landing combinations bring the lowest cost users, 3) automatically runs lightweight A/B tests on creatives and landing pages, and 4) checks attribution data against current privacy rules, generating consent‑compliance alerts and export‑ready audit reports. All data is stored in the founder’s own cloud environment and can be exported to any existing analytics stack.

**Build scope:** **Acquisition‑Signal – Day 4‑5 Architecture (≈ 185 w)**  

**Observed friction:**  
Micro‑SaaS founders manually copy UTM‑tagged URLs into spreadsheets, then guess which ad creative actually caused a paid signup. The guesswork costs $200‑$500 / user because they cannot prove “click → activation” when ad‑blockers strip third‑party cookies and the tiny traffic volume makes probabilistic models unstable.

---

### 1. Tech‑stack  
| Layer | Choice | Why it matches the friction |
|-------|--------|-----------------------------|
| **Browser extension** | Chrome/Edge (Chromium) + Firefox WebExtension (TS) | Runs client‑side, reads first‑party URL params **before** any blocker can strip them; tiny (≈ 30 KB) so users keep it enabled. |
| **Server‑side ingest** | Node 18 (Fastify) + TypeScript → AWS Lambda (or Cloudflare Workers) | Pay‑as‑you‑go, scales to < 100 req/s, no idle servers for founders on a shoestring. |
| **Data store / pipeline** | DynamoDB (key‑value) + S3 for raw logs + Athena for ad‑hoc queries | Founder‑owned bucket (can be their own AWS account) satisfies “data lives in my cloud”. |
| **Dashboard** | React + Vite, hosted on Netlify/Vercel, reads from a read‑only API that pulls pre‑aggregated metrics from DynamoDB. |
| **A/B test engine** | Simple bucket‑assignment stored in DynamoDB; decision logic lives in the Lambda ingest function. |
| **Privacy / consent** | Consent‑JS library (open‑source) + server‑side flag check; audit CSV export via S3. |

---

### 2. Core components (3 must‑have)

| # | Component | Minimal viable behavior |
|---|-----------|--------------------------|
| 1 | **Extension → click logger** | On page load, read `utm_*` (or custom `acq_id`) and POST `{sessionId, url, ts}` to the ingest endpoint. |
| 2 | **Server SDK → activation recorder** | Expose `recordActivation(userId, plan, ts)` that the founder drops into their sign‑up flow (or calls via webhook). |
| 3 | **Stitcher & dashboard API** | Lambda reads click logs + activation records, performs deterministic match on `sessionId` (or probabilistic fallback using fingerprint hash). Returns per‑channel CAC, top‑creative list, and a “privacy‑alert” flag. |

---

### 3. Top 2 risks  

| Risk | Why it hurts the friction claim | Mitigation |
|------|--------------------------------|------------|
| **1️⃣ Incomplete matching** – low traffic means deterministic session‑id may be missing (users switch devices). | Founder still sees “guesswork” and pays high CAC. | Add a lightweight probabilistic layer (hashed IP + user‑agent

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Installation
```bash
npm ci
```

### Development
```bash
npm run dev
```
Server runs at `http://localhost:3000` with hot reload.

### Production Build
```bash
npm run build
npm start
```

### Testing
```bash
npm test
npm run lint
```

### Environment Variables
Copy `.env.example` to `.env` and fill in values:
```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | HTTP port |
| `HOST` | No | `0.0.0.0` | Bind address |
| `LOG_LEVEL` | No | `info` | Log level (debug, info, warn, error) |

### API Endpoints
- `GET /health` — Health check
- `POST /api/ingest/click` — Ingest click event from browser extension
- `POST /api/ingest/activation` — Record activation from server SDK
- `GET /api/dashboard` — Stitched CAC metrics and privacy alerts
- `GET /api/debug/data` — Debug: raw stored data
- `POST /api/debug/reset` — Debug: clear all data

### Example Usage
```bash
# Ingest a click event
curl -X POST http://localhost:3000/api/ingest/click \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"sess-1","url":"https://example.com/?utm_source=google&utm_medium=cpc","timestamp":1700000000000,"utmSource":"google","utmMedium":"cpc"}'

# Record an activation
curl -X POST http://localhost:3000/api/ingest/activation \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","plan":"pro","timestamp":1700000010000,"sessionId":"sess-1","revenue":29}'

# Get dashboard metrics
curl http://localhost:3000/api/dashboard
```

Built entirely by an AI coding agent across discrete GitHub Actions build turns (spec §8) — no human-written code.
