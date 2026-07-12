# Aleron MD Project State

Last updated: 2026-07-12 (TestFlight 0.1.0 build 46; prototype + canonical docs aligned)

## Current shipping patient app

- App: TestFlight `Aleron` 0.1.0 **build 46**
- Bundle: `com.aleronmd.patient`
- Staging backend: Supabase project `rbdxzlzkxyprertdmpga`
- Visual / interaction reference: `patient-app/onboarding.v3.html`
- Native implementation: `apps/patient-ios/`

Release 46 product surfaces that must match the prototype:

1. Symptom narrative: **Record and transcribe** with live on-device speech; **I would rather type** secondary.
2. Lab path: Tasso requires full **shipping address**; Quest requires **draw preference** capture (city/ZIP, location name, preferred window). Live Quest booking is not active.
3. Wearable: idle copy **Choose how you want to handle Apple Health**; primary **Connect and sync Apple Health**; **Skip for now** remains available.

## Current workspace

- Repo folder: `aleron-md` (consolidated monorepo/source). Environment name for E2E is **staging**, not a repo name.
- Working candidate used for shipping: milestone worktree when active; product surfaces above are the currency of truth for the patient app.

## Project identity

Aleron MD is the renamed Meridian project. Public naming should be Aleron MD. Meridian may appear only as historical source, legacy repo name, or prior artifact name.

## Consolidation status

Jason's current rule: **one canonical local project folder for Aleron MD.** All active or
historical Aleron/Meridian local work should be reachable under:

`/Users/jasonyim/Projects/aleron-md`

The folder now has two layers:

1. **Outer consolidated workspace snapshots** retained for cross-surface reference:

- `landing/`: imported from `meridian-landing-staging` at commit `a6e751e`.
- `qol-three-slider/`: imported from `qol-three-slider` at commit `8106a29`.
- `docs/intended-flow/`: imported from `meridian-intended-flow` at commit `54d9b12`.
- `physician/design-system/`: imported from `meridian-ds` at commit `5486ca4`.
- `physician/prototype/`: imported from `meridian-prototype` at commit `efcc7a4`.
- `conversation-prototype/`: imported from `meridian-conversation-prototype` at commit `b6d35bc`.
- `patient-app/`: snapshot of the dirty local `MeridianPatient` worktree.
- `docs/vitality-models/`: snapshot of local `MeridianVitalityModels`.
- `docs/system-map/`: snapshot of local `MeridianPhysician/system-map`.

2. **Independent deployable repo clones under `workspaces/`**, moved here on 2026-06-20
   to eliminate `~/Projects` sprawl while preserving each repo's `.git` history/remotes:

- `workspaces/live-site-aleron-pitch-deck/`: moved from `~/Projects/aleron-pitch-deck`.
  This is the verified source for `https://aleronmd.com/`.
- `workspaces/landing-staging/`: moved from `~/Projects/meridian-landing`.
- `workspaces/website-v1-batch/`: moved from `~/Projects/aleron-website-v1`.
- `workspaces/physician/`: moved from `~/Projects/MeridianPhysician`.
- `workspaces/qol-three-slider/`: moved from `~/Projects/qol-three-slider`.
- `workspaces/qol-calibration/`: moved from `~/Projects/qol-calibration`.
- `workspaces/vitality-models/`: moved from `~/Projects/MeridianVitalityModels`.
- `workspaces/intended-flow/`: moved from `~/Projects/MeridianIntendedFlow`.
- `workspaces/jobs-archive/`: moved from `~/Projects/aleron`.

The outer repo ignores `workspaces/*` except `workspaces/README.md`; edit/deploy from the
specific nested workspace repo when changing a live surface.

## Dirty-source note

`patient-app/` was copied from a worktree that was behind its remote and had local modified, deleted, and untracked files. That snapshot preserves the local state rather than forcing a merge.

Before making serious patient-app changes, compare against `origin/main` in the legacy repo and decide whether to reconcile remote changes.

## Live public site finding (2026-06-20)

`https://aleronmd.com/` is served by GitHub Pages from:

- GitHub repo: `yimjason01-blip/aleron-pitch-deck`
- Local path: `workspaces/live-site-aleron-pitch-deck/`
- Branch/path: `main` / repo root
- Custom domain: `aleronmd.com` via `CNAME`
- Verified live hash equals local `workspaces/live-site-aleron-pitch-deck/index.html` hash:
  `0ce67b138b28af74ae79aaa259fb101d87178f3360d236747a3348729cf6d358`

