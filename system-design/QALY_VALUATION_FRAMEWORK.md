# Aleron QALY Valuation Framework

**Status:** governing methodology for how every intervention's value is calculated in the Aleron engine (action library, action maps, model outputs). Supersedes the earlier per-event/compressed-ranking approach. Written 2026-06-30.

**Ratified decisions.** The method's open forks were ruled and codified 2026-07-02 — see **`QALY_METHOD_DECISIONS.md`** for the reviewable ledger (D1–D10: each fork, ruling, rationale, faithfulness audit, and upgrade path). The governing test for every ruling: *neither under- nor over-represent the value of an intervention or piece of information.* The inline markers below (e.g. "ratified 2026-07-02, D2") point back to that ledger.

> One sentence: an intervention's value is **the change it makes to the area under the patient's lifetime quality-of-life curve** — measured the same way for a drug, a diet, a screen, or fitness, from the patient's perspective, with honest zeros where a channel does not apply.

---

## 0. Why this exists

Aleron is a concierge longevity clinic. The only beneficiary we optimize for is **the patient**. Value is therefore measured as true value to that person, not as a payer's cost-effectiveness or a number chosen to survive a reimbursement challenge. Every intervention must be run through **one** model, or comparisons between them are meaningless. (The failure this fixes: fitness was being scored on a rich multi-channel model while drugs were scored on a thin events-only model, making the comparison structurally unfair.)

**Scope: three co-equal arms.** The action library spans **lifestyle interventions, therapeutics, and diagnostics**, and must be **comprehensive** across all three (tip-of-the-spear: even low-evidence/frontier items on-radar with honest effect-size + evidence grade, never silently absent). Lifestyle and therapeutics are valued by **direct QALY** via the C1/C2/C3 channels (§3). **Diagnostics are first-class, not an afterthought.** They produce no QALY directly; their value is **Value of Information (VOI)**, denominated in the *same* QALYs, and they live on the *same* decision surface, rendered as squares rather than therapy/lifestyle circles. But Aleron does **not** let expected VOI hide the patient-relevant story: every diagnostic must expose (1) the probability of meaningful reclassification and (2) the QALY value if that reclassification occurs (§6A). A diagnostics arm that is entries-only / un-VOI-scored is an incomplete library.

---

## 0.5 External grounding — the method is a recomposition, not an invention

This framework does not invent a valuation science. Every mechanism below is drawn from established health-economics or geroscience methodology; Aleron's contribution is the **recomposition** (one intervention scored on all three channels at once, with honest zeros; therapies and diagnostics placed on one decision surface) and **one deliberate perspective departure** (patient-payer, not payer/societal — §2, §13). A reader should be able to trace each gear to its literature home:

