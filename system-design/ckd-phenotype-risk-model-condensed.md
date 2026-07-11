# CKD Phenotype Risk Model

## Version 4.0 | June 26, 2026

# Executive Summary
Identifies adults 35 to 60 at elevated risk of chronic kidney disease, early enough that proven interventions (RAAS blockade, SGLT2 inhibitors, blood pressure control) reduce kidney failure and associated cardiovascular death.

Three components: a two-stage base model that routes each patient to the correct risk equation; five phenotype modifiers (cystatin C discordance, UACR trajectory, blood pressure control, glycemic and insulin resistance, nephrotoxin exposure); and a flat multiplicative combination under one shared cap. The v3.7 four-domain stack and sigmoid combination are condensed to these five; Appendix C lists what was dropped.

Family history is carried as a screening and escalation signal, not a score. All scoring is deterministic.

# 1. Base Model: Two-Stage Routing
Most 35 to 60 year olds have no established CKD, so the model picks the equation that fits the patient's initial labs.

## Stage A: No Established CKD
Criteria: eGFR at or above 60 and UACR below 30 mg/g. CKD Prognosis Consortium incident-CKD equation (Nelson 2019 [Ref 1]), 5-year probability of eGFR falling below 60, derived on 5.2M individuals across 34 cohorts. Inputs: age, sex, eGFR, UACR, hypertension treatment, smoking, BMI, CVD history, and HbA1c (diabetic version). Output is a calibrated 5-year point estimate whose absolute level can shift with population fit.

## Stage B: Established CKD
Criteria: eGFR below 60 or UACR at or above 30 mg/g. Kidney Failure Risk Equation, 8-variable (Tangri 2016 [Ref 2]), 2-year and 5-year probability of kidney failure, validated in over 700,000 patients, C-statistic 0.90, endorsed by KDIGO. Inputs: age, sex, eGFR, UACR, serum calcium, phosphate, bicarbonate, albumin. Output is a point estimate strongest for stratification and thresholds, not decimal precision.

Routing rule: a Stage A patient who develops CKD on later testing transitions to Stage B automatically.

# 2. Algorithmic Modifiers
Five modifiers adjust the base risk with patient data the base equation does not capture: filtration discordance, albuminuria trajectory, blood pressure control, metabolic load, and nephrotoxin exposure. The v3.7 seven-modifier, four-domain stack (combined through a sigmoid) is condensed to these five; Appendix C lists what was dropped.

## Evidence grading
Each modifier carries a grade, reported beside it and never multiplied into the hazard ratio. Strong: RCT or large meta-analysis (over 100K) with a CKD endpoint. Moderate: large cohort with a CKD endpoint and some confounding. Weak: extrapolation or high heterogeneity.

## How modifiers combine
Each modifier contributes its single most applicable rung; the five multiply under one shared 3.0x cap.

```
modifier_HR = min( cystatinC_HR x UACRtraj_HR x BP_HR x glycemic_HR x nephrotoxin_HR , 3.0 )
risk_adj    = clamp( base_risk x modifier_HR )
```

This replaces the v3.7 per-domain caps (2.1 3.0x, 2.2 2.5x, 2.3 2.0x), the within-domain partial-credit rules, and the sigmoid log-odds combination; at these base risks the flat product and the sigmoid agree. Missing modifiers default to 1.0 with no imputation, so flag low coverage rather than implying reassurance. The base model must use CKD-EPI 2021 creatinine-only eGFR so the cystatin C modifier does not double-count.

## 2.1 Cystatin C Discordance
Creatinine-based eGFR can mask kidney impairment; cystatin C is muscle-mass-independent and catches early tubular damage. Discordance is the percent difference between creatinine and cystatin C eGFR. Cystatin C eGFR 30% or more below creatinine: 1.3x (Strong; CKD-PC 821K, kidney-failure HR 1.29 [Ref 4, Ref 5, Ref 6]; set to 1.3 to match the kidney-failure signal, not the higher all-cause hazard). Cystatin C eGFR more than 10% above creatinine: 0.85x, protective.

