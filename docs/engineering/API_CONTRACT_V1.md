# Aleron MD API Contract v1

Status: Wave 2 schema and API foundation  
Scope: pilot-ready shared state spine for patient app, physician app, backend, engine service, vendor adapters, release loop, and audit replay.

## Contract rules

1. Backend owns lifecycle state and release state. Apps render current backend state.
2. Engine accepts a validated `patient_packet` plus a versioned `library_manifest` and emits three first-class artifacts: `action_map_state`, `clinical_plan`, and `run_audit`.
3. Patient app receives clinical results and actions only through `release_package`.
4. Every state transition, release decision, override, vendor update, message, and patient-visible action update appends an `audit_log` event.
5. Vendor payloads are normalized before they enter app state. Raw vendor payloads are never the app contract.
6. JSON schemas in `schemas/` are the shared contract for request and response bodies.

## Schema registry

- `schemas/patient_packet.schema.json`
- `schemas/library_manifest.schema.json`
- `schemas/consent_record.schema.json`
- `schemas/onboarding_state.schema.json`
- `schemas/order_state.schema.json`
- `schemas/action_map_state.schema.json`
- `schemas/clinical_plan.schema.json`
- `schemas/run_audit.schema.json`
- `schemas/release_package.schema.json`
- `schemas/message_thread.schema.json`
- `schemas/audit_log.schema.json`
- `schemas/structured_override.schema.json`

Example lifecycle payloads live in `fixtures/synthetic/`:

- `fixtures/synthetic/enrolled_or_onboarding.json`
- `fixtures/synthetic/engine_run_complete_review_pending.json`
- `fixtures/synthetic/physician_released_plan.json`

## Endpoint list

### Local pilot fixture and runtime helpers

These routes are local pilot scaffolds, not clinical source routes:

- `GET /health` returns storage mode, backend ownership claims, and visibility policy.
- `POST /fixtures/seed` ensures the synthetic member exists. Query `reset=true` resets durable SQLite first when `ALERON_BACKEND_DB` is set.
- `POST /fixtures/reset` resets durable SQLite before reseeding the synthetic member.
- `GET /fixtures/backend-snapshot` returns the current backend-owned local snapshot.
- `GET /fixtures/backend-snapshot/canonical` returns the checked-in canonical local snapshot fixture.

The same setup loop is available without FastAPI through `python3 -m app.dev seed`, `python3 -m app.dev reset`, `python3 -m app.dev smoke`, and `python3 -m app.dev api-smoke` from `backend/`.

### Enrollment and onboarding

#### `POST /members/enrollments`
Creates a member enrollment from an employer or admin import and writes `member_enrolled`.

Response artifacts: enrollment metadata and audit event.

#### `POST /members/{patient_id}/invites`
Issues or reissues an account-claim invite. Writes `invite_sent`.

#### `POST /account-claims`
Claims an account with a valid token. Writes `account_claimed`.

#### `GET /patients/{patient_id}/onboarding-state`
Returns `onboarding_state.v1`. See `fixtures/synthetic/enrolled_or_onboarding.json`.

#### `PATCH /patients/{patient_id}/onboarding-state`
Persists step progress, intake answers, wearable status, lab path selection, and intro-call state. Writes `onboarding_step_saved` audit events.

#### `POST /patients/{patient_id}/consents`
Creates a `consent_record.v1` for standard, telehealth, HIPAA, diagnostics, genetics, or data-use consent. Local route is implemented and writes `consent_signed` or `genetics_consent_signed_or_declined`.

#### `GET /patients/{patient_id}/consents`
Returns the member-visible consent history and the physician or admin audit view according to caller role. Local route is implemented and writes `consent_viewed`.

### Orders, diagnostics, and normalized results

#### `POST /patients/{patient_id}/orders`
Creates an `order_state.v1` through a fake, sandbox, or production adapter. Order types include home lab kit, venous lab, genetics, wearable sync, and appointment.

#### `GET /patients/{patient_id}/orders`
Returns normalized order states. Patient role receives logistics-only fields until release.

