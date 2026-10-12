# Deployment

## Components

| Component | Deployment input |
|---|---|
| Next.js web/control plane | OpenNext + Cloudflare Workers (`wrangler.jsonc`) |
| Voice worker (`sigulon-voice-agent`) | `voice-runtime/Dockerfile`, LiveKit Cloud Agents only; see `voice-runtime/DEPLOYMENT.md` |
| Campaign worker | `services/campaign-worker/Dockerfile`, GKE Autopilot + KEDA |
| Durable data | MongoDB Atlas or a production MongoDB replica set |
| Queue/cache | Redis (Upstash, Memorystore, or equivalent) |
| Media/telephone | LiveKit Cloud (SIP trunks, rooms, Egress → R2); Plivo SIP trunks |

## Required configuration

Set the production values from [`.env.example`](../.env.example) in the web
service. The runtime and worker each have their own `.env.example` files.

All services that access the database need the same `MONGODB_URI`; the worker
and runtime also need `REDIS_URL`. Set one unique `ENCRYPTION_SECRET` (at
least 32 characters) in both the web service and campaign worker. It decrypts
per-workspace Plivo credentials stored by the web application. `PLIVO_AUTH_ID`
and `PLIVO_AUTH_TOKEN` remain an optional platform fallback and must be set
together when used. Callbacks select the workspace token from the registered
number or known call before signature validation.

## Transactional email

Password resets and team invitations use SMTP. Set `APP_URL`, `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM` in the web
deployment; set `SMTP_SECURE=true` only for implicit-TLS SMTP (normally port
465). In production, the API returns a delivery error rather than claiming an
email was sent without this configuration. Local development logs the link.

## Cloudflare production path

Use [`docs/cloudflare-migration.md`](cloudflare-migration.md) for the web
control plane on Cloudflare Workers. `npm run cf:build` creates the OpenNext
Worker bundle and `npm run cf:preview` runs it under workerd. The Python voice
agent deploys exclusively to LiveKit Cloud using
[`voice-runtime/DEPLOYMENT.md`](../voice-runtime/DEPLOYMENT.md).

The campaign queue worker remains a long-running Redis consumer, not a LiveKit
room agent. Keep it separate from the Cloudflare Worker and voice agent. The
legacy GCP manifests under [`deploy/gcp`](../deploy/gcp) are retained as a
rollback path and are no longer the active CI deployment path.

LiveKit Cloud runs the voice image with `python agent.py start`. Its MongoDB,
Redis, and internal control API endpoints must be reachable from Cloud agents;
private GCP-only addresses are insufficient. Provision runtime secrets through
the target platform's secret manager, never image build arguments.

See [`docs/cloudflare-migration.md`](cloudflare-migration.md) for Cloudflare
secret setup, preview, CI/CD, cutover, rollback, and compatibility gaps. The
GCP guide remains available only for rollback operations.

## Plivo SIP + LiveKit

- Register the actual Plivo number in the dashboard; this application does
  not purchase or provision carrier numbers.
- Saving a number provisions a LiveKit inbound trunk (metadata
  `{orgId, agentId}`); point the number's Plivo Zentrunk SIP URI at
  `<project-sip-subdomain>.sip.livekit.cloud;transport=tcp`.
- LiveKit webhooks (`/api/webhooks/livekit`, verified with
  `LIVEKIT_WEBHOOK_SECRET`) drive Call lifecycle, billing, and recordings
  (Egress → R2). The Plivo `status` webhook stays ONLY for 2-week dual-run
  reconciliation (`PLIVO_DUAL_RUN`), then is deleted.

## Local development

```bash
cp .env.example .env.local
cp voice-runtime/.env.example voice-runtime/.env
cp services/campaign-worker/.env.example services/campaign-worker/.env
docker compose up --build
npm run dev
```

Use a LiveKit Cloud project + tunnel for the web URL before testing.
Do not point `db:init` or `db:seed` at production MongoDB.