The live custom domain does **not** depend on `landing/`, `workspaces/landing-staging/`,
`workspaces/website-v1-batch/`, or local folder names. It depends on the GitHub Pages repo
above. Local moves do not affect the live site unless a future edit is committed and pushed
from that repo.

## Current product state

Aleron MD is being developed as a premium preventive medicine product with landing, patient, physician, engine, conversation, and teaching-tool surfaces.

The landing is currently split between:

- `landing/index.html`: root deployed page from the original landing repo.
- `landing/v2.html`: current higher-fidelity landing candidate.

Treat `landing/v2.html` as the current design candidate. Treat `landing/index.html` as the current root entry. Do not merge or promote without an explicit task.

The Quality of Life teaching tool lives at:

- `qol-three-slider/aleron.html`

## Live routes

- Public custom domain: `https://aleronmd.com/` (source: `workspaces/live-site-aleron-pitch-deck/`)
- Landing staging: `https://yimjason01-blip.github.io/meridian-landing-staging/`
- Quality of Life model: `https://yimjason01-blip.github.io/qol-three-slider/aleron.html`
- Canonical physician dashboard: `https://yimjason01-blip.github.io/aleron-canonical-documents/#dashboard-ds`
- Direct staging physician dashboard: `https://yimjason01-blip.github.io/aleron-canonical-documents/apps/physician/index.html?staging=1`

These live routes still deploy from legacy repos unless deployment is reconfigured.

## Important files and folders

Top level:

- `AGENTS.md`: consolidated agent guide.
- `PROJECT_STATE.md`: consolidated current state.
- `README.md`: workspace overview.
- `docs/SOURCE_OF_TRUTH.md`: external source-of-truth index.
- `handoffs/README.md`: cross-workspace handoff template.

Product surfaces:

- `landing/`: public landing site and visual prototypes.
- `workspaces/live-site-aleron-pitch-deck/`: live public custom-domain site.
- `workspaces/landing-staging/`: staging/member/login/design-system clone.
- `workspaces/website-v1-batch/`: brand and website batch workspace.
- `patient-app/`: patient-facing prototype snapshot.
- `patient-app/onboarding.v3.html`: canonical patient onboarding and Home-hub visual reference for the native iOS app. Older onboarding HTML files are historical references.
- `apps/patient-ios/`: native patient implementation used for the real-member staging E2E.
- `apps/physician/`: canonical physician dashboard runtime used for staging review and release.
- `physician/design-system/`: physician design system.
- `physician/prototype/`: physician-facing clinical prototype and engine harness.
- `conversation-prototype/`: conversation prototype.
- `qol-three-slider/`: Quality of Life teaching tool.

Docs and models:

- `models/`: fixed model release artifacts, especially PDF snapshots.
- `models/risk-models/`: released PDF versions of risk-model specs, organized by domain.
- `models/risk-models/ckd/`: CKD risk-model PDF releases.
- `models/risk-models/cvd/`: CVD risk-model PDF releases.
- `models/risk-models/metabolic/`: metabolic risk-model PDF releases.
- `models/risk-models/cancer/`: cancer risk-model PDF releases.
- `models/risk-models/neuro/`: neurocognitive / neurologic risk-model PDF releases.
- `models/vitality-models/`: released PDF versions of vitality-model specs.
- `docs/intended-flow/`: intended flow chart.
- `docs/vitality-models/`: working vitality state model drafts.
- `docs/system-map/`: system map artifact.

## Current open questions

- Whether `landing/v2.html` should replace `landing/index.html` as the root public landing.
- Whether deployment should move from legacy GitHub Pages repos to this consolidated repo.
- Whether `patient-app/` should be reconciled with the newer remote `meridian-patient` history.
- Whether older Meridian-named artifacts should be renamed in place or preserved as historical names until touched.

## Verification baseline

No single build step covers the whole workspace yet.

Before declaring changes done:

1. Search changed files for em dashes.
2. Verify referenced assets exist.
3. Open changed HTML locally or on GitHub Pages.
4. If behavior changed, test the actual browser interaction.
5. If a package subproject changed, run that subproject's available build or smoke test.
