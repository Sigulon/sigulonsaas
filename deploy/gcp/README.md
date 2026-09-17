# Production deployment on Google Cloud

This is the supported Google Cloud topology for Sigulon:

```text
                          Cloud Run
            ┌───────────────────────────────────┐
  HTTPS ───▶│ sigulon-web                         │
            │ sigulon-voice-runtime (WebSockets) │◀── Plivo audio stream
            └───────────────┬───────────────────┘
                            │ Direct VPC egress
                    MongoDB + Memorystore Redis
                            │
                      GKE Autopilot
                            │
                    KEDA ScaledObject
                            │
                  campaign-worker replicas
```

Cloud Run automatically scales the web application from HTTP traffic and the
voice runtime from active WebSocket requests. The runtime has a concurrency of
one call per container to preserve real-time audio latency. KEDA watches the
Redis list `sigulon:campaign:queue` every five seconds and adjusts the GKE
campaign-worker replica count from **1 to 20**. GKE Autopilot provisions the
underlying nodes for pending worker Pods.

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
| `sigulon-plivo-auth-id` | `PLIVO_AUTH_ID` |
| `sigulon-plivo-auth-token` | `PLIVO_AUTH_TOKEN` |
| `sigulon-cartesia-api-key` | `CARTESIA_API_KEY` |
| `sigulon-cartesia-webhook-secret` | `CARTESIA_WEBHOOK_SECRET` |
| `sigulon-openrouter-api-key` | `OPENROUTER_API_KEY` |
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
Cloud Build, deploys both Cloud Run services, installs KEDA 2.20, and applies
the worker deployment, PodDisruptionBudget, and ScaledObject. Use `-SkipBuild`
to reuse a previously pushed tag, or `-SkipWorker` to deploy just the web and
voice plane. Omit `-WorkerSecretFile` only if `sigulon-worker-secrets` is
already present in the `sigulon` namespace.

The script prints the generated HTTPS URLs. Configure the Plivo number with:

```text
Answer URL: https://<sigulon-web>/api/webhooks/plivo/inbound
Hangup URL: https://<sigulon-web>/api/webhooks/plivo/status
```

It makes the web and voice endpoints public because browsers and Plivo must
reach them. Dashboard APIs remain protected by the application session, Plivo
webhooks are signature-verified, and the voice runtime rejects call IDs that
do not resolve to an active agent.

## Verify autoscaling

Start an outbound campaign, then watch the backlog, KEDA decision, HPA, and
worker Pods:

```powershell
kubectl get scaledobject,hpa -n sigulon
kubectl get deployment,pods -n sigulon -w
```

KEDA calculates the desired worker count from an average of two queued jobs per
replica. The deployment grows by at most four Pods every 15 seconds and waits
five minutes before a conservative scale-down. The existing Redis governors
still cap real Plivo dial attempts globally, per organization, per campaign,
and per caller number, so adding workers never bypasses telephony limits.

Tune `listLength`, `maxReplicaCount`, and `WORKER_*_MAX_CONCURRENT` only after
running [`docs/load-test-plan.md`](../../docs/load-test-plan.md). Raise Cloud
Run's maximum scale and the tenant-level `maxConcurrentCalls` in tandem with
provider quotas and measured CPU per call.

## Networking and operations

- Cloud Run needs Direct VPC egress to reach private Memorystore; GKE needs to
  be on the Redis instance's authorized VPC.
- If MongoDB Atlas requires IP allow-listing, use Cloud NAT with an egress rule
  and change Cloud Run to `all-traffic`, or use Atlas private connectivity.
- Set Cloud Monitoring alerts for Redis queue depth, KEDA/HPA desired versus
  current replicas, worker heartbeat freshness, runtime active-call rejections,
  Plivo callback failures, and MongoDB connection saturation.
- Test both the inbound and outbound Plivo paths before allowing production
  campaigns. Do not run the database seed scripts against production.
