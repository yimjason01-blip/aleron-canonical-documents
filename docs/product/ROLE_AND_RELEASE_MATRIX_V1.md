# Aleron MD Role and Release Matrix v1

Status: Wave 1 product contract  
Scope: who can see, edit, release, and audit data across patient app, physician app, backend, and engine.

## 1. Role definitions

| Role | Description | Production entry |
|---|---|---|
| Member | Patient enrolled through employer benefit. | Patient iOS app. |
| Physician | Licensed clinician responsible for review, edits, signature, and release. | physician app, Canvas context, or linked provider auth. |
| Clinical ops | Non-physician operator managing logistics, scheduling, support, and vendor exceptions. | physician app ops views or admin console. |
| Admin | Aleron administrator for configuration, users, employers, release audit review, and vendor adapter settings. | Admin console. |
| Service worker | Backend or engine actor running jobs and vendor sync. | Server-side only. |
| Canvas | External EMR or system of record. | Adapter boundary. |
| Vendor | Branch, auth provider, Junction, Tasso, Quest, Invitae, scheduling, messaging. | Adapter boundary. |

## 2. Artifact access matrix

| Artifact | Member | Physician | Clinical ops | Admin | Service worker | Notes |
|---|---|---|---|---|---|---|
| Enrollment record | Own demographic summary after claim | Read | Read | Read/write | Create/update | Employer file details are not shown broadly. |
| Invite token | Use only | No | Resend/revoke | Resend/revoke | Create | Token never reveals PHI. |
| Account profile | Own profile | Read | Read/update support fields | Read/write | Update | Passwordless only. |
| Consent record | Read own signed records | Read | Read | Read/export | Write on submission | Legal content must be versioned. |
| Genetics consent | Read own decision | Read | Read status only | Read/export | Write on submission | Result data remains separate. |
| Onboarding state | Read/write own until complete | Read | Support edit with reason | Read | Persist | Clinical edits are not allowed by ops. |
| Symptom transcript | Read own submission | Read | Read only if support-approved | Read audited | Persist | Source voice/text stored. |
| Family history | Read/write own until locked | Read | Support correction only | Read | Persist | Becomes patient packet input. |
| Order state | Logistics visible | Read | Read/write logistics | Read/write adapter config | Update | Results hidden until release. |
| Raw vendor result | No | Read | No unless ops exception | Read audited | Ingest | Not patient-facing raw. |
| Patient packet | No | Read | Limited logistics metadata | Read audited | Create/validate | Facts, units, provenance. |
| Action map state | No | Read | No | Read audited | Create | Physician-facing only. |
| AI raw signal | No | Read with caution | No | Read audited | Create | Never patient-facing. |
| Clinical plan draft | No | Read/write | No | Read audited | Create draft | Not patient-visible. |
| Release package draft | No | Read/write | Preview only if assigned | Read audited | Validate | Must pass audit before release. |
| Released package | Read | Read | Read support-safe fields | Read/export | Publish | Patient app consumes this only. |
| Audit log | No | Read relevant patient | Read logistics events | Read/export | Append | Immutable append-only. |
| Message thread | Own threads | Assigned threads | Support threads | Read audited | Route/store | Role and context scoped. |
| Monitoring update | Released summaries | Full detail | Logistics subset | Read audited | Ingest | Clinical deltas may require review. |

## 3. Action permissions

| Action | Member | Physician | Clinical ops | Admin | Service worker |
|---|---:|---:|---:|---:|---:|
| Claim account | Yes | No | Assist resend only | Assist | Validate token |
| Sign standard consent | Yes | No | No | No | Timestamp and store |
| Sign genetics consent | Yes | No | No | No | Timestamp and store |
| Decline genetics | Yes | No | No | No | Store decision |
| Edit onboarding answer before lock | Yes | No | Support correction | No | Persist |
| Create lab order request | Yes, by selecting path | Approve if required | Coordinate | Configure | Submit adapter call |
| Change order logistics | Limited address or appointment | No | Yes | Yes | Sync vendor |
| Ingest results | No | No | No | No | Yes |
| Run engine | No | Request rerun | No | Trigger admin rerun | Yes |
| View action map | No | Yes | No | Yes audited | No UI |
| Edit clinical plan | No | Yes | No | No by default | No |
| Override recommendation | No | Yes with reason | No | No by default | No |
| Mark required item complete | No | Yes | Logistics-only for nonclinical tasks | Admin correction | No |
| Generate release preview | No | Yes | No | Yes audited | Validate |
| Sign plan | No | Yes only | No | No | No |
| Release plan | No | Yes only, or delegated only if legal approves | No | Emergency admin only with physician attribution rules | Publish after authorization |
| View released plan | Yes | Yes | Support-safe | Yes | No UI |
| Change action status | Yes for own action | Yes with reason | Scheduling status only | Correction | Vendor sync |
| Send physician message | Yes | Yes | Support scoped | Audited | Route/store |
| Send AI message | Yes within released context | Yes in chart context | No | Audited | Route/store |