## 2.2 UACR Trajectory
Rising albuminuria predicts progression beyond the base equation's single snapshot. Needs two or more UACR readings at least 3 months apart. Rise of 50% or more over 6 to 12 months with the second value at least 20 mg/g: 1.4x (Strong for direction, CKD-PC 693,816; the 1.4x magnitude is model-assigned [Ref 7]). Decline of 30% or more with the second value below 30 mg/g: 0.8x, protective [Ref 7]. A 20 mg/g floor blocks trivial percentage swings. Persistent UACR above 300 is not scored here: it routes to Stage B, whose KFRE base already takes UACR as a core input [Ref 8], so a scalar would double-count.

## 2.3 Blood Pressure Control
Control quality, not the binary hypertension flag the base already holds. Wearable BP trends preferred. Uncontrolled (at or above 140/90, or more than 30% of readings above 140 systolic): 1.4x. Severe (at or above 160/100): 1.7x. Controlled on medication below 130/80: 1.1x. No hypertension, consistently below 120/80: 0.9x, protective. Strong, graded BP-ESRD dose-response (MRFIT [Ref 9]); rung magnitudes are model-assigned within that direction. Wearable BP catches ambulatory and nocturnal hypertension that clinic readings miss.

## 2.4 Glycemic Control and Insulin Resistance
Glycemic dysregulation beyond the base model's binary diabetes flag. Diabetic: HbA1c above 9%, 1.5x (1.25x when the CKD-PC diabetic base already weights HbA1c); HbA1c 7 to 9%, 1.2x (1.1x with the diabetic base). Strong [Ref 10, Ref 11]. Non-diabetic: prediabetes (fasting glucose 100 to 125) with BMI above 30, 1.2x (Moderate [Ref 12]; the BMI gate is a model-defined composite); or HOMA-IR above 3.0, 1.2x (Moderate [Ref 13]). HOMA-IR = fasting glucose x fasting insulin / 405; a glucose of 108 with insulin of 18 looks unremarkable but yields 4.8.

## 2.5 Nephrotoxin Exposure
Directly actionable; identification drives deprescription. Chronic NSAIDs (4 or more days per week for 3 or more months): 1.3x (Weak, KDIGO avoidance direction [Ref 14]). Lithium: 1.4x (Moderate [Ref 15]). Prior aminoglycoside or cisplatin: 1.2x (Weak [Ref 14]). Daily PPI over 1 year: 1.1x (Weak; meta RR 1.68 but I-squared 99%, residual confounding likely [Ref 16, Ref 17]). The single highest applicable rung applies.

## 2.6 Context Flags (carried, not scored)
Surfaced for the care pathway, not folded into the number:

- Family history of CKD, ESKD, dialysis, or transplant in a first-degree relative: not scored, because the association attenuates to non-significant after adjusting for eGFR and albuminuria, both base inputs [Ref 18, Ref 19]. It tightens monitoring cadence and, when it suggests inherited disease (early-onset CKD across relatives, known familial nephropathy), routes to renal-depth genetic testing outside this model.
- Resting heart rate: a weak wearable marker of sympathetic overdrive, carried for context, not scored (predictive, not a lever).

# 3. Clinical Examples

## Patient A: The Hidden Decliner
48-year-old man, no prior diagnoses, nonsmoker, BMI 27, no medications. Labs: eGFR creatinine 72, eGFR cystatin C 58, UACR 22 mg/g (was 15 six months ago), HbA1c 5.4%, fasting glucose 108, fasting insulin 18. Wearable: resting HR 84, 38% of BP readings above 140 systolic. Family history: father started dialysis at 62.

Routing: eGFR at or above 60, UACR below 30, so Stage A; base 5-year risk about 4%. Modifiers: cystatin C discordance is 19.4%, below the 30% threshold, so 1.0 (but borderline, recheck at 3 months); UACR trajectory is +47%, below 50%, so 1.0; blood pressure uncontrolled, 1.4x; HOMA-IR 4.8, 1.2x; no nephrotoxins. Product 1.4 x 1.2 = 1.68x. Adjusted 5-year risk about 7%, driven by hemodynamic and metabolic load, not an unverifiable family-history scalar.

Traditional care says "labs look fine, see you next year." Aleron: nephrology referral, ambulatory BP monitoring and likely RAAS blockade, repeat UACR and cystatin C in 3 months, address insulin resistance, monitor every 6 months. The 7% is credible and traceable to measured risk, which motivates the same action without straining credibility.

