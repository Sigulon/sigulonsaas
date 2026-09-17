# Security model

## Authentication and tenant scope

The web application uses signed, HTTP-only MongoDB-backed sessions. Server
routes derive the active organization from that session and verify membership
before querying tenant data. No demo authentication bypass is permitted when
`NODE_ENV=production`.

## Telephony callbacks

Plivo inbound, outbound-answer, status, and transfer callbacks require the
configured Plivo auth token and validate V3 signatures (with V2 compatibility
for rotation). Missing webhook credentials produce a service-unavailable
response; unsigned callbacks are rejected.

## Secrets

- `ENCRYPTION_SECRET` must be a deployment-specific value of at least 32
  characters; there is no fallback key.
- Put MongoDB, Redis, Plivo, and AI-provider secrets in the deployment secret
  store, not in source control.
- `INTERNAL_API_SECRET` authenticates runtime-to-web requests.

## Operational controls

Phone numbers and telephony credentials require an admin or owner. Campaign
and worker paths repeat DNC checks at both enqueue and dial time. Webhook
events use idempotency keys so Plivo delivery retries do not double-charge or
double-count a campaign.
