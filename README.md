# Sigulon — AI voice-calling SaaS for Indian SMBs

Agents that answer and dial over real phone lines: LiveKit Cloud voice path
(Plivo SIP trunks · Deepgram nova-3 STT · Gemma 4 31B LLM · Cartesia Sonic 3 TTS)
via the `sigulon-voice-agent` worker, async campaign dialing, credit-ledger
billing, and a multi-tenant Next.js dashboard.

## Quickstart

```bash
npm install
cp .env.example .env.local          # fill MongoDB, LiveKit, Plivo SIP, Redis
npm run dev                          # web on :3000
```

Full local voice stack (needs Docker + a LiveKit Cloud project):

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
- `voice-runtime/` — LiveKit Agents worker (`uv sync`, `python agent.py start`, tests via unittest)
- `services/campaign-worker/` — async LiveKit dial worker (same uv workflow)
- `docs/` — guides · `deploy/gcp/` — web (Cloud Run) + workers (GKE/KEDA)

## Docs

- `docs/architecture.md` — system map, flows, scaling notes
- `docs/voice-runtime.md` — endpoints, providers, tools, contract
- `docs/campaigns.md` — lifecycle, queue, worker semantics, DNC
- `docs/multi-tenancy.md` — auth model, enforcement, honest gaps
- `docs/billing.md` — ledger, reserve/settle, top-ups
- `docs/deployment.md` — web, workers, MongoDB, Redis, LiveKit + Plivo SIP checklist
- `docs/load-test-plan.md` — 10 → 1000 tier plan (measure, don't assume)
- `deploy/gcp/README.md` — Google Cloud production topology and automated deployment

## Status

The supported call path is Plivo SIP → LiveKit Cloud → Agents worker
(`sigulon-voice-agent`), with MongoDB for durable state and Redis for
queues/config cache. Inbound: Plivo Zentrunk → LiveKit inbound trunk → room
+ dispatch → worker greets. Outbound: room + AgentDispatch + SIP participant
(callee speaks first). See the deployment guide before pointing numbers at
LiveKit.

## Agent Bundle Format (bundle_version 2) & Few-Shot Examples

Agents in Sigulon are defined, stored, and executed as a node graph using the **Agent Bundle Format (bundle_version 2)** (`src/lib/agent-bundle/schema.ts`).

### Bundle Structure
```json
{
  "bundle_version": 2,
  "exported_from": {
    "employee_name": "Ravi",
    "employee_role": "Insurance Lead Quality Checker",
    "mode": "bulk",
    "language": "te-IN"
  },
  "first_response": "హలో అండి, {{lead_name}} తో మాట్లాడుతున్నానా?",
  "sections": [
    {
      "section_key": "greeting_purpose",
      "label": "Greeting & Purpose",
      "order": 1,
      "enabled": true,
      "node_type": "llm",
      "edges": [
        { "to_key": "qualify_vehicle", "condition": "if customer confirms name and is open to speaking" }
      ],
      "prompt": "Instruction for the LLM node, ending with: For example you might say: '...'"
    },
    {
      "section_key": "faqs",
      "label": "Business FAQs & Policy Knowledge",
      "order": 5,
      "enabled": true,
      "node_type": "llm",
      "edges": null,
      "prompt": "Answer ONLY from what's written here; if a question isn't listed, use your don't-know response.\n\nQ: ...\nA: ..."
    },
    {
      "section_key": "close",
      "label": "Call Wrap Up",
      "order": 6,
      "enabled": true,
      "node_type": "llm",
      "edges": null,
      "prompt": "Thank the caller warmly and wish them a great day. For example you might say: '...'"
    }
  ],
  "variables": [
    {
      "key": "phone",
      "label": "Phone Number",
      "source": "pre",
      "required": true,
      "is_phone": true,
      "is_lead_name": false,
      "value_type": "text"
    },
    {
      "key": "lead_name",
      "label": "Lead Name",
      "source": "pre",
      "required": false,
      "is_phone": false,
      "is_lead_name": true,
      "value_type": "text"
    }
  ]
}
```

### Key Rules
- **Node Graph Integrity**: Section orders are sequential integers `1..N`. Terminal sections (such as `close` and `faqs`) have `edges: null`. All `to_key` values must reference existing sections with no unreachable orphan sections.
- **Mandatory FAQs**: Every bundle must include a `faqs` section (`edges: null`) containing the exact instruction: `"Answer ONLY from what's written here; if a question isn't listed, use your don't-know response."`.
- **Variables**: Exactly one variable must have `is_phone: true` (`key: "phone"`, `source: "pre"`, `required: true`). Exactly one variable must have `is_lead_name: true` (`key: "lead_name"`). All `{{variable}}` tags in `first_response` or any prompt must exist in `variables[]`.
- **Language Consistency**: The script text must match `exported_from.language` (e.g. `te-IN` requires Telugu script, `hi-IN` requires Hindi script).
- **Voice Guidelines**: Prompts follow the 1-question-at-a-time rule, warm conversational tone with polite markers (`అండి`), and end with an example line.

### Adding New Few-Shot Example Bundles
Reference example bundles are located in `/docs/examples/`:
- `docs/examples/ravi-insurance-bulk.json` — Outbound/bulk motor insurance renewal qualifier.
- `docs/examples/imran-realestate-instant.json` — Instant inbound/outbound real estate plot qualifier.

To add a new example bundle:
1. Create `<name>-<industry>-<mode>.json` in `docs/examples/`.
2. Ensure the JSON strictly passes the bundle validator (`validateAgentBundle(bundle).valid === true`).
3. Import the JSON in `src/lib/agent-generation.ts` and add it as an example in the few-shot section of `SYSTEM_PROMPT`.
4. (Optional) Reference it in `generateDeterministicBundle` fallback routines for matching domains.