## Patient B: The Conditional Escalation Case
39-year-old woman, no prior diagnoses, nonsmoker, BMI 23, daily ibuprofen for migraines. Labs: eGFR creatinine 88, eGFR cystatin C 85, UACR 12, HbA1c 5.1%, fasting glucose 92. Wearable: resting HR 68, BP 118/72. Family history: mother had unexplained CKD in her 50s, no genetic test result.

Routing: Stage A; base 5-year risk about 1.5%. Modifiers: chronic NSAID use fires nephrotoxin exposure, 1.3x; nothing else. Adjusted 5-year risk about 2%, still low.

Traditional care says "normal kidneys, nothing to do." Aleron: replace chronic NSAIDs with non-nephrotoxic migraine management, repeat eGFR and UACR in 3 to 6 months, clarify the mother's diagnosis, and consider renal ultrasound, nephrology review, or renal-depth genetic testing only if history, imaging, or trajectory supports it. The score stays modest while the care pathway still catches a cheap exposure fix and a suspicious family-history signal.

# Appendix A: Variable Legend / Input Classification
Tier 1 = incomplete or misleading without it; Tier 2 = meaningfully worse; Tier 3 = essentially unchanged. Base inputs are always Tier 1.

| Tier | Variable | Assoc. Evidence | Use | Effect Size | Source | Modifiable | Causal | References |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | age | Strong | Base | — | History | No | No | 1, 2 |
| 1 | sex | Strong | Base | — | History | No | No | 1, 2 |
| 1 | egfr / serum_creatinine (CKD-EPI 2021) | Strong | Base | — | Derived | Partial | No | 1, 2 |
| 1 | uacr | Strong | Base + modifier | — | Lab (urine) | Yes | Unsettled | 7, 8 |
| 1 | serum calcium / phosphate / bicarbonate / albumin (KFRE) | Strong | Base | — | Lab | Partial | Unsettled | 2 |
| 1 | smoking_status | Strong | Base | — | History | Yes | Yes | 1 |
| 1 | cvd_history | Strong | Base | — | History | No | Unsettled | 1 |
| 1 | diabetes_status | Strong | Base | — | History | Partial | Yes | 3 |
| 1 | bmi | Moderate | Base | — | Clinical | Yes | Yes | 1 |
| 1 | hba1c / fasting_glucose | Strong | Base + modifier | Varied | Lab | Yes | Yes | 1, 10, 11 |
| 1 | antihypertensive_status | Strong | Base | — | History | Partial | Yes | 9 |
| 1 | systolic_bp / diastolic_bp | Strong | Modifier | 0.9 to 1.7x control rungs (2.3) | Wear + clinic | Yes | Yes | 9 |
| 2 | cystatin_c / egfr_cystatin (discordance) | Strong | Modifier | 0.85 to 1.3x by discordance (2.1) | Lab | Partial | No | 4, 5, 6 |
| 2 | uacr_trajectory | Strong | Modifier | 0.8x / 1.4x (2.2) | Derived | Yes | Unsettled | 7 |
| 2 | nephrotoxin_nsaid | Moderate | Modifier | 1.3x (2.5) | History | Yes | Yes | 14 |
| 2 | nephrotoxin_lithium | Moderate | Modifier | 1.4x (2.5) | History | Partial | Yes | 15 |
| 2 | prior_aminoglycoside / cisplatin | Moderate | Modifier | 1.2x (2.5) | History | No | Yes | 14 |
| 3 | homa_ir / fasting_insulin | Moderate | Modifier | 1.2x if above 3.0 (2.4) | Lab + calc | Yes | Unsettled | 13 |
| 3 | prediabetes (glucose 100 to 125 + BMI above 30) | Moderate | Modifier | 1.2x composite (2.4) | Lab | Yes | Unsettled | 12 |
| 3 | nephrotoxin_ppi | Weak | Modifier | 1.1x (2.5) | History | Yes | Unsettled | 16, 17 |
| 2 | family_history_kidney | Moderate | Context flag (not scored) | Screening and escalation (2.6) | History | No | No | 18, 19 |
| 3 | resting_heart_rate | Weak | Context flag (not scored) | Carried, not scored (2.6) | Wearable | Partial | No | — |

