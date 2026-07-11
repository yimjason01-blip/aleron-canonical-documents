# Aleron Risk Models — Interactive Widgets & Design Decisions (Agent Handoff)

_Last updated: 2026-06-28. This is a living context doc for the interactive risk-model explainers and the reasoning behind them. Read it before editing any `system-design/diagrams/aleron-*.html` widget or reasoning about cross-model data/cost._

## What this covers

The five Aleron phenotype risk models each have a self-contained interactive HTML widget, plus a tabbed shell that holds all of them. This doc records what they are, the design decisions that are easy to break, the per-model math, how to verify changes, and the open questions surfaced while building them. The authoritative model specs live elsewhere (condensed specs in `system-design/`, releases in this folder); this doc is about the widgets and the thinking, not a replacement for the specs.

## File inventory

All widgets are self-contained HTML (inline CSS+JS, no build step), served by the `system-design` preview server at `http://localhost:8870/diagrams/...`.

| File | Model | Base | Status |
| --- | --- | --- | --- |
| `system-design/diagrams/aleron-prevent.html` | Cardiovascular | AHA PREVENT (2023) | live-recomputed base |
| `system-design/diagrams/aleron-ckd.html` | Kidney (CKD) | CKD-PC / KFRE | base = anchor |
| `system-design/diagrams/aleron-metabolic.html` | Metabolic | QDiabetes-2018 (two gates) | base = anchor |
| `system-design/diagrams/aleron-neuro.html` | Neurodegenerative | CogDrisk-ML | base = anchor |
| `system-design/diagrams/aleron-cancer.html` | Cancer | four site engines + sporadic burden | mixed |
| `system-design/diagrams/aleron-risk-models.html` | **Tabbed shell** holding all five via iframes | — | wrapper |

Condensed specs (source of truth for math/thresholds): `system-design/{cvd,ckd,metabolic,neuro}-phenotype-risk-model-condensed.md`; cancer at `models/risk-models/cancer/sporadic-cancer-burden-calculator-v0.md`.

## The core architecture — and the one decision not to break

Every widget is **two layers, kept visually and logically distinct**:

- **Layer 1 — base.** The validated population model.
- **Layer 2 — the Aleron modifiers.** A transparent overlay of phenotype signals the base does not capture.

**The critical honesty decision:** only the **CVD** widget recomputes its base **live from published coefficients** — PREVENT's equations are public, and the widget reproduces them exactly (validated three ways; see the disclaimer in that file). The **CKD, neuro, and metabolic** bases are **NOT recomputed** — their source models report discrimination / are treated as point estimates and have no reproducible closed form. In those three, **Layer 1 is a base "anchor" the user sets directly**, and only **Layer 2 (the modifiers) is fully computed**. Do not "upgrade" those three to fake a live base equation — that would fabricate coefficients and is explicitly avoided. Each lede states this.

The modifier layer (Layer 2) is faithful to the spec in all five and **is** computed exactly. If you change modifier math, change the spec too (and vice versa).

## Per-model combination math (Layer 2)