Local pilot routes implemented as `POST /orders/{patient_id}`, `GET /orders/{patient_id}`, `POST /orders/{patient_id}/{order_id}/status`, `POST /orders/{patient_id}/{order_id}/results`, and `POST /vendor-events/{adapter}`. The generic vendor event route dispatches adapter events containing `patient_id` and `order_id` into the same status or result normalization handlers. Status ingestion writes `vendor_status_updated`. Result ingestion normalizes a fake local result, writes `result_ingested`, stores a backend-only result artifact, and when all local orders have results builds a backend-only `patient_packet.v1` artifact that advances `results_received` to `patient_packet_ready` with `patient_packet_validated`.

#### `POST /vendor-events/{adapter}`
Ingests vendor webhooks or recorded sandbox events and normalizes them into `order_state` updates plus audit events.

The v1 local adapter is `local_diagnostics_fake`. It is dependency-light and local only. It does not retain raw vendor payloads in patient-visible responses and redacts lab or genetics interpretation fields before normalized result storage.

#### `POST /patients/{patient_id}/patient-packets/validate`
Validates a candidate `patient_packet.v1` before engine execution. Returns structural pass or fail, missing data, provenance warnings, and packet hash. Local route is implemented for physician, admin, clinical-ops, and service-worker roles only; successful validation stores a backend-only packet artifact and audits `patient_packet_validated`.

#### `GET /patients/{patient_id}/patient-packets/latest`
Physician, admin, clinical-ops, and service-worker endpoint for the latest validated patient packet. Not patient visible; member access is blocked and audited with `patient_visibility_denied`.

### Engine service

#### `POST /engine/runs`
Creates a deterministic engine run from one validated `patient_packet.v1` and one validated `library_manifest.v1`. Non-demo service calls must provide both. Synthetic patients are accepted only when `run_options.fixture_mode`, `run_options.demo_mode`, or `run_options.test_mode` is explicit, and local default library manifests are accepted only under explicit local pilot/demo/test flags.

Request body shape:

```json
{
  "patient_packet": { "schema_version": "patient_packet.v1" },
  "library_manifest": { "schema_version": "library_manifest.v1" },
  "run_options": {
    "ai_discovery_mode": "disabled",
    "max_non_required_recommendations": 3
  }
}
```

Fixture/demo request body shape:

```json
{
  "synthetic_patient_id": "ethan-park",
  "run_options": {
    "fixture_mode": true
  }
}
```

Response body shape:

```json
{
  "run_id": "run-syn-001",
  "status": "completed",
  "artifact_refs": {
    "action_map_state": "/engine/runs/run-syn-001/action-map-state",
    "clinical_plan": "/engine/runs/run-syn-001/clinical-plan",
    "run_audit": "/engine/runs/run-syn-001/audit"
  },
  "summary": {
    "required_items": 1,
    "recommended_next_steps": 1,
    "warnings": 0,
    "audit_pass": true
  }
}
```

Example artifact set: `fixtures/synthetic/engine_run_complete_review_pending.json`.

#### `GET /engine/runs/{run_id}`
Returns run metadata, hashes, versions, lifecycle status, release state, and artifact refs. Does not return PHI-heavy artifacts by default.

#### `GET /engine/runs/{run_id}/action-map-state`
Returns `action_map_state.v1`. physician app may render this. Patient app may not receive it before release.

#### `GET /engine/runs/{run_id}/clinical-plan`
Returns `clinical_plan.v1`. physician app renders and edits this through structured overrides.

#### `GET /engine/runs/{run_id}/audit`
Returns `run_audit.v1` with pipeline steps, normalized checks, warnings, artifact hashes, patient packet hash, library hashes, reducer policy version, blocked and deferred items, AI candidate counts, and synthesis checks.

#### `POST /engine/runs/{run_id}/validate`
Revalidates stored run artifacts against schemas, stored artifact hashes, and audit checks. The local route validates persisted `action_map_state.v1`, `clinical_plan.v1`, and `run_audit.v1` only. It does not rerun the engine or recompute, rank, or synthesize clinical recommendations.