| Aleron component | Established method it uses | Anchor |
|---|---|---|
| Value = Δ∫S(t)·u(t)dt (the QALY itself) | Standard QALY: length × quality of life, single index | Weinstein, Torrance & McGuire, "QALYs: The Basics," *Value in Health* 2009; Gold, Siegel, Russell & Weinstein, *Cost-Effectiveness in Health and Medicine* (First Panel), 1996 |
| **C1 — prevention** (fatal→length, non-fatal→height) | Mortality/morbidity decomposition in primary-prevention cost-effectiveness analysis | First Panel (1996); Sanders et al. (Second Panel), *JAMA* 2016 |
| **C2 — capacity / healthspan** (quality of the years you'd live anyway, independent of any disease event) | WHO **Intrinsic Capacity**; geroscience "compression of morbidity"; the economic value of healthspan | WHO *World Report on Ageing and Health* 2015 + ICOPE 2019; Rolland et al. (ICFSR & Geroscience Task Force), [*Nature Aging* 2023](https://www.nature.com/articles/s43587-023-00531-w) (IC proposed as a composite trial endpoint precisely because disease endpoints miss it); Scott, Ellison & Sinclair, "[The economic value of targeting aging](https://www.nature.com/articles/s43587-021-00080-0)," *Nature Aging* 2021 — finds **morbidity compression is worth more than further life extension**, i.e. the empirical case that C2 is large, not a rounding term |
| **C3 — resilience** (residual events that still occur go better: lower case-fatality, faster recovery) | Secondary-prevention / case-fatality analysis; physiologic **reserve** and physical-resilience construct in aging | Standard secondary-prevention CEA; geroscience reserve/resilience literature (Rolland et al. 2023) |
| Effect sizes (RRR) held on a separate axis, used as-is | RCT / meta-analytic relative effects | e.g. Cholesterol Treatment Trialists' (Baigent et al.), *Lancet* 2010 — statin RRR ~22% per mmol/L LDL |
| Evidence never multiplied into value (§5 firewall) | Certainty-of-evidence rating kept distinct from effect magnitude | GRADE Working Group |
| **Diagnostics = VOI** (P_reclass × ΔQALY_if_reclassified) | Value-of-Information analysis; reclassification metrics | ISPOR VOI Task Force Reports 1–2 (Rothery et al.), [*Value in Health* 2020](https://www.valueinhealthjournal.com/article/S1098-3015(20)30036-X/fulltext); Pencina et al. (NRI/IDI), *Stat Med* 2008; clinical instances CorCal 2022 / MESA 2015 (§13) |
| Uncertainty as low/central/high | Probabilistic sensitivity analysis / credible ranges | Standard PSA (ISPOR good-practice) |

**The one genuine departure — and it is a *values* choice, not a methods invention.** Aleron scores from the **patient-payer** perspective: no time-preference discounting of health, patient-realistic utilities, best-estimate causal effects over defensive lower bounds (§2). This diverges from the payer/societal reference case that dominates the literature, and it is defended — with the same sources that establish the mainstream — in §2A and §13. It is flagged here because it is the part a reviewer will (correctly) challenge first, and it should be met as a deliberate, argued stance rather than an oversight.

**Most contested single choice, stated plainly:** the **0% health discount rate**. Mainstream CEA discounts health ~1.5–3.5%/yr (NICE, Second Panel). Aleron replaces time-preference discounting with **survival-probability weighting** on principle — a person does not value their own future healthy self at a markdown; the only honest reason a far benefit is worth less is that they might not be alive to collect it, which S(t) already captures. This is a defensible minority position, not the consensus; it is held knowingly, and it is the single assumption most responsible for why far-future-heavy levers (fitness) score high here relative to a conventional analysis.

---

## 1. First principle — one curve, one integral

Define the patient's expected lifetime quality curve:

```
Q(t) = S(t) · u(t)
```

- `t` = age (from the patient's current age to the end of plausible life).
- `S(t)` = probability the patient is alive at age t (the survival curve).
- `u(t)` = health-state utility if alive at age t (0 = death, 1 = full health; **can be < 0** for states worse than death).

Lifetime quality-adjusted life-years = `∫ Q(t) dt = ∫ S(t)·u(t) dt`.

The **value of any intervention** is the change it produces in that integral:

```
ΔV = ∫ [ S'(t)·u'(t) − S(t)·u(t) ] dt
```

where primes denote the with-intervention curves. Expanding (and dropping the small second-order cross term):

```
ΔV ≈ ∫ ΔS(t)·u(t) dt   +   ∫ S(t)·Δu(t) dt
      └─ LENGTH ─┘          └─ HEIGHT ─┘
```

**There are only two fundamental things any intervention can do:** add life-years (push the curve's right edge out / lift the survival curve), or raise the quality of the years lived (lift the height of the curve). Every QALY we ever credit is one of these two. Everything below is just how we compute them without double-counting.

---

## 2. The patient-value lens (the rules that make ΔV a *patient* number)

These apply to **every** channel of **every** intervention, uniformly:

1. **No time-preference discounting (0%).** Discounting future health is a budget/opportunity-cost construct; a person does not value their own future self at a markdown. We do **not** apply a 3% (or any) annual discount to health.
2. **Survival-probability weighting only.** The one legitimate reason a far-future benefit is worth less is that the patient might not be alive to collect it. That is captured by `S(t)`, not by a discount rate. A benefit at 85 is multiplied by the chance of reaching 85 — nothing more. **`S(t)` is patient-risk-adjusted, not a flat population table (D5):** bend the actuarial baseline by the patient's own modeled mortality (the risk models already estimate it), cohort-basis where feasible. **The integral runs to full life expectancy (D5):** the risk models' 30-year window is a model boundary, not a life boundary — carry the last modeled hazard forward past it (flagged as extrapolation); benefit accrues only while the intervention is sustained (treatment-sustained horizon).
3. **Best-estimate causal effects, not defensive floors.** Where evidence is observational, weigh it honestly (dose-response, Mendelian randomization, biological gradient) against null/underpowered trials and state a **central** estimate with a range. Do not default to the most-defensible lower bound. (RCT-grade effects, e.g. most drug effect sizes, are already the causal estimate and are used as-is.) **Default causality haircut for observational effects = 0.55 (band 0.40–0.70), stated per-lever where MR evidence justifies moving it (D3).**
4. **Patient-realistic state utilities.** Use the utility a person would actually assign to a state, not a textbook population average. Frail/dependent/"can't do what I want" old age is rated low (~0.35–0.45), advanced dementia very low (~0.05–0.22), etc.
5. **Counterfactual.** Value = the *change* the intervention causes versus the patient's baseline trajectory — never the whole year. (Crediting a year the patient would have lived anyway as full value is the most common QALY error.)
6. **Full achievable potential.** Score the value if the intervention is achieved and sustained. Achievability/adherence is applied **later, at selection** — not baked into the value. **Feasibility/adherence enters selection as a separate, visible axis, never multiplied into value (D10)** — like the evidence firewall (§5). The physician sees full potential and realistic-capture as two numbers, not one blended one.
7. **Honest uncertainty as a range.** Every value carries central / low / high. The low column is the conservative-but-fair number (the right anchor for a sober decision), not a worst case. We strip payer *under*-claiming; we do not swing to hype *over*-claiming.

What we deliberately **exclude** and why: time-preference discounting (payer budget construct), defensibility-as-objective (reimbursement posture), textbook-average utilities (population/payer default), and any "keep it comparable / don't let it balloon" suppression. See §13.

### 2A. Imported QALY evidence arrives with a payer lens

Most published QALY work is not written for the Aleron decision context. It is usually written for health-system allocation, reimbursement, coverage policy, or public health budgeting. That does not make the QALY unit wrong; it means the surrounding assumptions are usually not patient-native.

Before importing any QALY estimate, explicitly strip or restate:

- **Perspective:** payer, health care sector, societal, or patient-payer. Aleron uses **patient-payer**: the patient is the beneficiary and the customer.
- **Discount rate:** conventional analyses often discount future health. Aleron does not discount health for time preference; it survival-weights instead.
- **Cost threshold:** dollars-per-QALY thresholds answer a payer allocation question. Aleron may show patient cost and burden, but it does not use reimbursement-style willingness-to-pay thresholds as the definition of value.
- **Utility source:** population utilities can understate what a specific patient would value about independence, vitality, cognition, or avoiding dependency.
- **Expected-value compression:** population expected value is useful for ranking, but it can hide rare, high-consequence patient value. When this occurs, show the conditional value and the probability separately.

Research guardrail: treat external cost-effectiveness papers as **source material**, not as final Aleron values. The external paper may provide effect sizes, event rates, utility estimates, or cost context. The Aleron engine must then re-express the value through the patient-value lens in §2.

---

## 3. The three computation channels

The two fundamental terms (length, height) are computed through three **mechanisms**. Every intervention is scored on **all three**, with an honest **0** where it does not act. This is the symmetry that makes the map fair.

### C1 — Prevention (events that never happen)
Reducing the incidence of bad events (disease onset, acute events, death from non-modeled causes).
- A prevented **fatal** event → **length** (life-years gained, valued at the utility those gained years are actually lived at, ~baseline `u`).
- A prevented **non-fatal** event → **height** (the disease-state disutility dip × its duration, avoided).
- Includes **all-cause mortality from causes outside the modeled diseases** (respiratory, infection, sudden death, frailty/falls) where the intervention plausibly reduces it.
- Formula sketch: `Σ_outcomes  Δincidence · [ fatal_fraction · life_years_lost·u_lived  +  nonfatal_fraction · utility_decrement · duration ]`, survival-weighted, undiscounted, best-estimate.
- **Do not truncate by booked endpoint.** If a drug reduces mortality, credit the mortality even if the cited trial's primary endpoint omitted it (this is the statin fix — derived from the principle, not a patch).

**C1 method rule — curve-shift for length, event-based for height (ratified 2026-07-02, D2; see `QALY_METHOD_DECISIONS.md`).**
- The **length/mortality term is computed as a survival-curve shift**: `∫ [S_treated(t) − S_baseline(t)] · u(t) dt` — the §1 integral applied to the mortality hazard. This is the primary method, not an alternative: it is the definition. It natively handles competing risk (via the full `S(t)`), postponement vs. prevention (it credits life-years-at-quality gained whether the event is removed or delayed — answering "statins postpone, not prevent"), and the no-truncation rule above.
- The **height/non-fatal term stays event-based** (the `nonfatal_fraction` half of the formula sketch): postponing a non-fatal event is worth avoiding its disutility for the window, not a life-year.
- **Event-counting is retained only as a cross-check bound**, not the number on the map. Divergence > ~2× between the two flags a review.
- **Magnitude is accepted at full undiscounted value; never capped.** Under the 0% discount (§2.1) an averted fatal event is worth its full remaining life × utility. Capping the value to express extrapolation uncertainty is forbidden — that is an evidence-axis property (§5) and a band property (§9), not a value adjustment. Five ratified guards keep the (larger) curve-shift number faithful rather than inflated: risk-adjusted `S(t)` (D5), the causality haircut (§2.3, D3), the evidence axis + band, the event-based height term, and the treatment-sustained horizon bound (D5).
- **C1 per-event inputs are always a derivation object** — `{event_age, fatal_fraction, RLE × u_lived, nonfatal_decrement × duration}` — **never a bare scalar.** The undefensible asserted `0.8` per-event value was exactly what a bare scalar produces.

### C2 — Capacity (raise the baseline height)
Raising `u(t)` in the years lived, **independent of any specific disease event**. This is healthspan.
- **C2a — independence/threshold:** keeping function above the level needed to live independently / do what one wants, deeper into late life (the curve stays high instead of sagging into dependency).
- **C2b — reserve/vitality:** a per-year utility uplift across lived years (more capability, less fatigue).
- Formula sketch: `∫ Δu_baseline(t) · S_baseline(t) dt`, applied to **baseline-survival years only**.
- **Pure prevention drugs score C2 = 0** (a statin does not make your Tuesday better). Fitness, diet, weight loss, strength, sleep, etc. score C2 > 0. The zero is honest and visible.

**C2 Δu anchoring rule — how `Δu_baseline` is sourced (ratified 2026-07-02, D1).** The per-year utility uplift is not asserted; it is anchored:
- **Central estimate = within-person utility deltas from exercise/intervention RCTs** — EQ-5D / SF-6D (or equivalent) measured in the same person before and after a sustained fitness/activity change. This is the direct causal read, and it is chosen deliberately because the levers that dominate C2 are exercise/fitness/activity levers. Cross-sectional "fit people report higher QoL" comparisons cannot separate causation from selection and so are **not** used as the point estimate.
- **Band and durability check = cross-sectional CRF-vs-QoL gradients.** Trials are short (weeks to ~a year); C2 integrates Δu across decades of survival-weighted years. The cross-sectional gradient sets the upper band and tests whether the fit/unfit quality gap *persists* across the lifespan — it bounds the extrapolation, it does not anchor it.
- **Measured net of event-driven quality.** Use event-free participants or the physical-function/energy subscales, not disease-symptom relief — otherwise the same felt-better is booked in C1/C3 as well and orthogonality (§4) breaks.
- **Applied per-lever.** Each C2 lever is anchored to *its own* within-person evidence. Exercise is simply the best-populated case, never a template magnitude copied onto diet/sleep/weight levers that must earn their own Δu.

This replaces the bare `c2_capacity` scalar in the library with a derivation (`capacity_conditioning(Δu_anchor, swy, dependency_compression)`, per the worked trace). Adopting it validates rather than moves the current fitness central (RCT Δu ≈ 0.02–0.06/yr reproduces the library's ~2.6 over the horizon); the change is that the number now has a source and is computed once instead of hand-entered in multiple surfaces.

### C3 — Resilience (the dips that still occur, but go better)
For events that **still happen** (residual incidence after C1), improving the outcome: lower case-fatality, less resulting disability, faster recovery, better procedure/treatment tolerance.
- Case-fatality reduction → **length**; disability/recovery improvement → **height**.
- Formula sketch: `Σ_outcomes  residual_incidence · Δ(outcome | event) · value_at_stake`.
- Most pure drugs score C3 = 0. Fitness scores C3 > 0 (carrying fitness into an illness improves how you weather it).

**Net value of an intervention = C1 + C2 + C3 − burden** (see §7), with bundle de-duplication (§8).

---

## 4. Orthogonality — the no-double-count rules

These are mandatory; they are what let us sum the channels.

1. **Each averted death is counted once.** C1 acts on events that never occur (the person never has the disease); C3 acts on events that do occur (the person survives the event better). These are disjoint populations — no overlap.
2. **Life-years are valued at their lived quality, once.** Extra years from C1 (fatal events averted) or C3 (case-fatality) are valued at the utility those years are actually lived at. They are **not** then additionally upgraded by C2.
3. **C2 applies to baseline-survival years only.** The capacity uplift raises the quality of years the patient would have lived anyway. It is never applied to the extra years that C1/C3 created (those are already valued at their lived quality in rule 2).
4. **Morbidity vs baseline are different parts of the curve.** A disease-state year (a dip, valued in C1-nonfatal / C3-disability) and a healthy baseline year (valued in C2) are different years; never apply both to the same year.

---

## 5. Evidence is a separate axis (the firewall)

**Value (QALY) is never multiplied by evidence strength.** Each action carries two independent numbers: its QALY value (this framework) and its evidence grade (strong / moderate / weak; surrogate-flagged if the endpoint is a surrogate). The decision surface plots them on two axes:
- High value + strong evidence → **act**.
- High value + weak evidence → **get evidence** (act only if downside is small), never auto-act.
A big-but-unsure option must not be able to pose as a sure one. (Worked case: acarbose can top the value axis on weak evidence — it is not the pick.)

---

## 6. Per-action scoring procedure

For each intervention:
1. Identify the outcomes it acts on and its **effect size** (relRed) — RCT-grade where available, best-estimate causal otherwise.
2. Score **C1** (prevention, incl. full mortality + any non-modeled all-cause), **C2** (baseline capacity uplift — usually 0 for drugs), **C3** (resilience given residual disease — usually 0 for drugs), each as central/low/high, under the §2 lens.
3. Apply **counterfactual** and **orthogonality** (§4).
4. Subtract **burden** (§7).
5. Record the **evidence grade** separately (§5).

Honest zeros are the norm for C2/C3 on pure drugs and are *recorded as zero*, so the model can show they are zero rather than structurally absent.

## 6A. Diagnostics: value of reclassification

Diagnostics are valued by the management change they make possible. In most cases, diagnostic value reduces to two patient-relevant quantities:

```
P_reclass = probability the result meaningfully changes the decision class
ΔQALY_if_reclass = QALY gain if that reclassification occurs
```

Simple case:

```
Expected diagnostic VOI = P_reclass · ΔQALY_if_reclass − test_burden
```

Full path case:

```
Expected diagnostic VOI = Σ_paths P(path) · ΔQALY_management_change(path) − test_burden
```

Where:

- `P_reclass` means the probability of a **meaningful** reclassification, not any numeric movement.
- `ΔQALY_if_reclass` means `QALY(best management after the result path) − QALY(best no-test plan)`, under the same patient-value rules in §2.
- `test_burden` includes financial cost to the patient, time, anxiety, radiation/procedure risk, false-positive cascade, and false-negative reassurance where applicable.

### What counts as reclassification

Reclassification is broader than a risk bucket change. It includes any result that moves the patient into a different decision class:

- **Risk reclassification:** CAC shows plaque burden that changes CVD risk framing.
- **Eligibility reclassification:** OGTT changes prediabetes to diabetes and unlocks different medication logic.
- **Severity reclassification:** FibroScan changes MASLD suspicion to staged fibrosis or MASH pathway.
- **Safety reclassification:** ECG/Holter changes nocturnal bradycardia from likely physiologic to rhythm disease.
- **Treatment-intensity reclassification:** CAC or follow-up ApoB changes lipid target intensity.
- **Do-not-treat reclassification:** a negative test prevents unnecessary medication, referral, or surveillance.
- **Sequencing reclassification:** a result changes what must be solved first, even if the final action list is similar.

### Required diagnostic fields

Every diagnostic entry should carry central/low/high where possible:

- `reclassification_probability`
- `qaly_if_reclassified`
- `value_channel` — **mandatory (D7):** the channel(s) the downstream value actually flows through, so the number cannot be misread. E.g. HSAT = *felt-quality (C2) + BP-sequencing*, explicitly **not** CV-prevention (C1), because CPAP's CV-event evidence is null (SAVE). The number 0.45 is defensible as felt-quality; the same number read as CV prevention would not be. The label is the guardrail against both misreadings (dismissing a real felt-quality value for lacking outcome trials, or inflating it into hard-outcome prevention).
- `expected_voi`
- `dominant_reclassification_path`
- `downstream_decisions_changed`
- `test_burden`
- `false_positive_or_cascade_risk`
- `evidence_grade`

Expected VOI remains useful for comparing diagnostics under a diagnostic budget. But the physician-facing and patient-facing explanation should put `reclassification_probability` and `qaly_if_reclassified` first. A rare but high-consequence diagnostic should not look mediocre simply because expected value compresses a large conditional value through a small probability.

### Display rule

Default diagnostic display:

```
Odds of meaningful reclassification: 30%
Value if reclassified: 0.30 QALY
Expected VOI: 0.09 QALY
```

The expected VOI is the accounting value. The first two lines are the clinical story.

### CAC example

For a patient with measured Lp(a), measured ApoB, family history, and modest short-horizon risk, CAC is not valuable because it directly treats anything. Its value comes from whether it changes the lipid decision class:

- If CAC is high, it may justify more aggressive ApoB lowering, more urgent statin discussion, add-on therapy consideration, and a different patient risk narrative.
- If CAC is zero, it may reduce urgency or intensity, while still preserving inherited-risk context from Lp(a) and family history.
- If CAC is intermediate or concordant with the pre-test plan, it may improve confidence but create little formal reclassification value.

Therefore the diagnostic model should not show only "CAC VOI = 0.09 QALY." It should show the decomposition: probability of action-changing reclassification and QALY if the reclassification occurs.

---

## 7. Burdens

Burden = the patient's real lived cost of the intervention, subtracted from benefit.
- Ongoing process disutility (e.g. a daily pill, a training program's time/effort), **undiscounted** over the horizon.
- Class-specific harms valued as real lived cost (e.g. aspirin GI/intracranial bleeding, canakinumab serious infection, pioglitazone heart failure/fracture).
- Burdens use the same patient-value lens (undiscounted, patient-realistic). Net can be negative; harm-dominated interventions correctly show negative net.

**Burden cadence rule (ratified 2026-07-02, D4).** Burden is modeled at its **true cadence**, on the same clock as the benefit — every action declares `burden_units ∈ {per_year, one_time}`.
- **Chronic** burdens (daily pill, sustained side-effect risk, ongoing behavior friction) are a **per-year disutility integrated over the sustained horizon, survival-weighted** — because benefits are lifetime-integrated, a burden borne every year must be too, or the net is dishonest.
- **One-time** burdens (procedure risk, a single injection/test event) are a **lump**.
- The per-year value must be the true small lived cost (a well-tolerated daily pill is ~0.001–0.005/yr, not 0.13). A single undeclared scalar is ambiguous by ~26× (a chronic burden read as a total silently vanishes); declaring the cadence *and* using a realistic per-year value is the faithful reading. Default: chronic therapy/lifestyle = `per_year`; procedure/diagnostic = `one_time`.

---

## 8. Bundles (shared levers)

One behavior or molecule that acts across several diseases/outcomes is **one lever**: its benefits across outcomes are **additive** (each disease helped, counted once), but its **burden is counted once**. Examples: physical activity (CVD + metabolic + cancer + neuro), a statin (CV events + stroke), a Mediterranean diet (CVD + T2D + cancer). De-duplicate by lever before ranking or summing.

---

## 9. Uncertainty and honesty audit

- Every value is **central / low / high**. Low = conservative-but-fair (sober-decision anchor); central = best estimate; high = if-everything-holds.
- A standing **patient-honesty audit** checks each result for (a) over-claim / false hope, (b) double-counting, (c) whether the central is a genuine best-estimate rather than a ceiling or a floor. (This is the inverse of a payer "defensibility" audit.)

---

## 10. Worked anchors (illustrative; patient AL-47M, 47y)

- **Fitness (VO₂max +10):** C1 ~1.3 (incidence + broad all-cause mortality), C2 ~2.6 (independence + reserve — the dominant block), C3 ~0.3 (resilience). Total ~4.2 QALY. Scores on all three channels because it genuinely acts on all three.
- **Statin (primary prevention):** C1 only — CV events + the CV mortality it actually prevents (not truncated to the cited endpoint). C2 = 0, C3 ≈ 0. Small net at a low-risk 47y because his event probability is low, *not* because it was discounted.
- **Mediterranean diet:** C1 (CVD/T2D/cancer incidence) + a modest C2 (real day-to-day wellbeing/function) + ~0 C3.
- **Aspirin / canakinumab (this patient):** net **negative** — real bleeding / infection burden exceeds the small prevention benefit at his risk. Correctly so.

Note the smallness of a drug's net is driven by **probability × severity** (a low-risk patient is unlikely to have the event), not by any asymmetry in how it was measured. The same drug scales up for a high-risk patient.

---

## 11. What we deliberately exclude, and why

| Excluded | Why it's a payer/defensibility construct, not patient value |
|---|---|
| 3%/yr time-preference discounting | Budget opportunity-cost; a person doesn't discount their own future health. Use survival-weighting instead. |
| Defensive RCT-null floors | Picking the unattackable lower bound is a reimbursement posture; the patient is served by the best estimate + a stated range. |
| Textbook-average utilities | Population/payer default; use the patient's realistic valuation. |
| "Keep it comparable / don't balloon" | A ranking worry, not a value question. |

We **keep**: counterfactual, no-double-count, survival-weighting, honest ranges, achievability-at-selection — these protect the patient (from being misled up *or* down), not the payer.

---

## 12. Provenance / reproduction

- Per-event patient-value archetypes + per-action C1/C2/C3 derivations: produced by audited multi-agent derivations (un-discount, best-estimate causal, patient utilities) with a patient-honesty audit. The original working artifacts (`SCORED_pv.json`, `recompute_pv.js`) lived in a session scratchpad and are gone; the durable, reproducible derivation now lives in **`QALY_WORKED_TRACE.md`** + `design-loop/value-trace/compute_trace.py` (statin, fitness, HSAT traced end-to-end with per-step defensibility grades).
- Effect sizes (relRed) are RCT/epidemiology-sourced and are **not** re-weighted by this framework — only the per-event *value* and the *burden* are.
- Operational schemas, reducer rules, promotion states, and independent-agent testing are governed by `ACTION_ENGINE_GENERALIZATION_CONTRACT.md`.
- Companion notes: the action library (`system-design/design-loop/`), the interactive action map (`system-design/diagrams/aleron-actionmap-al47m.html`), and `models/risk-models/INTERACTIVE_WIDGETS_HANDOFF.md`.

---

## 13. External context: why Aleron must keep reorienting to the patient

The QALY unit is valid for Aleron, but the published QALY ecosystem is heavily shaped by allocation decisions. That is the bias to watch for.

- NICE uses QALY-based economic evaluation to assess value for money and efficient use of NHS resources, with the cost perspective centered on NHS and personal social services. Source: [NICE health technology evaluations manual, economic evaluation](https://www.nice.org.uk/process/pmg36/chapter/economic-evaluation-2).
- The Second Panel on Cost-Effectiveness in Health and Medicine recommends reference cases from the health care sector and societal perspectives. Those are not the same as a single concierge patient paying for their own care. Source: [Sanders et al., JAMA 2016](https://pubmed.ncbi.nlm.nih.gov/27623463/).
- US federal law restricts use of dollars-per-QALY thresholds in certain PCORI and Medicare contexts because of concerns about valuing life differently for elderly, disabled, or terminally ill people. Source: [42 U.S.C. § 1320e-1](https://www.law.cornell.edu/uscode/text/42/1320e-1).
- CAC literature supports why diagnostic value should be decomposed. In CorCal, CAC-guided statin strategy changed statin recommendations in 20.6% of primary-prevention patients. Source: [Muhlestein et al., JACC Cardiovascular Imaging 2022](https://pubmed.ncbi.nlm.nih.gov/34922872/). In MESA, 41% of statin-recommended participants had CAC = 0, showing meaningful discordance between equation-based eligibility and plaque burden. Source: [Nasir et al., JACC 2015](https://pubmed.ncbi.nlm.nih.gov/26449135/).

Operational conclusion: Aleron may use conventional QALY literature for calibration, but the final estimate must always be restated as **patient-value QALY versus this patient's current management**, with cost, burden, evidence, feasibility, and uncertainty kept visible rather than collapsed into a payer-style accounting number.
