# Aleron MD Lifecycle State Machine v1

Status: Wave 1 product contract  
Scope: member enrollment through released plan and ongoing action tracking.

## 1. State machine rules

1. Backend owns lifecycle state.
2. Every transition writes an audit event with actor, role, timestamp, previous state, next state, reason, source artifact ids, and request id.
3. Patient app and physician app render current state from backend, not local guesses.
4. Patient-visible clinical content is gated by `release_state`, not by app route names.
5. Engine output cannot advance to patient visibility without physician review and release.
6. Failed vendor calls and missing data produce explicit blocked states, never silent skips.
7. Synthetic E2E must exercise the same transitions as a real patient with fake adapters.

## 2. High-level lifecycle

```text
member_enrolled
-> invite_sent
-> account_claimed
-> onboarding_in_progress
-> onboarding_complete
-> diagnostic_orders_pending
-> diagnostic_orders_created
-> samples_in_transit
-> results_partially_received
-> results_received
-> patient_packet_ready
-> engine_run_queued
-> engine_run_complete
-> physician_review_pending
-> physician_review_started
-> plan_editing
-> plan_ready_for_signature
-> plan_signed
-> plan_released
-> patient_plan_available
-> action_tracking_active
-> monitoring_active
```

Exception states:

```text
invite_expired
account_claim_blocked
onboarding_blocked
vendor_order_blocked
results_blocked
patient_packet_blocked
engine_run_blocked
physician_hold
signature_blocked
release_blocked
patient_visibility_blocked
monitoring_update_requires_review
```

## 3. Canonical states

| State | Entry condition | Reads | Writes allowed | Patient visibility | Exit condition |
|---|---|---|---|---|---|
| `member_enrolled` | Employer file accepted. | Enrollment record. | Invite task. | None. | Invite sent. |
| `invite_sent` | Welcome email dispatched. | Enrollment, invite token. | Link recovery request. | Email only. | Member opens valid link. |
| `invite_expired` | Token expired. | Invite token. | New invite request. | Recovery screen. | New invite sent. |
| `account_claimed` | Member activates with valid magic link. | Enrollment. | Account record, audit event. | Account claim confirmation. | Onboarding starts. |
| `onboarding_in_progress` | Any onboarding step started. | Onboarding state, member profile. | Step data, consent records, pause and resume state. | Current onboarding screens. | Required onboarding complete. |
| `onboarding_blocked` | Required step cannot complete. | Onboarding error, vendor/legal blocker. | Support resolution. | Error with retry or contact support. | Blocker resolved. |
| `onboarding_complete` | Required onboarding steps complete. | Onboarding state, consents. | Order requests. | Waiting state and panel explainers. | Diagnostic orders pending or created. |
| `diagnostic_orders_pending` | Member selected lab path, orders not yet created. | Order request. | Vendor adapter call, ops review. | Logistics pending. | Orders created or blocked. |
| `diagnostic_orders_created` | Lab or genetics orders accepted by adapter. | Order state. | Sample status updates. | Logistics status only. | Samples in transit or appointment booked. |
| `samples_in_transit` | Kit shipped, sample sent, or Quest appointment completed. | Vendor statuses. | Result ingest. | Logistics status only. | Results partially or fully received. |
| `results_partially_received` | Some results in, not enough for packet. | Result state. | Additional result ingest, missing data flags. | Logistics status and waiting. | Results complete or packet ready with missing data accepted. |
| `results_received` | Required results available. | Result state. | Packet validation. | Waiting state. | Patient packet ready or blocked. |
| `patient_packet_ready` | Validated packet exists with units and provenance. | Patient packet. | Engine run queue. | No new clinical visibility. | Engine run queued. |
| `engine_run_queued` | Engine job accepted. | Patient packet, library versions. | Engine artifacts. | No engine visibility. | Engine run complete or blocked. |
| `engine_run_complete` | Engine emits required artifacts. | `action_map_state`, `clinical_plan`, `run_audit`. | Review task. | No engine visibility. | Physician review pending. |
| `engine_run_blocked` | Engine validation fails. | Run error, audit. | Fix packet or library issue, rerun. | Waiting state only. | Engine run queued. |
| `physician_review_pending` | Completed engine run awaiting physician. | Engine artifacts, patient chart. | Assign physician, start review. | Waiting state only. | Review started. |
| `physician_review_started` | Physician opens review. | Full chart, artifacts, audit. | Lock or soft-lock review session. | Waiting state only. | Plan editing. |
| `plan_editing` | Physician edits draft plan. | Draft clinical plan, provenance. | Structured edits, overrides, deferrals. | Waiting state only. | Ready for signature or physician hold. |
| `physician_hold` | Serious finding, genetics rule, missing context, or clinical concern requires hold. | Hold reason. | Resolve, counsel, order follow-up. | Waiting or generic physician follow-up message. | Plan editing or release blocked. |
| `plan_ready_for_signature` | Physician marks release package ready. | Preview package, audit checks. | Sign, reject, return to edit. | Waiting state only. | Signed or signature blocked. |
| `signature_blocked` | Canvas or provider signature cannot complete. | Signature error. | Retry, route to native Canvas, admin intervention. | Waiting state only. | Signed or release blocked. |
| `plan_signed` | Physician signs or verified equivalent completes. | Signed plan, audit. | Release action. | Waiting state only. | Plan released. |
| `plan_released` | Backend emits released package. | Release package. | Notification, patient-visible plan availability. | Release notification. | Patient plan available. |
| `patient_plan_available` | Patient app receives release package. | Released package only. | Plan read receipts, action state, messages. | Doctor message, plan, risk, vitality if released. | Action tracking active. |
| `action_tracking_active` | At least one action visible. | Action lifecycle. | Schedule, start, complete, defer, ask physician. | Action controls. | Monitoring active or review-needed. |
| `monitoring_active` | Ongoing wearable, lab, action, message, or schedule updates. | Monitoring state. | Routine updates, alerts. | Released monitoring summaries. | Monitoring update requires review. |
| `monitoring_update_requires_review` | New data may change plan or needs physician attention. | Monitoring delta. | physician app review task. | Patient-safe pending review message. | Physician review pending. |
| `release_blocked` | Legal, vendor, clinical, or audit gate prevents release. | Blocker reason. | Resolve, hold, escalate. | Waiting state only. | Plan editing or plan released. |
| `patient_visibility_blocked` | App requests clinical content without release permission. | Release state. | Audit denied request. | Not shown. | Release package available. |

