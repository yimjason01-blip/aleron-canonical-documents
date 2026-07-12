# Real-member UI end-to-end test

## Scope and safety

This runbook validates the shipping patient UI, physical-device Apple Health ingestion, staging canonical analysis, deployed physician dashboard, physician release, and patient receipt. Use synthetic test identity data only. Apple Health samples must come from the consenting tester's real device and must be handled as private health data.

**A run that taps Skip for now at the Apple Health step is a partial workflow test. It must not be reported as a complete product end-to-end test.**

- Patient app: TestFlight `Aleron` 0.1.0 **build 46** or newer
- Staging project: `rbdxzlzkxyprertdmpga`
- Physician UI: `https://yimjason01-blip.github.io/aleron-canonical-documents/apps/physician/index.html?staging=1`
- Patient prototype reference: `https://yimjason01-blip.github.io/aleron-canonical-documents/#onboarding`
- Clinical use: prohibited
- Never use the production project `pqbbejplclpvkqvlrsdu`.

## Prerequisites

1. Install build **46** or newer from TestFlight on a physical iPhone with Apple Health data available.
2. Use a new synthetic email address you can access, or the staging OTP echo when displayed.
3. Keep the patient app installed during the physician phase.
4. Open the physician URL above and confirm the top-right runtime badge says **Staging**.

## Phase 1: patient account, onboarding, and Apple Health

1. Launch Aleron.
2. Enter the synthetic email and tap **Send verification code**.
3. Enter the six-digit code and tap **Create account**.
4. Complete every visible page:
   - identity and demographics;
   - standard consents;
   - genetics consent/acknowledgements;
   - every family-history question;
   - symptom narrative (use **Record and transcribe** or type; continue only with a non-empty narrative);
   - every Vitality baseline and screener control;
   - lab path logistics;
   - Apple Health connection and sync;
   - introductory-call choice.
5. On lab path:
   - **Home capillary draw:** complete **Shipping address for kit** (full name, street, city, state, ZIP). Continue stays disabled without a complete address.
   - **Quest Diagnostics:** complete **Quest draw preference** (city/ZIP, preferred location name, preferred window). Live Quest booking is not active; preference capture is required.
6. On **Connect wearable data**, tap **Connect and sync Apple Health** (or **Connect Apple Health** then the sync control if both appear).
7. Grant the requested read permissions in the native Health authorization sheet.
8. Require at least one real value to appear with a recency-honest timestamp. A connected label without a returned value does not pass.
9. Tap **Save and continue**. Do not use **Skip for now** in a complete run.
10. On confirmation, tap **Send packet and go to Home**.
11. Expected result: Home/waiting state appears without an error and shows the same available Apple Health values. Record the displayed email and patient ID from Settings.
12. Verify through the staging API or physician Patient Data view that the stored `patient_packet.v1` contains the same Apple Health values, units, `measured_at`, and `source: apple_health`. Confirm `missing_data` no longer lists `wearables`, and no longer lists `vitals` when resting heart rate is present.

## Phase 2: physician review and release

1. Open the staging physician URL.
2. Select the member by email in **Patient case**.
3. Open **Patient Data** and confirm the Apple Health values match the patient app and stored packet, including units, source, and recency.
4. Open **Vitality** and confirm a triage result and dominant lever are present.
5. Open **Care Plan**.
6. Tap **Start review** if the case is not already in review.
6. Under required obligations, open each item. For every item without a persisted decision:
   - choose **Approve**;
   - choose `clinical_judgment_confirmed`;
   - enter a synthetic rationale;
   - tap **Save decision**.
7. Confirm every required item shows a persisted disposition.
8. Tap **Generate release preview**.
9. Confirm the preview reports validation **Pass** and includes at least one patient-visible action.
10. Check the physician attestation.
11. Tap **Authorize release**.
12. Tap **Release to patient**.
13. Reopen **Care Plan** if the dashboard returns to Patient Data during refresh.
14. Expected result:
    - **Released to patient**;
    - **Patient visible · read only**;
    - primary next action is **Verify patient receipt**.

## Phase 3: patient receipt and persistence

1. Cold-close and relaunch Aleron.
2. If needed, tap **Check for released plan**.
3. If the app was reinstalled, restore the same account through the normal email OTP UI; do not inject a patient ID or token.
4. Expected result:
   - **Your plan is ready.**;
   - release timestamp is present;
   - validation is **Pass**;
   - **First actions** is present;
   - at least one action is non-empty;
   - **View all actions** is enabled;
   - **No released actions yet.** is absent.
5. Open the action list and one action detail to confirm navigation works.
6. Return to Home after a cold relaunch and confirm the same Apple Health snapshot remains available. A snapshot that existed only during onboarding does not pass.

## Pass criteria

The run passes only when one email-created `member_*` account completes all three phases through visible controls, a real Apple Health sample survives authorization, persistence, packet projection, physician rendering, and cold restore, and the physician case is `released_to_patient`, patient-visible, and read-only.

The simulator automation that chooses **Skip for now** proves only the non-HealthKit workflow. Its evidence must be labeled `partial_workflow_no_healthkit`.

## Known UI behavior

After Start review, Save decision, authorization, or final release, the physician dashboard may return to **Patient Data** while refreshing. Reopen **Care Plan** and evaluate the durable state. Do not repeat an action solely because a transient success message disappeared.

## Failure capture

Record:

- TestFlight build number;
- synthetic email and patient ID;
- screen and control where the failure occurred;
- visible error text;
- screenshot;
- whether retrying Refresh or reopening Care Plan changed the durable state.

Do not record OTPs, session tokens, authorization headers, or real patient data.