Known gaps: Unsettled rows are kept for risk refinement, not action-layer targeting, until adjudicated causal. Family history is non-scoring because its risk operates through eGFR and albuminuria already in the base model. Resting heart rate was a scored modifier in v3.7 and is demoted to a non-scored context flag in this condensation (Appendix C).

# Appendix B: Reference Studies
Reduced in v4.0 to the studies the model cites, renumbered contiguously. PMIDs unchanged.

| Ref | Citation | PMID | Used For |
| --- | --- | --- | --- |
| 1 | Nelson RG et al. Risk prediction equations for incident CKD. JAMA. 2019. | 31703124 | Stage A base equation (Section 1) |
| 2 | Tangri N et al. Equations predicting kidney failure risk (KFRE). JAMA. 2016. | 26757465 | Stage B base equation (Section 1) |
| 3 | Thomas MC et al. Diabetic kidney disease. Nat Rev Dis Primers. 2015. | 27188921 | Diabetes base flag (Section 1) |
| 4 | Estrella MM et al. Creatinine/cystatin C eGFR discordance and outcomes. JAMA. 2025. | 41202182 | Cystatin C discordance (2.1) |
| 5 | Lees JS et al. GFR measures, albuminuria, CVD, mortality, ESKD. Nat Med. 2019. | 31700174 | Cystatin C discordance (2.1) |
| 6 | Liu Q, Mark PB. Cystatin C vs creatinine eGFR discordance and outcomes. Clin Kidney J. 2025. | 40235956 | Cystatin C discordance (2.1) |
| 7 | Coresh J, Heerspink HJL et al. (CKD-PC). Change in albuminuria and subsequent risk of ESKD. Lancet Diabetes Endocrinol. 2019. | 30635225 | UACR trajectory (2.2) |
| 8 | Gansevoort RT, Matsushita K et al. (CKD-PC). Lower eGFR and higher albuminuria and adverse kidney outcomes. Kidney Int. 2011. | 21289597 | Persistent A3 routing note (2.2) |
| 9 | Klag MJ, Whelton PK et al. Blood pressure and end-stage renal disease in men (MRFIT). NEJM. 1996. | 7494564 | Blood pressure rungs (2.3) |
| 10 | Bash LD, Selvin E et al. (ARIC). Poor glycemic control and incident CKD. Arch Intern Med. 2008. | 19064828 | HbA1c rungs (2.4) |
| 11 | Guo J, Liu C et al. Dose-response of diabetic kidney disease with clinical parameters. EClinicalMedicine. 2024. | 38374967 | HbA1c dose-response (2.4) |
| 12 | Fang S, Huang J et al. Prediabetes and risk of incident CKD: meta-analysis. Biomol Biomed. 2026. | 41575827 | Prediabetes (2.4) |
| 13 | Song SH et al. Insulin resistance and incident CKD in normal renal function. Kidney Res Clin Pract. 2025. | 38148129 | HOMA-IR (2.4) |
| 14 | KDIGO 2024 CKD Evaluation and Management guideline. | 38490803 | Nephrotoxin direction: NSAID, aminoglycoside/cisplatin (2.5) |
| 15 | Chan JKN, Solmi M, Correll CU et al. Lithium and risk of chronic kidney disease. JAMA Netw Open. 2025. | 39932712 | Lithium nephrotoxicity (2.5) |
| 16 | Lazarus B et al. PPI use and CKD risk. JAMA Intern Med. 2016. | 26752337 | PPI nephrotoxicity (2.5) |
| 17 | PPI and CKD risk: systematic review/meta-analysis. Cureus. 2026. | 41737121 | PPI evidence-grade reduction (2.5) |
| 18 | Lei HH et al. Familial aggregation of renal disease. JASN. 1998. | 9644638 | Family history context flag (2.6) |
| 19 | McClellan WM et al. Family history, albuminuria, reduced GFR, and incident ESRD. AJKD. 2012. | 22078058 | Family history context flag (2.6) |

# Appendix C: Revision History
Newest first. Each row is a released version; the version line at the top reflects the most recent entry.

