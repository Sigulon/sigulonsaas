# Sigulon — AI voice-calling SaaS for Indian SMBs

Agents that answer and dial over real phone lines: Pipecat voice runtime
(Cartesia STT/TTS · OpenRouter Gemini 2.5 Flash · Plivo), async campaign
dialing, credit-ledger billing, and a multi-tenant Next.js dashboard.

## Quickstart

```bash
npm install
cp .env.example .env.local          # fill MongoDB, Plivo, Redis, and runtime URLs
npm run dev                          # web on :3000
```

Full local voice stack (needs Docker + tunnel for Plivo callbacks):

```bash
cp voice-runtime/.env.example voice-runtime/.env
cp services/campaign-worker/.env.example services/campaign-worker/.env
docker compose up --build
```

Run the database initialization/seed scripts only against a non-production
MongoDB database:

```bash
npm run db:init
npm run db:seed
```

## Layout

- `src/` — dashboard + control-plane API (`npm run dev|build|start|lint`, `npm run test:unit`)
- `packages/database/` — MongoDB/Mongoose models and repositories
- `voice-runtime/` — per-call audio pipelines (`uv sync`, `uv run uvicorn main:app`, tests via unittest)
- `services/campaign-worker/` — async dial worker (same uv workflow)
- `docs/` — guides · `deploy/gcp/` — Cloud Run + GKE/KEDA production deployment

## Docs

- `docs/architecture.md` — system map, flows, scaling notes
- `docs/voice-runtime.md` — endpoints, providers, tools, contract
- `docs/campaigns.md` — lifecycle, queue, worker semantics, DNC
- `docs/multi-tenancy.md` — auth model, enforcement, honest gaps
- `docs/billing.md` — ledger, reserve/settle, top-ups
- `docs/deployment.md` — web, Cloud Run, MongoDB, Redis, and Plivo checklist
- `docs/load-test-plan.md` — 10 → 1000 tier plan (measure, don't assume)
- `deploy/gcp/README.md` — Google Cloud production topology and automated deployment

## Status

The supported call path is Plivo → Next.js webhooks → Pipecat runtime,
with MongoDB for durable state and Redis for queues/config cache. See the
deployment guide before exposing Plivo webhooks publicly.
