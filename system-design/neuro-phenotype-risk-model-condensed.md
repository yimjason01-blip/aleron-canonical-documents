# Neurodegenerative Phenotype Risk Model

## Version 3.1 | June 27, 2026

# Executive Summary
Estimates 20-year all-cause dementia risk for adults 40 to 64, then adjusts it with biomarker, vascular/metabolic, lifestyle, family-history, and fitness data. APOE4 is specified as a consented strategy input that sets surveillance cadence and prevention intensity (Section 2.6); monogenic neurodegenerative findings route outside the score through the deterministic Result Router.

Architecture: a probabilistic base score for all-cause dementia (the dominant pathway, where validated midlife models exist) plus a triage gate for monogenic conditions. Unlike cancer, dementia has validated population-level prediction; unlike a high-penetrance variant, a phenotype score is the right object for common, multifactorial risk. Monogenic causes (PSEN1/2, APP for early-onset AD; LRRK2, GBA1, SNCA for PD) need deterministic protocol routing, not probabilistic modification [Ref 7, Ref 8].

Five phenotype modifiers (biomarkers, vascular/metabolic, lifestyle/sensory, family history, cross-cutting CRF) condense the prior four-domain stack; Appendix C lists what was dropped. APOE4 enters as a consented strategy input, not a sixth scored modifier. All scoring is deterministic.

# 1. Base Model

## 1.1 Base Equation and Event Definition
CogDrisk-ML (Huque, Anstey 2025 [Ref 1]): a sex-specific Cox model for incident all-cause dementia in adults 40 to 64, applied over a 20-year horizon. The source reports discrimination (C-statistic about 0.70 to 0.75), not a published fixed-horizon calibrated absolute risk, so the 20-year output is a calibrated stratification anchor pending full coefficient access. All modifiers below are transparent stratification weights, not a newly validated integrated model.

| Criterion | CogDrisk-ML | CAIDE | ANU-ADRI | LIBRA |
| --- | --- | --- | --- | --- |
| Age range | 40 to 64 (purpose-built for midlife) | 39 to 64 | 60+ | 65+ |
| Method | Cox PH, sex-specific | Logistic regression | Weighted sum | Weighted sum |
| Derivation | UK Biobank + ARIC (N over 500K) | CAIDE (N 1,449) | Factor synthesis | Expert panel |
| Midlife risk factors | Yes, incl. Lancet 2024 factors | No (2006, limited set) | Partially | Partially |
| Outcome | 20-year all-cause dementia | 20-year dementia | Dementia/MCI | Dementia |

Chosen over CAIDE (2006, limited factors), ANU-ADRI (60+), and LIBRA (65+) because it is purpose-built for midlife with published sex-specific coefficients and the Lancet 2024 factors [Ref 2]. CAIDE is the fallback if coefficient granularity proves insufficient; its external performance is moderate [Ref 6].

## 1.2 Output and Uncertainty
Output is a continuous 20-year all-cause dementia probability, presented as a calibrated base plus evidence-graded modifiers with coverage visible. Boundary rule: the base captures chronic neurodegeneration including vascular dementia; the acute cerebrovascular event (stroke) is CVD's domain, which prevents double-counting.

# 2. Algorithmic Modifiers

## Evidence grading
Each modifier carries a grade, reported beside it and never multiplied into the weight. Strong: large cohort or trial with a dementia/cognitive endpoint. Moderate: commission-level PAF support or proxy cognitive-decline evidence. Weak: extrapolation or operational gray-zone rule. Many row weights are Aleron operational weights on a uniform 20-year endpoint, labeled as such.

## How modifiers combine
Log-additive across domains with per-domain and global sigmoid bounding, cardiorespiratory fitness applied last as a multiplier, then a global cap of 3.0x base risk.

```
base_logit = ln( base / (1 - base) )
modified   = sigmoid( base_logit + Σ clamp(domain_log_weight) )
risk_adj   = min( modified x CRF , 3.0 x base )
```

