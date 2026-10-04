# Production deployment on Google Cloud

This is the supported Google Cloud topology for Sigulon:

```text
                           Cloud Run
             ┌───────────────────────────────────┐
   HTTPS ───▶│ sigulon-web (control plane +      │
             │  /api/webhooks/livekit)           │
             └───────────────┬───────────────────┘
                             │ Direct VPC egress
                     MongoDB + Memorystore Redis
                             │
                       GKE Autopilot
                             │
                 ┌───────────┴───────────┐
                 │                       │
          KEDA (CPU)              KEDA (Redis queue)
                 │                       │
        voice-worker replicas    campaign-worker replicas
        (sigulon-voice-agent)     (LiveKit dispatch+SIP dial)

   Telephone: Plivo number → Zentrunk (SIP) → LiveKit Cloud
              inbound trunk → room + dispatch → voice worker
              Outbound: room + dispatch + SIP participant → Plivo → callee
```

Cloud Run scales the web application from HTTP traffic. Both workers run on
GKE: the voice worker (`python agent.py start`, outbound-only, no ingress)
scales on CPU via KEDA (proxy for LiveKit concurrent dispatch, min 1 so
inbound SIP dispatch never cold-starts); the campaign worker scales from the
Redis list `sigulon:campaign:queue` (1 to 20). GKE Autopilot provisions nodes
for pending worker Pods.

One worker stays alive even without a campaign because the current worker also
performs retry and stale-job recovery sweeps. This is intentional; setting its
minimum to zero would leave delayed retries unrecovered.

## Before deployment

Install and authenticate the Google Cloud CLI, `kubectl`, and Helm. Your IAM
identity needs permission to create or update Artifact Registry, Cloud Build,
Cloud Run, GKE, IAM service accounts, and Secret Manager resources.

Create a VPC and regional subnet before deploying. The Cloud Run services use
Direct VPC egress to reach a private Memorystore instance, while the GKE
Autopilot cluster must use the same VPC/subnet. Select a subnet with at least a
`/26` range so Cloud Run can reserve addresses during a burst. Use
`private-ranges-only` egress unless public provider traffic needs a fixed NAT
address.

Provision these managed data services first:

- MongoDB Atlas (or a production MongoDB replica set), reachable by all three
  workloads.
- Memorystore for Redis, on the VPC used by Cloud Run and GKE. Its endpoint is
  the project queue, live-call configuration cache, session store, and
  concurrency coordinator.

## Secret Manager

Create every following Secret Manager secret and add a `latest` version before
running the deploy script. The Cloud Run manifests deliberately contain only
secret names, never secret data.

| Secret name | Value |
| --- | --- |
| `sigulon-mongodb-uri` | `MONGODB_URI` |
| `sigulon-redis-url` | `REDIS_URL` |
| `sigulon-internal-api-secret` | `INTERNAL_API_SECRET` |
| `sigulon-encryption-secret` | `ENCRYPTION_SECRET` |
| `sigulon-livekit-url` | `LIVEKIT_URL` |
| `sigulon-livekit-api-key` | `LIVEKIT_API_KEY` |
| `sigulon-livekit-api-secret` | `LIVEKIT_API_SECRET` |
| `sigulon-livekit-webhook-secret` | `LIVEKIT_WEBHOOK_SECRET` |
| `sigulon-plivo-auth-id` | `PLIVO_AUTH_ID` (SIP trunking + dual-run only) |
| `sigulon-plivo-auth-token` | `PLIVO_AUTH_TOKEN` (SIP trunking + dual-run only) |
| `sigulon-cartesia-api-key` | `CARTESIA_API_KEY` |
| `sigulon-deepgram-api-key` | `DEEPGRAM_API_KEY` |
| `sigulon-openrouter-api-key` | `OPENROUTER_API_KEY` (fallback LLM) |
| `sigulon-smtp-host` | `SMTP_HOST` |
| `sigulon-smtp-user` | `SMTP_USER` |
| `sigulon-smtp-password` | `SMTP_PASSWORD` |
| `sigulon-email-from` | `EMAIL_FROM` |

The deploy script grants its dedicated `sigulon-run` service account Secret
Accessor at project scope so the generated services can start. For stricter
production isolation, replace that one project-level grant with Secret Accessor
bindings on only the secrets in this table.

## Worker secret

KEDA needs the Redis address and credentials through the target Deployment,
and the worker needs the same credentials plus MongoDB and telephony values.
Copy [`worker/secret.example.yaml`](worker/secret.example.yaml) outside this
repository, replace its sample data, and apply it to the cluster:

