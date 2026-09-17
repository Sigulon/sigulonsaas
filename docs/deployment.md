# Deployment

## Components

| Component | Deployment input |
|---|---|
| Next.js web/control plane | root `Dockerfile`, Cloud Run |
| Voice runtime | `voice-runtime/Dockerfile`, Cloud Run |
| Campaign worker | `services/campaign-worker/Dockerfile`, GKE Autopilot + KEDA |
| Durable data | MongoDB Atlas or a production MongoDB replica set |
| Queue/cache | Redis (Upstash, Memorystore, or equivalent) |

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
control plane and WebSocket voice runtime on Cloud Run, and the continuous
Redis campaign consumer on GKE Autopilot. KEDA scales campaign-worker Pods from
the Redis queue depth, which is the required signal for outbound campaign
autoscaling.

The worker must not be deployed as a Cloud Run Service: it is a non-HTTP,
long-running `BRPOP` process. Cloud Run Services must expose an HTTP listener;
running it on GKE with KEDA keeps its existing queue and retry semantics.

The Cloud Run voice runtime has min scale 1, max scale 50, 3600-second request
timeout, always-allocated CPU, and one telephone WebSocket per container. The
web service scales from 1 to 20 instances. Both use Direct VPC egress for a
private Memorystore Redis connection.

See [`deploy/gcp/README.md`](../deploy/gcp/README.md) for the required Secret
Manager names, VPC setup, one-command PowerShell deployment, KEDA behavior,
and Plivo production wiring.

## Plivo

- Register the actual Plivo number in the dashboard; this application does
  not purchase or provision carrier numbers.
- Configure its answer URL as
  `https://<web-host>/api/webhooks/plivo/inbound` and its hangup URL as
  `https://<web-host>/api/webhooks/plivo/status`, both using POST.
- Configure public `VOICE_RUNTIME_URL` and `PUBLIC_WEB_URL` values. Plivo
  must be able to reach both hosts over TLS.

## Local development

```bash
cp .env.example .env.local
cp voice-runtime/.env.example voice-runtime/.env
cp services/campaign-worker/.env.example services/campaign-worker/.env
docker compose up --build
npm run dev
```

Use a tunnel for the web and runtime URLs before testing Plivo callbacks.
Do not point `db:init` or `db:seed` at production MongoDB.