| Version | Date | Changes |
| --- | --- | --- |
| 4.0 | June 26, 2026 | Condensed-model rewrite. Structure unchanged from v3.7 (Executive Summary, Section 1 two-stage Base Model, Section 2 Algorithmic Modifiers, Section 3 Clinical Examples, Appendices A/B/C); only the modifier section, the worked examples, and the appendices changed, and prose was tightened for an executive-physician reader with inline PMIDs moved to Appendix B. Reduced to five scored modifiers: cystatin C discordance (was 2.1.1), UACR trajectory (was 2.1.2), blood pressure control (was 2.2.1), glycemic control and insulin resistance (consolidates the diabetic HbA1c, prediabetes, and HOMA-IR rungs of 2.2.3), and nephrotoxin exposure (was 2.3.1). Removed resting heart rate (was 2.2.2) as a scored modifier and demoted it to a context flag. Replaced the per-domain caps (2.1 3.0x, 2.2 2.5x, 2.3 2.0x), the within-domain partial-credit rules, and the sigmoid log-odds combination with a flat multiplicative layer under one shared 3.0x cap; nephrotoxin exposures now take the single highest applicable rung rather than multiplying. Retained magnitudes and thresholds are unchanged from v3.7; family history remains non-scoring. Two-stage CKD-PC/KFRE base and routing unchanged. Reduced Appendix B to cited studies, renumbered contiguously (PMIDs unchanged). |
| 3.7 | June 24, 2026 | Post-audit consistency pass on v3.6. Removed the persistent UACR>300 scalar (that level routes to Stage B, whose KFRE base already takes UACR, so it double-counted). Restored the BMI>30 gate to the prediabetes trigger. Relabeled the rising-UACR rung as model-assigned and softened the independent-of-baseline wording. Added a male-cohort caveat to the MRFIT BP rungs. No base or routing change; one modifier (persistent UACR>300) removed as a scalar. |
| 3.6 | June 24, 2026 | Independent citation-audit pass. Removed family-history score multipliers (association attenuates to non-significant after eGFR/albuminuria adjustment); family history became non-scoring; Patient A recomputed 10% to 7%. Rebound UACR-trajectory rungs to the CKD-PC change-in-albuminuria study (Coresh 2019). Re-anchored persistent UACR>300 to a renal endpoint (Gansevoort 2011). BP rungs to MRFIT (Klag 1996); lithium to a primary cohort. Cystatin-C discordance 1.5x to 1.3x. Prediabetes 1.3x to 1.2x. Appendix B renumbered 1-22. Base and routing unchanged. |
| 3.5 | June 24, 2026 | Folded output-and-uncertainty into Stage A and Stage B. Removed HRV/RMSSD as a modifier (no endpoint-matched evidence) and the SPRINT BP citation. Grounded HOMA-IR (non-diabetics) to PMID 38148129. Renumbered Appendix B. Base, routing, and magnitudes unchanged. |
| 3.4 | June 24, 2026 | Added an Output and Confidence section defining the emitted quantity and how layered modifiers widen the band. No change to base equations, routing, magnitudes, or arithmetic. |
| 3.3 | June 22, 2026 | Tier/data-collection audit. Reclassified bmi as a base gate, added the cvd_history base row, promoted BP and antihypertensive_status to Tier 1, added the severe BP rung. No base-equation change. |
| 3.2 | June 22, 2026 | Recast CKD as a phenotype risk model; removed renal genetic variants and the Invitae container as scored inputs; replaced monogenic Domain D with family-history-only context and conditional renal-genetics escalation. No base or non-genetic magnitude change. |
| 3.1 | June 21, 2026 | Corrected genetic-rule and quantitative artifacts (PKD/APOL1 handling, cystatin C discordance, BP citation alignment). Superseded by v3.2 for genetic scoring. |
| 3.0 | June 20, 2026 | Introduced the Appendix A/B/C architecture, variable-legend schema, reference linkage, and revision history. No scoring-logic change. |
| 2.0 | April 22, 2026 | Baseline release: two-stage CKD-PC/KFRE routing, algorithmic modifiers, sigmoid combination, worked examples, inline references. |
