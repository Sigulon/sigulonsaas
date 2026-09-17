# Scaling Sigulon to 1,000+ Concurrent Calls

This document details the autoscaling, concurrency governors, and infrastructure targets to scale from 10 to 1,000 concurrent calls.

## Concurrency Architecture

1. **Layered Governors**:
   - **Global Cap**: Governs maximum simultaneous calls across all workers.
   - **Tenant Concurrency Limit**: Default 5, configurable per plan up to 50+.
   - **Campaign Concurrency**: Limits concurrent calls per campaign to prevent carrier trunk saturation.
   - **Phone Number Pacing**: Pacing per caller ID to prevent carrier spam flagging.

2. **Cloud Run Autoscaling**:
   - `voice-runtime`: Cloud Run `containerConcurrency: 1`, min 1 / max 50 instances, and 2 vCPU / 2 GiB per container. A telephone WebSocket gets one container until load tests establish a safe higher density.
   - `src/`: Cloud Run web service, min 1 / max 20 instances, scaling from HTTP traffic.
   - `services/campaign-worker`: GKE Autopilot Deployment, scaled from 1 to 20 replicas by KEDA using the Redis LIST depth (`sigulon:campaign:queue`). This is queue-driven autoscaling; it does not depend on HTTP traffic.

3. **Database & Connection Pooling**:
   - MongoDB connection-pool sizing and indexed tenant queries.
   - Keyset pagination on contacts and calls queries (no `OFFSET` skips).
   - Redis short-TTL caching for AgentConfig and VoiceSession state.