The sigmoid and global cap are retained (unlike the flat CVD/CKD layer) because many modifiers can stack; they prevent runaway. Missing modifiers are neutral at 1.0 with no imputation. A positive neurogenetic result changes the care pathway, not the score arithmetic. APOE4 is not part of this multiplicative stack; it is a consented strategy input (Section 2.6) that sets surveillance cadence and prevention intensity, not a score multiplier. Shared inputs (hypertension, T2D) feed CVD and Neuro with different outcome-specific weights from the same data, which is not double-counting; the action layer dedupes interventions.

## 2.1 Neurodegenerative Biomarkers
Aleron's unique edge: blood-based p-tau217 and NfL are the most powerful preclinical reclassifiers when available. They are optional inputs, drawn under the Section 2.6 APOE-gated surveillance cadence rather than collected on every patient at baseline. When either is absent it is neutral at 1.0 per the Section 1 missing-modifier rule and never blocks a run; the remaining modifiers still score. p-tau217 above 2x age-adjusted ULN, 2.0x; 1.5 to 2x, 1.4x; below 1.5x, 1.0x (Strong AD discrimination; the weights are operational severity, not source-published incident-dementia HRs [Ref 3]). NfL above the 90th age-adjusted percentile, 1.5x; above the 97.5th, 2.0x (operational neuronal-injury weights, a clinical-evaluation trigger [Ref 4]). When both are elevated, combine with a 0.7 correlation-attenuation factor. Domain cap 3.0x.

## 2.2 Vascular and Metabolic State
Modifiable risk operating through cerebrovascular damage and neuroinflammation, distinct from the acute stroke pathway CVD owns. Midlife hypertension untreated (SBP at or above 140, age 40 to 65), 1.6x; treated and controlled (SBP below 130), 1.1x [Ref 2, Ref 14]. T2D present, 1.35x (diabetes meta-analysis AD HR 1.36 [Ref 9]). Midlife obesity (BMI at or above 30), 1.3x [Ref 2]. Untreated LDL-C at or above 160 mg/dL, 1.25x [Ref 2]. Domain cap 2.5x. T2D status is an input here; the Metabolic model owns T2D prediction.

## 2.3 Lifestyle, Sensory, and Cognitive-Reserve Factors
The Lancet 2024 modifiable cluster; most weights are operational on a uniform 20-year endpoint [Ref 2]. Physical inactivity (under 150 min/week moderate), 1.4x, suppressed when CRF is available; persistent short sleep (6 hours or less, midlife), 1.3x [Ref 13]; untreated hearing loss, 1.4x [Ref 2, Ref 11]; head trauma (TBI with loss of consciousness over 30 min or repeated concussions), 1.5x; current smoking, 1.3x; excessive alcohol (over 14 drinks/week men, 7 women), 1.2x; social isolation, 1.3x; current or recurrent depression, 1.3x; low cognitive engagement or under 12 years education, 1.3x. Within-domain partial credit (larger weight plus half the excess of the rest); domain cap 2.5x.

## 2.4 Family History
First-degree relative with dementia onset before 70, 1.5x; at or after 70, 1.2x. An operational onset-age split on the published first-degree-relative AD association [Ref 15]. Highest applicable rung; cap 1.5x. Monogenic variants are not scored; they route to the Result Router. APOE4 is handled as a consented strategy input in Section 2.6, not as a family-history score term.

## 2.5 Cross-Cutting Modifier: Cardiorespiratory Fitness
Applied last, multiplicative, cap 0.60x to 1.4x (HUNT [Ref 10]; rungs are operational bins extrapolated from the fitness-change result). Below the 20th percentile (CPET) or 15th (wearable), 1.4x; 20th to 49th / 15th to 49th, 1.1x; 50th to 74th / 50th to 79th, 1.0x; 75th to 97th / 80th to 97th, 0.75x; 97.7th and above, 0.60x. Suppresses physical inactivity (2.3) when available. Wearable CRF needs a 30-day rolling median ending within 90 days; a drop over 2 METs flags worsening. Exercise carries neurobiological benefit beyond cardiovascular protection (BDNF, hippocampal neurogenesis, glymphatic clearance).