## 4. Release substates

`release_state` is orthogonal to lifecycle state and controls patient visibility.

```text
not_started
-> draft_engine_output
-> physician_reviewing
-> release_package_draft
-> signature_pending
-> signed_not_released
-> released_to_patient
```

Blocked substates:

```text
genetics_counseling_hold
serious_result_hold
legal_hold
canvas_signature_hold
audit_validation_hold
vendor_data_quality_hold
```

Patient app clinical visibility by release state:

| Release state | Patient app may show |
|---|---|
| `not_started` | Onboarding and logistics only. |
| `draft_engine_output` | Nothing from engine. |
| `physician_reviewing` | Waiting copy only. |
| `release_package_draft` | Nothing from draft package. |
| `signature_pending` | Waiting copy only. |
| `signed_not_released` | Waiting copy unless release flag is true. |
| `released_to_patient` | Released package content only. |
| Any hold | Hold-safe physician follow-up copy only. |

## 5. Action lifecycle

Each released plan action has its own state machine.

```text
not_started
-> scheduled
-> started
-> completed
```

Alternative transitions:

```text
not_started -> deferred
not_started -> ask_physician
scheduled -> reschedule_requested
started -> paused
started -> adverse_event_reported
any -> physician_review_required
```

Rules:

- Patient can defer with a reason or choose `ask_physician`.
- Physician can override action status with reason.
- Adverse event reports always create a physician review task.
- Completion must record source: patient attested, vendor confirmed, physician confirmed, or ops confirmed.

## 6. Genetics display gates

Genetics result states:

```text
not_ordered
consented_order_pending
ordered
sample_received
result_received
physician_review_required
counseling_required
released_routine
released_after_counseling
withheld_by_physician
```

Rules:

- VUS, serious, ambiguous, or context-heavy results are not patient-visible without physician release.
- Pathogenic or likely pathogenic findings require deterministic routing and physician control.
- Employer-visible state is always none. Genetic result data is never included in employer reporting.

## 7. Audit events required

Minimum audit event names:

- `member_enrolled`
- `invite_sent`
- `account_claimed`
- `consent_signed`
- `genetics_consent_signed_or_declined`
- `onboarding_step_saved`
- `order_requested`
- `vendor_status_updated`
- `result_ingested`
- `patient_packet_validated`
- `engine_run_started`
- `engine_run_completed`
- `engine_run_failed`
- `physician_review_started`
- `recommendation_edited`
- `recommendation_overridden`
- `recommendation_deferred`
- `hold_created`
- `hold_resolved`
- `release_preview_generated`
- `plan_signed`
- `plan_released`
- `patient_viewed_plan`
- `action_status_changed`
- `message_sent`
- `monitoring_alert_created`
- `patient_visibility_denied`

## 8. Synthetic E2E pass path

The fake-adapter E2E runner must exercise:

```text
member_enrolled
invite_sent
account_claimed
onboarding_in_progress
onboarding_complete
diagnostic_orders_created
results_received
patient_packet_ready
engine_run_complete
physician_review_pending
physician_review_started
plan_editing
plan_ready_for_signature
plan_signed
plan_released
patient_plan_available
action_tracking_active
monitoring_active
```

Pass condition: no manual JSON patch, no patient-visible draft output, audit log complete, and both apps see the same backend state.