```powershell
kubectl apply -f C:\secure\sigulon-worker-secrets.yaml
```

Keep the canonical values in Secret Manager and update this Kubernetes Secret
whenever you rotate a value. `KEDA_REDIS_ADDRESS` is only `host:port`; it must
not include `redis://`. If your Redis deployment does not use a password, set
the `KEDA_REDIS_PASSWORD` value to an empty string.

> Legacy manifests `deploy/cloudrun-*.yaml.legacy*` are superseded and must not
> be applied. The canonical manifests are `deploy/gcp/cloudrun-web.yaml`
> (Cloud Run web) and `deploy/gcp/voice-worker/` + `deploy/gcp/worker/`
> (GKE + KEDA workers). Neither worker may be deployed as a Cloud Run
> Service: they are non-HTTP, long-running processes (Agents SDK
> registration / Redis `BRPOP`).

## Deploy

Pass the secure worker Secret file to the deployment script. It will create
the Autopilot cluster when it does not exist, apply that Secret after creating
the namespace, then install KEDA and the autoscaled worker.

```powershell
$project = "YOUR_PROJECT_ID"
$region = "asia-south1"
$network = "YOUR_VPC"
$subnet = "YOUR_REGIONAL_SUBNET"

.\deploy\gcp\deploy.ps1 `
  -ProjectId $project `
  -Region $region `
  -Network $network `
  -Subnet $subnet `
  -WorkerSecretFile C:\secure\sigulon-worker-secrets.yaml `
  -Tag v1
```

The script enables required APIs, creates an Artifact Registry repository and
dedicated Cloud Run service account when missing, builds all three images with
Cloud Build, deploys the web Cloud Run service, installs KEDA 2.20, and applies
both worker deployments, PodDisruptionBudget, and ScaledObjects. Use `-SkipBuild`
to reuse a previously pushed tag, or `-SkipWorker` to deploy just the web.
Omit `-WorkerSecretFile` only if `sigulon-worker-secrets` is
already present in the `sigulon` namespace.

The script prints the web HTTPS URL. Point each Plivo number's Zentrunk SIP
URI at your LiveKit project domain (see `src/lib/livekit.ts`
`zentrunkUriForProject()`):

```text
SIP URI: <project-sip-subdomain>.sip.livekit.cloud;transport=tcp
LiveKit webhook: https://<sigulon-web>/api/webhooks/livekit
```

It makes the web endpoint public because browsers and LiveKit must reach it.
Dashboard APIs remain protected by the application session, LiveKit webhooks
are signature-verified (`LIVEKIT_WEBHOOK_SECRET`) with `WebhookEvent`
idempotency, and the voice worker only serves rooms whose dispatch metadata
resolves to an active agent.

## Verify autoscaling

Start an outbound campaign, then watch the backlog, KEDA decision, HPA, and
worker Pods:

```powershell
kubectl get scaledobject,hpa -n sigulon
kubectl get deployment,pods -n sigulon -w
```

KEDA calculates the desired campaign-worker count from an average of two queued jobs per
replica. The deployment grows by at most four Pods every 15 seconds and waits
five minutes before a conservative scale-down. The existing Redis governors
still cap real SIP dial attempts globally, per organization, per campaign,
and per caller number, so adding workers never bypasses telephony limits.
The voice worker scales on CPU (60% utilization ≈ concurrent sessions);
one replica always stays alive for inbound dispatch.

Tune `listLength`, `maxReplicaCount`, and `WORKER_*_MAX_CONCURRENT` only after
running [`docs/load-test-plan.md`](../../docs/load-test-plan.md). Raise the
tenant-level `maxConcurrentCalls` in tandem with trunk quotas and measured
CPU per session. Soak 48h on staging, then cut prod numbers (US first, India
after region-pin verification).

## Networking and operations

- Cloud Run needs Direct VPC egress to reach private Memorystore; GKE needs to
  be on the Redis instance's authorized VPC.
- If MongoDB Atlas requires IP allow-listing, use Cloud NAT with an egress rule
  and change Cloud Run to `all-traffic`, or use Atlas private connectivity.
- Set Cloud Monitoring alerts for Redis queue depth, KEDA/HPA desired versus
  current replicas, worker heartbeat freshness, dispatch failures,
  LiveKit webhook failures, and MongoDB connection saturation.
- Test both the inbound (Plivo → LiveKit trunk → dispatch → greet <1s) and
  outbound (dispatch → SIP participant, callee speaks first) paths before
  allowing production campaigns. Do not run the database seed scripts against production.