## 2.6 APOE4: Consented Strategy Input (not a scored modifier)
APOE is the strongest common genetic risk factor for late-onset AD and the one dementia signal available decades before any biomarker turns positive. It is specified here as a consented strategy input that sets surveillance cadence and prevention intensity. It is deliberately not a multiplicative term in the risk score: a non-modifiable gene multiplied onto CogDrisk would mis-frame direct genetic risk as a routine modifier, break the base calibration, and surface a number the patient may be harmed by and did not consent to learn.

Allele effects, for stratification not score arithmetic: one e4 allele (e3/e4, about 25% of people) carries roughly 2 to 3x AD risk; two copies (e4/e4, about 2 to 3% of people) roughly 10 to 15x and trend toward near-deterministic by late life; e2 is protective. APOE4 is AD-specific, so it informs the AD pathway, not all-cause dementia uniformly [Ref 5].

Use, once consented:

- Surveillance gate. APOE4-positive status, especially e4/e4, lifts pre-test probability enough to justify serial blood-biomarker monitoring (p-tau217, NfL, and where available Abeta42/40 and GFAP) through the 40s and 50s, when those markers are otherwise silent in most people. The gene answers who to watch and how often; the biomarkers answer when pathology starts. It sets the cadence here, it does not change the 2.1 biomarker weights.
- Prevention intensity. A positive result raises priority and follow-through on the modifiable levers already in the score (blood pressure, exercise, sleep, hearing, metabolic health). It unlocks no asymptomatic drug; it raises the stakes on existing levers, where the runway is longest if the result is known early.

Consent and disclosure. The genotype is ordered and disclosed only with informed consent and counseling; the harm profile, not the predictive value, is the reason. APOE4 is non-modifiable, has no asymptomatic-prevention drug, and carries real downside: distress, and long-term-care, life, and disability insurance exposure that GINA does not protect. A negative is not reassuring in isolation, since most dementia occurs in non-carriers. The raw genotype routes through the Result Router; what lives in this model is the consented strategy logic keyed to that result.

## 2.7 Coverage and Calibration Caveat
Coverage is runtime completeness. Full (base plus three or more domains plus CRF) shows modified risk with an audit trail; partial (base plus one or two domains) adds "further testing recommended" and the top EVOI tests; base-only shows base risk and the top EVOI tests rather than a modified number implying unsupported precision. The 20-year horizon differs from CVD (10/30-year) and Metabolic (10-year); the modifier stack is not yet a validated integrated model on that horizon.

## 2.8 External Routing and Non-Scored Signals
APOE4 is specified as a consented strategy input (Section 2.6), not a scored modifier; the raw genotype routes through the Result Router with consent [Ref 5]. Monogenic AD/PD variants route to deterministic protocols [Ref 7, Ref 8]. There is no validated population PD risk model for asymptomatic adults; PD is handled by the monogenic gate and, non-specifically, by NfL. Alpha-synuclein seed amplification is a promising future PD biomarker, not yet scored [Ref 12]. An NfL-elevated, p-tau217-normal patient may be showing early synucleinopathy, surfaced as a clinical interpretation, not a model decision. Future candidates (digital cognitive testing, GFAP, blood Abeta42/40, CGM, PM2.5, vision) remain placeholders until endpoint-matched rules exist.

# 3. Clinical Example

## 3.1 The Hidden Decliner
52-year-old woman: p-tau217 borderline at 1.7x ULN, NfL normal, no diabetes, blood pressure controlled on medication, BMI 27, sleep 5.5 hours by wearable, moderate untreated hearing loss, no TBI, CRF about the 60th percentile. She consented to APOE testing and is e3/e4, which is why serial p-tau217 surveillance was already running, and that surveillance is what caught the borderline value. The genotype is disclosed with counseling, not folded into the score.

