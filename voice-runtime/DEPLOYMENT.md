# LiveKit Cloud room-agent deployment

The Python runtime is a LiveKit room agent. The campaign queue worker in
`services/campaign-worker` is a separate control-plane process: it creates
dispatches and SIP participants; it does not handle room audio. GCP's deploy
script deploys that queue worker only. Retired voice-worker Kubernetes manifests
have `.disabled` extensions. Existing GKE voice replicas are not automatically
removed: drain and retire them explicitly during a planned Cloud migration to
avoid two deployments claiming the same dispatch name.

## Prepare (these commands are operator actions, not an automatic deployment)

From `voice-runtime`, run local tests and build the image:

```sh
python -m unittest test_runtime -v
docker build -t sigulon-voice-agent .
```

The Dockerfile installs locked dependencies into `.venv`, uses that interpreter,
and downloads VAD/turn-detector assets as the runtime user. `download-files`
registers plugins without requiring production credentials. Runtime credentials
are validated when a call starts. Never pass secrets as Docker build arguments.

Authenticate and choose your actual Cloud project:

```sh
lk cloud auth
lk project list
```

Use `lk project set-default` with the project name you verified. Provision the
runtime secrets through LiveKit Cloud secret management: `CARTESIA_API_KEY`,
`R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `MONGODB_URI`, `REDIS_URL`,
`INTERNAL_API_BASE_URL`, and `INTERNAL_API_SECRET`. `R2_ENDPOINT` is optional
when it follows `https://<account-id>.r2.cloudflarestorage.com`. Grant the R2
key permission to write objects to the configured bucket.
LiveKit Cloud supplies its own LiveKit connection credentials. The control-plane
URL and database/Redis must be reachable from Cloud agent instances; a GKE-only
private address is insufficient. Do not upload local `.env` files or commit keys.

Only when ready to create and deploy, run `lk agent create` in this directory.
The CLI generates `livekit.toml` with real project/agent IDs; this repository
deliberately does not ship invented IDs. Review that generated file. Future
updates use `lk agent deploy`; inspect `lk agent status` and `lk agent logs`.
Dispatch to `sigulon-voice-agent` (or the matching `LIVEKIT_AGENT_NAME` override).

Verify inbound/outbound SIP, tenant mismatch rejection, billing denial, and
concurrency denial in a non-production project before routing production calls.
STT/LLM remain LiveKit Inference and TTS remains direct Cartesia.

Official references:
- https://docs.livekit.io/deploy/agents/quickstart.md
- https://docs.livekit.io/deploy/agents/builds.md
- https://docs.livekit.io/deploy/agents/secrets.md
