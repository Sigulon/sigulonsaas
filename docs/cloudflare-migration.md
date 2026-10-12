# Cloudflare migration

This repository now has a reversible Cloudflare Workers deployment path for
the Next.js control plane. It does **not** move the Python voice agent or the
campaign worker into a request-scoped Worker.

## Architecture

```text
Browser / webhook / dashboard
              |
       Cloudflare Worker
       (Next.js + OpenNext)
          |       |       \
      MongoDB   Redis     R2 recordings
          |       |             |
   LiveKit Cloud <------------ webhook
          |
  LiveKit voice agent (Python, long-running)

Campaign worker (Python, long-running) -> Redis + MongoDB + LiveKit
```

MongoDB Atlas remains the source of truth. R2 remains the recordings store.
LiveKit Cloud remains responsible for rooms, SIP, realtime media, and the
voice-agent dispatch. The Python processes require a long-running compatible
host such as LiveKit Cloud for the agent and a container platform for the
campaign worker; they are not deployed as ordinary Worker request handlers.

## Cloudflare prerequisites

Install/use Node 22 and authenticate Wrangler:

```bash
npm ci
npx wrangler login
npx wrangler whoami
```

Create a Worker named `sigulon-web`, an R2 bucket for OpenNext incremental
cache if you want ISR/cache persistence, and keep it separate from the
recordings bucket. The recordings bucket is accessed by the existing S3/R2
client and is not the OpenNext cache binding.

Set non-secret configuration in `wrangler.jsonc` or the Cloudflare dashboard.
Set secrets with Wrangler (never commit values):

```bash
npx wrangler secret put MONGODB_URI
npx wrangler secret put MONGODB_DATABASE
npx wrangler secret put INTERNAL_API_SECRET
npx wrangler secret put ENCRYPTION_SECRET
npx wrangler secret put REDIS_URL
npx wrangler secret put LIVEKIT_URL
npx wrangler secret put LIVEKIT_API_KEY
npx wrangler secret put LIVEKIT_API_SECRET
npx wrangler secret put LIVEKIT_WEBHOOK_SECRET
npx wrangler secret put LIVEKIT_AGENT_NAME
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put R2_BUCKET_NAME
npx wrangler secret put CARTESIA_API_KEY
npx wrangler secret put PLIVO_AUTH_ID
npx wrangler secret put PLIVO_AUTH_TOKEN
npx wrangler secret put SMTP_HOST
npx wrangler secret put SMTP_USER
npx wrangler secret put SMTP_PASSWORD
npx wrangler secret put EMAIL_FROM
```

`REDIS_URL` must be reachable from Cloudflare Workers. The previous GCP
deployment used private Memorystore VPC egress, which a normal Worker cannot
inherit. Use a Workers-reachable managed Redis/HTTP Redis endpoint or keep the
Redis-dependent API routes on a separately hosted Node control-plane service
until connectivity and latency are validated.

## Local Workers-runtime verification

Run the normal Next build and the Workers preview separately:

```bash
npm run build
npm run cf:build
npm run cf:preview
```

`cf:preview` runs the OpenNext output under Wrangler/workerd. Test the login,
dashboard, agent creation, browser test call, LiveKit webhook, call listing,
recording playback, and campaign-start flows against a staging database and
staging LiveKit project before changing DNS.

## CI/CD

`.github/workflows/cloudflare.yml` deploys the Worker on pushes to `main` or
`master` using `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub
secrets. It only builds the Python images when the repository variable
`BUILD_RUNTIME_IMAGES` is `true`; those images still require a compatible
long-running registry/runtime deployment.

## Cutover and rollback

1. Deploy the Worker under a staging hostname.
2. Run the staging checklist above and inspect Cloudflare Worker logs.
3. Deploy voice runtime and campaign worker with `INTERNAL_API_BASE_URL`
   pointing to the staging Worker URL.
4. Configure LiveKit webhook and application callback URLs to staging.
5. Canary a small set of dashboard users and one inbound/outbound call.
6. Move DNS only after recordings, billing, and campaign status updates are
   verified.
7. Roll back by restoring the previous DNS target and callback URLs. The GCP
   manifests and script are retained under `deploy/gcp/` as a reversible
   fallback, but they are no longer the active CI deployment path.

## Known compatibility gaps

- Mongoose and the `redis` Node socket client were designed for a persistent
  Node process. They must be validated under workerd with realistic load;
  global connection reuse and GCP-private Redis networking are not assumed to
  be safe in production.
- SMTP via Nodemailer should be exercised in Workers preview and production;
  an HTTPS email provider is the lower-risk follow-up if transport fails.
- `/api/agents/transcribe` currently returns a deliberate 501 for multipart
  uploads because no bounded WebM/Opus-to-PCM adapter exists. The UI should
  use live browser transcription instead of presenting this as an available
  upload feature until an adapter is implemented.
- OpenNext reports Node.js Proxy support as experimental. The existing
  `src/proxy.ts` is intentionally retained because it owns the root redirect
  and public-path behavior; validate those paths in `cf:preview` before
  production cutover.
- No production deployment was performed by this migration. A successful
  `cf:build` only proves bundle generation, not database, Redis, LiveKit, R2,
  authentication, or campaign connectivity.