CogDrisk-ML base 20-year risk about 3.5%. Modifiers: borderline p-tau217 (1.4x), treated hypertension (1.1x), and a lifestyle domain combining short sleep (1.3x) and untreated hearing loss (1.4x) under partial credit; CRF neutral at the 60th percentile. The stack roughly doubles risk to about 7 to 8%, driven by modifiable sleep and hearing levers plus a borderline biomarker.

Traditional care would note controlled blood pressure and no diabetes, with no integrated dementia action path. Aleron treats the phenotype signals as an early-intervention opportunity: sleep extension, audiometric correction, CRF preservation, and tighter biomarker surveillance, with prevention intensity raised by the e3/e4 result.

# Appendix A: Variable Legend / Input Classification
Tier 1 = incomplete or misleading without it; Tier 2 = meaningfully worse; Tier 3 = essentially unchanged. A variable is an action-layer lever only when both modifiable and causal; biomarker and family-history signals inform risk but are flagged non-action.

| Tier | Variable | Assoc. Evidence | Use | Modifier Rule | Source | Modifiable | Causal | References |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| — | CogDrisk-ML 20-year dementia risk | Strong | Base | Validated midlife base, C-statistic ~0.70 to 0.75 | Base model | No | No | 1, 6 |
| 1 | p-tau217 | Strong | Modifier | 1.4x / 2.0x by tier (2.1) | Blood lab | No | No | 3 |
| 1 | NfL (age-adjusted) | Moderate | Modifier | 1.5x / 2.0x by percentile (2.1) | Blood lab | No | No | 4 |
| 1 | midlife hypertension | Strong | Modifier | 1.1x to 1.6x by control (2.2) | Wearable + clinic | Yes | Yes | 2, 14 |
| 1 | type 2 diabetes present | Moderate | Modifier | 1.35x (2.2) | Labs + history | Partial | Unsettled | 9 |
| 1 | midlife obesity | Strong | Modifier | 1.3x if BMI ≥30 (2.2) | History | Yes | Yes | 2 |
| 1 | physical inactivity | Strong | Modifier | 1.4x, suppressed by CRF (2.3) | Wearable | Yes | Yes | 2 |
| 1 | abnormal sleep duration | Strong | Modifier | 1.3x if ≤6h midlife (2.3) | Wearable | Yes | Unsettled | 13 |
| 1 | untreated hearing loss | Strong | Modifier | 1.4x (2.3) | Intake | Yes | Unsettled | 2, 11 |
| 1 | head trauma history | Strong | Modifier | 1.5x (2.3) | History | No | Yes | 2 |
| 1 | current smoking | Strong | Modifier | 1.3x (2.3) | History | Yes | Yes | 2 |
| 1 | excessive alcohol | Strong | Modifier | 1.2x (2.3) | History | Yes | Yes | 2 |
| 1 | social isolation | Strong | Modifier | 1.3x (2.3) | History | Yes | Unsettled | 2 |
| 1 | depression (current/recurrent) | Strong | Modifier | 1.3x (2.3) | History | Yes | Unsettled | 2 |
| 1 | low cognitive engagement / education | Strong | Modifier | 1.3x (2.3) | History | Yes | Yes | 2 |
| 1 | family history of dementia | Moderate | Modifier | 1.2x / 1.5x by onset age (2.4) | History | No | No | 15 |
| 1 | vo2max / crf_percentile | Strong | Modifier | 0.60 to 1.4x cross-cutting (2.5) | CPET/Wearable | Yes | Unsettled | 10 |
| 1 | high LDL cholesterol (midlife) | Moderate | Modifier | 1.25x if ≥160 untreated (2.2) | Labs | Yes | Unsettled | 2 |
| — | APOE genotype (e4) | Strong | Consented strategy input (not scored) | Sets surveillance cadence + prevention intensity (2.6) | Genetics | No | No | 5 |

