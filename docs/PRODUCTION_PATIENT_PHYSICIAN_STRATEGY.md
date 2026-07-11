# Aleron MD production patient to physician workflow strategy

This document aligns agents working on the Aleron MD patient app, backend, and physician workflow. The goal is a real pilot spine, not a convincing prototype.

## North star

A patient can create an account, complete onboarding, submit a validated `patient_packet.v1`, and then wait while a physician reviews the case. The backend persists and advances the workflow. The physician releases a patient-safe package. The patient app displays only released clinical content plus safe logistics, messages, vitals, and actions.

The production spine is:

`patient account -> onboarding -> patient_packet.v1 -> backend events/jobs -> physician work queue -> review/sign/release -> patient-safe Home hub`

## Current principle

A surface is not production-ready because it has a screen, route, or model. It is production-ready only when it proves the real dependency works:

- Real backend, not fixtures.
- Durable database, not in-memory state.
- Authenticated actor, not spoofed headers.
- Idempotent workflow transition, not one happy-path POST.
- Patient-safe release boundary, not raw packet or engine data.
- Verified end-to-end with tests or live tool output.

## Environment policy

Every client and backend must know which mode it is running in.

- `demo`: fixtures are allowed and should be labeled.
- `local`: local backend allowed, fixture fallback only when explicitly configured.
- `staging`: real backend and durable database required. Silent fixture fallback is forbidden.
- `production`: real backend, managed database, real auth, strict release boundary required.

A TestFlight build intended for staging must fail loudly if the backend is missing or unhealthy. It must not silently show fixture Home, fixture patients, or simulated clinical progress.

## Backend requirements

### Database

Use a managed database for staging and production. SQLite is acceptable only for local pilot/dev.

Required data areas:

- accounts
- auth identities
- sessions
- patients
- onboarding steps
- patient packets
- physician work items
- reviews
- release packages
- orders and order events
- messages and message threads
- action progress
- monitoring alerts
- audit events
- domain events / outbox / jobs

Immutable artifacts must remain immutable: submitted packets, generated previews, signed release packages, and audit events. Mutable state such as lifecycle, review status, order status, and action progress must be stored separately.

### Auth and authorization

Pilot header spoofing is not acceptable in staging/production.

Required boundaries:

- Patient/member routes require a real session bound to an account and patient.
- Apple Sign In identity tokens must be verified server-side.
- Physician/admin routes require real physician/admin authentication.
- Patient A cannot access Patient B.
- Patients cannot access unreleased packets, engine artifacts, drafts, or physician-only notes.
- Physician access must be explicitly authorized, not inferred from a client-supplied role header.

### Workflow

Submitting a packet must trigger backend-owned workflow progress:

1. Validate packet.
2. Store immutable packet artifact.
3. Write audit event.
4. Create idempotent domain event.
5. Create or update physician work item.
6. Expose safe waiting status to patient.
7. Expose packet/work item to physician queue.

Duplicate submissions must be idempotent and must not create duplicate work items.

### Jobs/events

Use a simple, reliable job/event system before adding complex integrations. Staging can start with a database-backed outbox or job table.

Required events/jobs:

- packet submitted
- packet validated
- physician work item created
- review started
- release preview generated
- plan signed
- package released
- order status updated
- message sent
- monitoring event received

Each event/job must have retry/error visibility.

### Release boundary

The backend owns clinical release truth.

Before release, the patient app may see:

- account/onboarding status
- packet received status
- logistics/order status
- generic review status
- messages that are explicitly patient-visible

Before release, the patient app must not see:

- raw patient packet
- raw engine output
- physician draft plan
- unreleased clinical recommendations
- internal review notes

After release, the patient app may fetch only `release_package.v1` and patient-safe projections.

## Mobile app requirements

### No silent fixture fallback

Staging/TestFlight builds must require a real backend. If the API base is missing, malformed, unhealthy, or unreachable, the app must show a blocking backend configuration/error screen. It must not fall back to fixture state.

### Session restoration

The app must persist backend session tokens in Keychain and restore patient state from the backend on launch. Local app state is not authoritative.

### Incremental persistence

Each onboarding chapter should save to the backend as it completes. The app must resume from backend state after kill/reopen.

### Packet submission state

Packet submission needs explicit lifecycle states:

- not started
- building
- submitting
- submitted
- already submitted
- failed retryable
- failed blocking

Network failure cannot advance the app as if submission succeeded.

### Backend-derived Home/waiting state

Waiting and Home must come from backend state:

- packet received
- review status
- release package availability
- orders/logistics
- message threads
- actions
- vitals/wearable recency

### HealthKit

HealthKit data is optional but real. Permission denial or missing data must be represented as missing data, never fake data.

## Physician surface requirements

Minimum staging physician surface:

- Real physician login.
- Work queue of submitted patient packets.
- Packet review view.
- HealthKit/vitals summary.
- Missing data view.
- Review start action.
- Release preview creation.
- Sign/release action.
- Patient message action.

Design can be minimal at first. Function and workflow truth matter first.

## Acceptance test for the full staging spine

A staging build is aligned when this scenario passes:

1. Install TestFlight staging build.
2. Create account with Apple or email.
3. Backend creates account, auth identity, session, and patient.
4. Complete onboarding with HealthKit allowed or denied.
5. Backend stores onboarding steps.
6. App submits `patient_packet.v1`.
7. Backend validates packet and creates physician work item.
8. Physician sees work item in queue.
9. Physician starts review.
10. Physician creates release preview.
11. Physician signs/releases package.
12. Patient app polls and renders the released package.
13. Backend restart does not lose state.
14. Audit log reconstructs the chain.

## Agent operating rules

- Do not call a prototype screen, route, or local fixture production-ready.
- Do not hide backend failures behind fixture fallback.
- Do not add new workflow UI unless the state source is clear.
- Do not expose raw clinical packet/engine data to patient views.
- Add tests for actor boundaries, idempotency, persistence, and release visibility.
- Report blockers directly, especially fake adapters, local-only auth, and non-durable state.
