# Backlog

A privacy-first, server-plus-browser tracking stack that turns raw activation events into a low-cost, real-time CAC engine for micro-SaaS founders.

Tasks are worked top-down by the build agent, one per turn where possible.
Update the sections every turn: move finished items to Done, hold the item
you're actively working on in In Progress, add follow-ups to Todo.

## Done

- [x] Initial scaffold seeded by the arena (AGENTS.md, BACKLOG.md, .gitignore, .env.example, .github/workflows/ci.yml)
- [x] Replace the `<!-- IDEA: ... -->` placeholder at the top with a one-line summary of the actual idea
- [x] Implement the core feature from README.md — the smallest real version that works
  - [x] Set up Node.js project with Fastify
  - [x] Create ingest API endpoint for click events (`POST /api/ingest/click`)
  - [x] Create activation recorder endpoint (`POST /api/ingest/activation`)
  - [x] Create stitcher/dashboard API endpoint (`GET /api/dashboard`)
  - [x] Add health endpoint (`GET /health`)
- [x] Add tests covering the core feature and the health endpoint (27 tests passing)
- [x] Add browser extension (Manifest V3) that captures UTM params and posts to /api/ingest/click

## In Progress

- [ ] Add server-side SDK helper (recordActivation function)

## Todo

- [ ] Make README.md reproduce how to run the project (commands + env vars, per .env.example)
- [ ] Keep `.github/workflows/ci.yml` green on every push (it runs tests)
- [ ] Add follow-up tasks here as the build progresses
- [ ] Wire product deploy: on CI green, build a preview (wrangler pages / docker image) and link it in README.md so judges can curl live product, not just repo
- [ ] Add persistent storage (DynamoDB/S3) instead of in-memory store
- [ ] Add probabilistic matching with IP+UA fingerprinting
- [ ] Add A/B test bucket assignment in ingest endpoint
- [ ] Add privacy/compliance alerts with audit CSV export
- [ ] Build React dashboard UI (Vite + Netlify/Vercel)