Known gaps: most lifestyle weights are operational on a uniform 20-year endpoint. The NfL rising-trajectory flag, isolated insulin-resistance proxy, poor-sleep-quality proxy, former-smoking residual, treated-hearing residual, and the standalone high-activity protective credit scored in v2.6 were removed in this condensation (Appendix C). Future placeholders (CGM, digital cognitive testing, GFAP, blood Abeta42/40, alpha-synuclein SAA, PM2.5, vision) remain outside the score until endpoint-matched rules exist.

# Appendix B: Reference Studies
Reduced in v3.0 to the studies the model cites, renumbered contiguously. PMIDs unchanged.

| Ref | Citation | PMID | Used For |
| --- | --- | --- | --- |
| 1 | Huque MH, Anstey KJ et al. Midlife-specific CogDrisk algorithm (CogDrisk-ML). Age Ageing. 2025. | 40685637 | Base model (Section 1) |
| 2 | Livingston G, Huntley J, Liu KY et al. Dementia prevention, intervention, and care: 2024 Lancet Commission. Lancet. 2024. | 39096926 | Modifiable risk factors and PAFs (2.2, 2.3) |
| 3 | Palmqvist S, Janelidze S, Quiroz YT et al. Plasma phospho-tau217 discrimination for Alzheimer disease. JAMA. 2020. | 32722745 | p-tau217 biomarker (2.1) |
| 4 | Harp CT et al. Age-adjusted model for blood neurofilament light chain. Ann Clin Transl Neurol. 2022. | 35229997 | NfL biomarker (2.1) |
| 5 | Wolters FJ et al. APOE genotype and survival in Alzheimer disease and related dementia. PLoS One. 2019. | 31356640 | APOE4 strategy input (2.6) |
| 6 | Stephan BCM et al. Externally validated dementia risk prediction models: meta-analysis. BMC Med. 2026. | 41629914 | Base-model comparison (1.1) |
| 7 | Krüger C et al. MDSGene review on LRRK2 variants in Parkinson disease. NPJ Parkinsons Dis. 2025. | 39962078 | PD monogenic routing (2.7) |
| 8 | Karagas N et al. The Spectrum of Genetic Risk in Alzheimer Disease. Neurol Genet. 2025. | 39885961 | AD monogenic routing (2.7) |
| 9 | Wu J et al. Diabetes mellitus and risk of Alzheimer disease: meta-analysis. Front Endocrinol. 2026. | 41852471 | T2D and dementia risk (2.2) |
| 10 | Tari AR, Nauman J, Zisko N et al. Cardiorespiratory fitness and dementia incidence and mortality (HUNT). Lancet Public Health. 2019. | 31677775 | CRF cross-cutting modifier (2.5) |
| 11 | Pike JR et al. Hearing intervention and cognitive decline by risk (ACHIEVE secondary analysis). 2025. | 40369891 | Hearing loss (2.3) |
| 12 | Yu JK et al. Alpha-synuclein RT-QuIC assay as a biomarker for Parkinson disease. 2026. | 41517811 | Future PD biomarker (2.7) |
| 13 | Sabia S et al. Sleep duration in middle/old age and incidence of dementia. Nat Commun. 2021. | 33879784 | Sleep duration (2.3) |
| 14 | SPRINT MIND Investigators. Intensive vs standard blood pressure control on probable dementia. JAMA. 2019. | 30688979 | Hypertension and dementia (2.2) |
| 15 | Cannon-Albright LA et al. Relative risk for Alzheimer disease based on complete family history. Neurology. 2019. | 30867271 | Family-history risk (2.4) |

# Appendix C: Revision History
Newest first. Each row is a released version; the version line at the top reflects the most recent entry.