### Physician review and release

#### `GET /physician/work-queue`
Returns patients grouped by lifecycle state, blockers, assigned physician, and release state.

#### `POST /patients/{patient_id}/reviews`
Starts physician review and writes `physician_review_started`.

#### `POST /clinical-plans/{plan_id}/overrides`
Creates a `structured_override.v1`. Required for edits, deferrals, rejections, holds, approvals, and status overrides.

#### `POST /clinical-plans/{plan_id}/release-preview`
Builds a release preview from a reviewed clinical plan and returns validation results. Patient visibility remains closed.

#### `POST /clinical-plans/{plan_id}/sign`
Records the verified Canvas-safe signature or interim release authorization handle. Writes `plan_signed` or `signature_blocked`.

#### `POST /clinical-plans/{plan_id}/release`
Creates or finalizes `release_package.v1`, writes `plan_released`, and opens patient visibility only for package content. The local backend also ensures a patient-visible `message_thread.v1` with `thread_type: released_plan`, adds the physician's initial release message with the released key actions, and stores `release_message_thread_id` plus release context on the package. This message behavior is a backend release seam, not a Canvas signing claim.

#### `GET /patients/{patient_id}/release-package`
Patient endpoint for the current `release_package.v1`. Returns 404 or hold-safe waiting copy until `release_state` is `released_to_patient`. Example: `fixtures/synthetic/physician_released_plan.json`.

### Patient plan, actions, messaging, and monitoring

#### `POST /patients/{patient_id}/actions/{action_id}/state`
Updates released action lifecycle: `not_started`, `scheduled`, `started`, `completed`, `deferred`, `ask_physician`, `paused`, `adverse_event_reported`, or `physician_review_required`.

Local pilot route implemented as `POST /actions/{patient_id}/{action_id}/progress`; it persists the action state and writes `action_status_changed`.

#### `GET /actions/{patient_id}/progress`
Returns backend-owned local action progress records for the patient.

#### `GET /patients/{patient_id}/message-threads`
Returns role-scoped `message_thread.v1` records.

#### `POST /patients/{patient_id}/message-threads`
Creates a thread tied to a released plan, action, ops support issue, or care-team context.

#### `POST /message-threads/{thread_id}/messages`
Sends a role-scoped message and writes an audit event.

Local pilot routes are `POST /messages/{patient_id}` and `GET /messages/{patient_id}`; messages are persisted with the patient record and audited. `POST /messages/{patient_id}` attaches to an existing released-plan or action thread when context matches, otherwise it creates a backend-owned local thread.

#### `POST /patients/{patient_id}/monitoring-events`
Ingests wearable, lab, action, message, or schedule updates. The local route stores a backend-only `monitoring_event.v1`, writes `monitoring_event_ingested`, and creates a physician-review monitoring alert when severity or event type requires review. Monitoring ingestion does not mutate an already released patient package.

### Audit

#### `GET /audit/events`
Query audit events by `patient_id`, `run_id`, `release_id`, `actor_id`, event name, or timestamp window. Admin and physician roles only.

Pilot export events include actor attribution, UTC timestamps, request IDs, source artifact IDs when available, and `payload_hash`. Events created with payloads must carry a 64 character SHA-256 payload hash. Audit exports reference artifacts by ID and hash rather than embedding raw patient packets or draft engine output in patient-visible surfaces.

#### `POST /audit/replay`
Replays an audit log for a patient or synthetic fixture and verifies the lifecycle state sequence, release gates, artifact hashes, and actor attribution.

See `docs/qa/PILOT_PRIVACY_AUDIT_GUARDRAILS.md` for the local privacy and audit verifier scope.

## Current validation level

`tools/validate_schemas.py` validates fixture artifacts against the JSON schemas using `jsonschema` when installed. If unavailable, it falls back to minimum required-field structural checks. The current schemas intentionally keep `additionalProperties: true` so backend and app agents can start integration without blocking on every future clinical subfield. Tightening nested clinical value units, evidence traces, and role-specific response projections remains a follow-up.
