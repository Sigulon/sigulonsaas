# Deployment

## Components

| Component | Deployment input |
|---|---|
| Next.js web/control plane | root `Dockerfile`, Cloud Run |
| Voice worker (`sigulon-voice-agent`) | `voice-runtime/Dockerfile`, GKE + KEDA (CPU/dispatch, outbound-only, no ingress) |
| Campaign worker | `services/campaign-worker/Dockerfile`, GKE Autopilot + KEDA |
| Durable data | MongoDB Atlas or a production MongoDB replica set |
| Queue/cache | Redis (Upstash, Memorystore, or equivalent) |
| Media/telephone | LiveKit Cloud (SIP trunks, rooms, Egress → GCS); Plivo SIP trunks |

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

## Google Cloud production path

Use the deployment project in [`deploy/gcp`](../deploy/gcp). It runs the web
control plane on Cloud Run and both workers (voice + campaign) on GKE
Autopilot. KEDA scales the campaign worker from the Redis queue depth and
the voice worker from CPU (proxy for LiveKit concurrent dispatch) — neither
depends on HTTP RPS.

Both workers must not be deployed as Cloud Run Services: they are non-HTTP,
long-running processes (Agents SDK registration / Redis `BRPOP`). Running
them on GKE with KEDA keeps their existing dispatch and retry semantics.

The voice worker runs `python agent.py start` as a single always-on process
(min 1, max 20 via KEDA CPU 60%), 2 vCPU / 2 GiB. The web service scales
from 1 to 20 instances on HTTP traffic. Web uses Direct VPC egress for a
private Memorystore Redis connection.

See [`deploy/gcp/README.md`](../deploy/gcp/README.md) for the required Secret
Manager names, VPC setup, one-command PowerShell deployment, KEDA behavior,
and Plivo production wiring.

## Plivo SIP + LiveKit

- Register the actual Plivo number in the dashboard; this application does
  not purchase or provision carrier numbers.
- Saving a number provisions a LiveKit inbound trunk (metadata
  `{orgId, agentId}`); point the number's Plivo Zentrunk SIP URI at
  `<project-sip-subdomain>.sip.livekit.cloud;transport=tcp`.
- LiveKit webhooks (`/api/webhooks/livekit`, verified with
  `LIVEKIT_WEBHOOK_SECRET`) drive Call lifecycle, billing, and recordings
  (Egress → GCS). The Plivo `status` webhook stays ONLY for 2-week dual-run
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