| Version | Date | Changes |
| --- | --- | --- |
| 3.1 | June 27, 2026 | Specified APOE4 as a consented strategy input (new Section 2.6), not a scored modifier. It is deliberately kept out of the multiplicative risk arithmetic: a non-modifiable gene as a score term would mis-frame genetic risk, break base calibration, and surface a number without consent. Once consented, it sets the blood-biomarker surveillance cadence (the gate that lifts pre-test probability enough to justify serial p-tau217/NfL through the 40s and 50s, when those markers are otherwise silent in most people) and raises prevention intensity on the modifiable levers. Added allele-effect magnitudes (e3/e4 ~2 to 3x, e4/e4 ~10 to 15x, e2 protective) and the consent, disclosure, and insurance-exposure caveats. Renumbered Coverage to 2.7 and External Routing to 2.8; updated the Executive Summary, the combination note, the family-history note, the worked example (now an e3/e4 result drives the surveillance that caught a borderline p-tau217), Appendix A, and the Appendix B Ref 5 pointer. The five scored modifiers, their weights, the base model, and the combination arithmetic are unchanged. |
| 3.0 | June 26, 2026 | Condensed-model rewrite. Structure unchanged from v2.6 (Executive Summary, Section 1 Base Model, Section 2 Algorithmic Modifiers, Section 3 Clinical Example, Appendices A/B/C); only the modifier section, the worked example, and the appendices changed, and prose was tightened for an executive-physician reader with inline PMIDs moved to Appendix B. Consolidated the four scored domains plus CRF into five modifiers: neurodegenerative biomarkers (was Domain A), vascular and metabolic state (was Domain B), lifestyle/sensory/cognitive-reserve factors (was Domain C), family history (was Domain D), and cross-cutting cardiorespiratory fitness (was 2.7). Removed the NfL rising-trajectory flag (A6), the isolated insulin-resistance proxy (B4), the poor-sleep-quality proxy (C4), the former-smoking residual (C7), the treated-hearing residual (C13), and the standalone high-activity protective credit (C2, now folded into CRF) as scored rows. Kept the log-additive sigmoid combination with per-domain clamps, multiplicative CRF, and the global 3.0x cap (unlike the flat CVD/CKD layer, retained because many modifiers stack); retained weights and thresholds are unchanged. CogDrisk-ML base, monogenic gate, and external routing (APOE, PD, future signals) retained. Reduced Appendix B to cited studies, renumbered contiguously (PMIDs unchanged). |
| 2.6 | June 25, 2026 | QA follow-up on v2.5. Reconciled the 20-year horizon between prose and the comparison table; added the caveat that CogDrisk-ML reports discrimination, not a published fixed-horizon calibrated risk. Corrected the Ref 6 fallback note (Stephan 2026 is a 36-study meta-analysis, no CAIDE-specific pooled AUC). Filled the orphaned key-advantages lead-in and removed development scaffolding. No reference, weight, or arithmetic change. |
| 2.5 | June 24, 2026 | Architecture normalization. Rebuilt the body to the Aleron spine (Executive Summary, Base Model, Algorithmic Modifiers, Clinical Example, Appendices) and folded shared-input boundaries, external router, CRF, coverage, PD gaps, and future-data context under Algorithmic Modifiers. Future candidates kept as Appendix A placeholders. Preserved v2.4 claim-audit language. |
| 2.4 | June 24, 2026 | Claim-level QA audit. Reframed p-tau217 and NfL as operational biomarker weights, not source-published incident-dementia HRs. Corrected T2D to a source-anchored AD-risk weight (1.35x) and downgraded HOMA-IR to proxy evidence. Clarified Lancet Commission rows as risk-factor/PAF support. Bounded sleep, hearing, and CRF claims to their actual endpoints. |
| 2.3 | June 24, 2026 | Imported the model into Meld and applied the operating-standard pass. Added point-of-use citations through base, modifier, CRF, and routing claims; corrected the Sabia sleep binding; rebuilt Appendix B as contiguous refs. No scored-architecture or magnitude change. |
| 2.2 | June 22, 2026 | Recast Neurodegenerative as a phenotype risk model. Removed APOE and monogenic variants as scored inputs; they route through the deterministic Result Router. Replaced the APOE worked example with a phenotype-driven one. No CogDrisk base or non-genetic magnitude change. |
| 2.1 | April 2026 | Current Neurodegenerative specification. Appendix structure standardized to the Aleron risk-model operating standard. |
