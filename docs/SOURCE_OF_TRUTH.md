# Aleron MD Source of Truth Index

Aleron MD is the renamed Meridian project. This file indexes external sources and legacy routes without editing those external artifacts.

## External Google Workspace sources

- Command Center sheet: `1sfzeMXM49GXjPLBWiiPetaJCSPBGgCQwgGhwCQYin3Y`
- Former Meridian roadmap doc: `10rtdk91LvjQQfO-EH8YGgkNEus7wdGXY_wUbry16c1s`
- Former Meridian Action Layer Prompt source of truth: `1WWIZoKUc-pRiefBcu5Srm4fpE29ZVNJUSkwGod_UIKI`

Do not rewrite live Google Docs unless Jason explicitly asks.

## External design sources

- Former Meridian Figma file: `zcCC2QIY7G2v9lmza5XXHE`, node `n21-32`
- UI kit Figma file: `iyGke5Dx1IPcQVBCyPgGBP`, node `n28-11678`

## Current live routes

- Landing staging: `https://yimjason01-blip.github.io/meridian-landing-staging/`
- Quality of Life model: `https://yimjason01-blip.github.io/qol-three-slider/aleron.html`
- Canonical physician dashboard shell: `https://yimjason01-blip.github.io/aleron-canonical-documents/#dashboard-ds`
- Direct staging physician dashboard: `https://yimjason01-blip.github.io/aleron-canonical-documents/apps/physician/index.html?staging=1`
- Real-member morning E2E runbook: `docs/qa/REAL_MEMBER_UI_E2E_RUNBOOK.md`

The canonical shell and direct staging URL route to the build-free `apps/physician/` runtime against staging project `rbdxzlzkxyprertdmpga`. The dashboard must display **Staging** before any test action. Production project `pqbbejplclpvkqvlrsdu` is not an E2E target. `system-design/diagrams/aleron-actionmap-al47m-ds.html` remains the unchanged golden design reference, not the runtime target.

The physician Pages overlay is prepared with `python3 scripts/deploy-canonical-documents.py --source-root "$PWD" --dashboard-runtime-only --dest <directory>` and verified in a real headless browser with `node scripts/test-canonical-pages.mjs`. Deployment is a separate explicit `--deploy` action. The scoped overlay preserves unrelated files already present in the Pages repository.

## Canonical internal docs

- Project coordination board: `docs/PROJECT_COORDINATION_BOARD.html`
- Production patient to physician strategy: `docs/PRODUCTION_PATIENT_PHYSICIAN_STRATEGY.md`
- Patient mobile visual and interaction reference: `patient-app/onboarding.v3.html`
- Native patient implementation: `apps/patient-ios/`
- Current shipping patient app: TestFlight Aleron **0.1.0 build 46** (staging API `rbdxzlzkxyprertdmpga`)
- Physician runtime implementation: `apps/physician/`
- Real-member E2E runbook: `docs/qa/REAL_MEMBER_UI_E2E_RUNBOOK.md`

Build 46 alignment for the patient mobile reference:

- Voice: record-and-transcribe primary CTA (not a mode stub)
- Lab path: Tasso shipping address required; Quest preference capture (not live booking)
- Wearable: always-visible Connect and sync Apple Health control; honest idle copy

## Naming rule

Use Aleron MD for current product work. Use Meridian only when referencing legacy filenames, legacy repo names, historical docs, or unchanged external routes.


## Currency of truth (operational)

**Physician dashboard case state is the operational currency of truth** for what is true about a patient *now* (packet, analysis, plan, readiness). Jason always reviews that state **through** the governing canonical documents (definitional truth).

| Layer | What it is | Where |
|---|---|---|
| Operational | `physician_case.v1` for the active patient | Dashboard runtime (`#dashboard-ds` → `apps/physician/`) |
| Definitional | Model docs, diagrams, schemas, action library | `system-design/`, `schemas/`, `docs/engineering/` |
| Binding | Dashboard **Currency of truth** panel + per-domain links | Live model_version + repo path on every clinical tab |

Rules:
1. Do not treat a golden design HTML alone as clinical truth — it is visual reference only (`aleron-actionmap-al47m-ds.html`).
2. Do not treat dashboard chrome copy as model law — the linked phenotype / risk docs are.
3. Wearable history requirements: `docs/engineering/WEARABLE_HISTORY_AND_TREND_REQUIREMENTS.md`.
4. Vitality protocol: `system-design/vitality-phenotype-model.md` (v1.5).
5. If dashboard and a canonical doc disagree, **fix the doc into the engine**, then re-emit the case — do not paper over in UI-only.

The dashboard surfaces this binding via `apps/physician/src/canonicalSources.js`.