## 4. Release matrix by state

| Lifecycle state | Member visible | Physician visible | Ops visible | Release allowed | Audit requirement |
|---|---|---|---|---:|---|
| `member_enrolled` | None | None or queue count | Enrollment logistics | No | Enrollment import. |
| `invite_sent` | Welcome email | Invite status | Resend status | No | Invite id and token hash. |
| `account_claimed` | Account claim confirmation | Member profile | Support profile | No | Actor and device context. |
| `onboarding_in_progress` | Current onboarding | Progress | Progress and blockers | No | Step saves. |
| `onboarding_complete` | Waiting state | Intake ready | Order readiness | No | Completion event. |
| `diagnostic_orders_created` | Order logistics | Order state | Full logistics | No | Vendor call ids. |
| `results_partially_received` | Waiting state | Result completeness | Missing vendor items | No | Result ingest ids. |
| `results_received` | Waiting state | Results ready | Completeness | No | Result provenance. |
| `patient_packet_ready` | Waiting state | Packet ready | Packet readiness only | No | Validator version. |
| `engine_run_complete` | Waiting state | Engine artifacts | Run status only | No | Run audit hash. |
| `physician_review_pending` | Waiting state | Review queue | Queue state | No | Assignment. |
| `physician_review_started` | Waiting state | Full chart | Queue state | No | Review opened. |
| `plan_editing` | Waiting state | Draft and provenance | Queue state | No | Every edit. |
| `physician_hold` | Hold-safe waiting copy | Hold details | Hold logistics if relevant | No | Hold reason. |
| `plan_ready_for_signature` | Waiting state | Preview and sign controls | Queue state | Not yet | Preview hash. |
| `signature_blocked` | Waiting state | Blocker | Blocker | No | Failure reason. |
| `plan_signed` | Waiting state unless released | Signed plan | Queue state | Yes | Signature event. |
| `plan_released` | Release notification | Released plan | Support-safe released state | Already complete | Release event and package hash. |
| `patient_plan_available` | Released package | Released package and full chart | Support-safe | No new release | Read receipt. |
| `action_tracking_active` | Action lifecycle | Action lifecycle | Scheduling support | No new release unless changed | Status change event. |
| `monitoring_update_requires_review` | Pending review copy | Review task | Alert logistics | No until reviewed | Alert event. |

## 5. Patient visibility gates

### Allowed before release

- Account claim and onboarding screens.
- Signed consent history.
- Order logistics and sample state.
- Waiting state.
- Plain-language panel explainers that do not reveal patient-specific results.
- Notification preferences.
- Wearable connection status.
- Intro call and scheduling state.

### Not allowed before release

- Raw lab values.
- Genetic findings.
- Risk model scores.
- Action map coordinates.
- AI candidate output.
- Draft recommendations.
- Draft physician notes.
- Clinical plan draft.
- Any hint that a serious result exists unless physician-approved hold copy is released.

### Allowed after release

- Physician message.
- Released plan actions.
- Released risk explanations.
- Released lab and genetic explanations only as permitted by release package.
- Provenance summary written for patients.
- Action lifecycle controls.
- Messages and appointments tied to released context.

### Never patient-facing

- Raw AI signals.
- Unscored AI candidates.
- Internal QALY derivation tables unless translated and explicitly released.
- Draft override reasons that are not included in patient-safe copy.
- Vendor raw payloads.
- Audit internals.
- Employer enrollment feed details beyond member-facing profile fields.

## 6. Release package requirements

A `release_package` must include:

1. Package id, source plan id, source engine run id, source action map state id.
2. Physician actor id and signature or release authorization id.
3. Release timestamp.
4. Patient-safe doctor message.
5. Visible actions with status initialized to `not_started` unless physician sets otherwise.
6. For each visible recommendation: why it matters, what to do, provenance summary, units for all values, evidence label, and next step.
7. Required items and holds.
8. Hidden items with patient visibility reason, stored for audit but not sent to patient app unless needed.
9. Genetics display policy for each genetics finding.
10. Audit validation result.

Release validation fails if:

- Any visible recommendation lacks provenance.
- Any visible clinical value lacks a unit.
- Any visible item is not present in the reviewed clinical plan.
- Any draft or raw AI field is included.
- Any required hold is unresolved.
- Physician actor or signature semantics are missing.

## 7. Canvas release semantics

Current decision: do not assume embedded Canvas signing works.

Permitted interim release architecture:

1. physician app prepares and previews the release package.
2. Physician completes whichever signature path the Canvas spike verifies.
3. Backend links Aleron release id to Canvas note id or signature id.
4. Patient visibility opens only after both Aleron release authorization and required Canvas linkage are satisfied, unless Jason and counsel explicitly approve a separate Aleron-only pilot release.

Required Canvas spike outputs before implementation lock:

- Patient context handoff behavior.
- Actor attribution for API effects.
- Whether embedded app can sign notes.
- Whether native Canvas sign button is required.
- Order transmission gate behavior.
- Screenshots, API responses, or test note ids for every claim.