| Model | Modifiers | Combination |
| --- | --- | --- |
| CVD | Lp(a), ApoB/LDL-C discordance, hs-CRP, HOMA-IR, CRF | four lab modifiers multiply under a **2.0× cap**; CRF applied separately/last (**0.65–1.5×**). `adj = base × min(lpa·apob·crp·homa, 2.0) × crf` |
| CKD | cystatin-C discordance, UACR trajectory, BP control, glycemic/IR, nephrotoxins | flat product under **one 3.0× cap**; nephrotoxins take the **single highest** rung (don't multiply); UACR rung **suppressed in Stage B** (eGFR<60 or UACR≥30) to avoid double-counting KFRE. `adj = base × min(Π, 3.0)` |
| Neuro | biomarkers (p-tau217/NfL), vascular/metabolic, lifestyle/sensory, family history, CRF | **log-additive sigmoid** with per-domain caps (bio 3.0, vascular 2.5, lifestyle 2.5, family 1.5), CRF applied last (**0.6–1.4×**), **global cap min(modified×CRF, 3.0×base)**. Biomarkers combine with a 0.7 correlation-attenuation when both elevated; lifestyle uses partial credit. |
| Metabolic | insulin resistance, central adiposity+trajectory, hepatic FIB-4, family history, CRF | **Gate 1** sigmoid: non-CRF log-contribution **capped at 3.0×**, CRF last (**0.65–1.4×**); **coverage rule** holds at base when no non-CRF modifier is informative. **Gate 2** (established T2D) emits a **severity vector, no probability**. |
| Cancer | four independent site engines (breast/lung/colorectal/prostate) + sporadic-burden collection | no composite; per-engine. Thesis: sensitivity is concentrated (lung explodes on smoking; others flat). Already has a true fixed sensitivity panel. |

Why the split (flat vs sigmoid): CVD and CKD keep a flat product because their base risks are low enough that a flat product and a sigmoid agree. Neuro and metabolic keep the sigmoid because many modifiers stack / the base can be high, and a flat product would overshoot.

**APOE4 (neuro) is deliberately NOT in the score.** It is a consented strategy input that sets biomarker-surveillance cadence and prevention intensity only. Selecting any genotype must never change the adjusted number — it only updates the strategy panel. This was QA-verified across all four genotypes; preserve it.

## Worked-example anchors (these should reproduce)

| Widget | Default / preset | Expected |
| --- | --- | --- |
| CVD | default patient | adjusted ≈ 3.6% |
| CKD | Patient A (base 4%, BP uncontrolled, HOMA 4.8) | ×1.68 → **6.7%**; Patient B ≈ 1.8% |
| Neuro | decliner (base 3.5%, p-tau 1.7×, sleep+hearing, CRF 60th) | **8.3%** |
| Metabolic | SP-001 base-only → **held at 8.0%**; M-002 → **43.7%** (cap binds) | Gate-2 M-003 = poorly-controlled / high / cardiorenal+statin+weight gaps |

**Known intended divergence:** the metabolic widget caps M-002's non-CRF contribution at ×3.0 per the formula (→43.7%), whereas the spec's M-002 *prose* used the uncapped ×3.25 (→45.8%). The widget implements the formula and discloses this in its footer. (See open items.)

## Sensitivity maps — "What drives risk most" (most recent redesign)

The per-widget panel formerly titled "Where the risk/adjustment comes from" was **current-state attribution** (it decomposed whatever the sliders were set to — a lever that was off showed nothing, so it largely re-drew the slider state). It was converted to a **fixed sensitivity map**, modeled on the cancer widget's patient-independent fold-range panel:

- Each bar = the risk **swing from a lever's best to worst setting**, others held at a **fixed reference**, **ranked**, and **static** (it does not move when you drag the sliders).
- Reference points: CVD = representative 55-yo female; CKD = 8% base; neuro = 5% base; metabolic = 15% base (stated in each caption). Rankings are essentially base-independent; absolute points scale with the reference.
- **CVD has an outcome toggle** (Total CVD / ASCVD / Heart failure) because PREVENT fits each outcome separately and the sensitivity profiles genuinely differ: **BMI drives heart failure only** (zero weight in ASCVD/total), and **cholesterol drives ASCVD only** (zero weight in HF). The toggle makes that mirror image visible.
- This is **CVD-specific**; the other four produce a single outcome each, so no toggle.

Design note worth knowing: a tornado/sensitivity ranking is only as fair as the chosen ranges. **eGFR ranks #2 in CVD total-risk sensitivity, but it is a threshold variable** — essentially flat above eGFR 60 and a cliff below it (PREVENT spline knot at 60). The #2 rank reflects sweeping eGFR to 20 (advanced CKD, rare). Decision (user): **keep full-range sweeps** — the model genuinely weights kidney decline heavily (it is a convergent CVD amplifier: volume/pressure overload, vascular calcification via phosphate/FGF-23, uremic endothelial toxicity, anemia, inflammation). For a normal-kidney patient eGFR would rank near the bottom; that's expected.

## QA status

Each of CKD/neuro/metabolic went through **two independent QA rounds** (math faithfulness re-derived in node against the specs, JS/runtime review, selector-collision checks) plus live-browser verification. All worked examples reproduce; no console errors; APOE4 non-interference confirmed. The sensitivity-map rewrite and CVD outcome toggle were node- and browser-verified (rankings correct, maps confirmed static, other sections intact).

Verification recipe for future edits:
1. **Math:** extract the relevant JS function(s) into a node script and check the worked-example anchors above (`scratchpad/*_check.js` are examples of this).
2. **Runtime:** load via the preview server, check `preview_console_logs` for errors, confirm presets/toggles behave and (for sensitivity maps) that they stay static when sliders move.
3. Keep edits surgical — change only the function and labels in scope; don't touch base math or other sections.

## Open items for the spec authors (surfaced during widget QA)

These are **spec** inconsistencies, not widget bugs:

1. **Metabolic M-002** prose sums the modifier contribution to ×3.25 and reports 45.8%, but the stated formula caps non-CRF contribution at ×3.0 (→43.7%). The widget caps per the formula. Decide which the prose should reflect.
2. **CKD Patient B** prose says "nothing else fires," but §2.3's own rung gives **0.9× (protective)** for BP <120/80 — and Patient B is 118/72. Rounds to ~2% either way, but the prose contradicts the rung.
3. **Neuro §2.2** is silent on two BP zones — treated-but-uncontrolled HTN (on meds, SBP ≥140) and untreated SBP 130–139. The widget makes a defensible conservative choice for each; the spec doesn't define them.

## Data-cost picture (per patient, year one)

From a workflow that enumerated every input across all five models, deduplicated, and priced at US cash/concierge rates:

- **~$430** — lean panel (core labs + specialty modifiers + wearable CRF), no neuro biomarkers, no genetics.
- **~$1,130** — all scored model + modifier data (adds neuro plasma biomarkers p-tau217+NfL, ~$700 — the dominant driver).
- **~$2,400** — plus all opt-in genetics (APOE, CKD monogenic, metabolic PRS), which route *outside* the scored models.

Heavy sharing is the efficiency story: one blood draw + one urine + one wearable feeds most models (a single CMP absorbs ~7 analytes; one lipid panel, one HbA1c, one fasting insulin each serve 3–4 models). History/intake and all derived metrics (eGFR, HOMA-IR, FIB-4, WHtR, etc.) are $0 marginal. Steady state after year one ≈ ~$385/yr (genetics are one-time; biomarkers run on a multi-year cadence). Marginal cost to *add* a model, scored-data only: Cancer $0, CVD ~$110, CKD ~$45, Metabolic ~$18, Neuro ~$700.

## Conventions to preserve

- Self-contained HTML; shared design tokens (`--bg/--fg/--line/--muted/--faint/--shade/--hi`) with `prefers-color-scheme` dark mode.
- The tabbed shell uses **iframes** so each model's CSS/JS stays isolated (they reuse IDs like `#out`/`#wf`/`#torn` and globals like `S`/`render()`). Never inline the widgets into one document.
- Keep Layer 1 vs Layer 2 distinct, and keep the anchor-vs-live-base honesty intact.
