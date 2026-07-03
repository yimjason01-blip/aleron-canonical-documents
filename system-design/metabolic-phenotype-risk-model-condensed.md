# Metabolic Phenotype Risk Model

## Version 3.0 | June 26, 2026

# Executive Summary
Estimates metabolic dysfunction for adults 35 to 60 across two gates: incident type 2 diabetes risk in non-diabetic patients, and structured severity assessment in established T2D.

Three components: a two-gate base model (QDiabetes-2018 for incident T2D; a severity vector for established T2D); five Gate 1 phenotype modifiers (insulin resistance, central adiposity and weight trajectory, hepatic risk, family history, and cross-cutting cardiorespiratory fitness); and a combination that keeps the sigmoid for Gate 1 plus a structured action state for Gate 2. The prior multi-domain modifier stack is condensed to these five; Appendix C lists what was dropped.

Genetic and diagnostic reclassification signals (MODY, diabetes PRS, PNPLA3, TM6SF2) route outside this score. All scoring is deterministic.

# 1. Base Model: Two-Gate Routing
The clinical question changes once T2D is present. Before T2D the question is prevention; after, it is severity, hepatic risk, treatment adequacy, and trajectory, while the CVD, CKD, cancer, and neuro models own their own complication probabilities.

## 1.1 Gate 1: Non-Diabetic to T2D Onset Risk
QDiabetes-2018 with fasting glucose and HbA1c enhancement (Hippisley-Cox 2017 [Ref 1]): a sex-specific Cox model derived in 8.87M patients and validated in 2.63M, predicting 10-year incident T2D, C-statistic about 0.89 women / 0.87 men. Inputs: age, sex, ethnicity, BMI, smoking, first-degree T2D family history, Townsend score, treated hypertension, CVD history, corticosteroid/statin/atypical-antipsychotic use, PCOS, gestational diabetes, severe mental illness, fasting glucose, and HbA1c. Output is a calibrated 10-year point estimate; post-modifier output is stratification, not a newly validated probability.

## 1.2 Gate 2: Established T2D to Severity Assessment
No base survival model: T2D complications are already modeled by CVD, CKD, cancer, and neuro, so a separate T2D mortality score would double-count. Gate 2 emits a MetabolicSeverityVector (glycemic tier, hepatic tier, treatment-adequacy gaps, trajectory), a structured action and monitoring state, not an absolute probability.

## 1.3 Gate Selection Logic
Route to Gate 2 with a history of T2D, HbA1c at or above 6.5% on two readings, or fasting glucose at or above 126 mg/dL on two readings; otherwise Gate 1. If HbA1c and glucose are discordant, the higher-risk state governs routing and the discordance is kept as a data-quality flag [Ref 2].

# 2. Algorithmic Modifiers
Five Gate 1 modifiers adjust the QDiabetes base with signals it does not fully capture: insulin dynamics, adiposity distribution and trajectory, hepatic biology, familial context, and fitness. The prior five-domain stack (insulin, adiposity, hepatic/lipid, familial, CRF, with many sub-modifiers) is condensed to these five; Appendix C lists what was dropped. Gate 2 uses the same raw data but emits severity and treatment-gap state.

## Evidence grading
Each modifier carries a grade, reported beside it and never multiplied into the hazard ratio. Strong: trial, guideline-backed threshold, or large meta-analysis with a relevant endpoint. Moderate: large cohort or accepted marker with residual confounding. Weak: extrapolation, high heterogeneity, or emerging biomarker without a stable action path.

## How modifiers combine
Gate 1 keeps the sigmoid log-odds combination. Unlike CVD and CKD, whose low base risks let a flat product suffice, QDiabetes Gate 1 risk can be high enough that flat multiplication would overshoot. The base risk converts to log-odds, each modifier's single applicable log-HR is summed on (combined non-CRF contribution capped at 3.0x), the result converts back to probability, and cardiorespiratory fitness is applied last as a 0.65x to 1.4x multiplier.

```
logit      = ln( base / (1 - base) )
logit_adj  = logit + min( ln(IR) + ln(adiposity) + ln(hepatic) + ln(familial) , ln 3.0 )
risk_adj   = ( 1 / (1 + exp(-logit_adj)) ) x CRF
```

Missing modifiers contribute 0 to the logit (no imputation); if trajectory data are unavailable, the single-point state is used with a flag. Gate 2 emits a severity vector, not a modified probability.

## 2.1 Insulin Resistance
Insulin-resistance depth beyond the static glucose and HbA1c QDiabetes already uses; finds the window before fasting glucose rises. HOMA-IR above 2.5, 1.3x; above 4.0, 1.6x (Strong [Ref 3]; thresholds are model bins). When HOMA-IR is unavailable: fasting insulin above 15 with glucose below 100, 1.25x (Moderate [Ref 4]); or TyG above 8.5, 1.2x (Moderate [Ref 5]). Use one insulin-resistance state, highest applicable. HOMA-IR = fasting glucose x fasting insulin / 405.

## 2.2 Central Adiposity and Weight Trajectory
Adiposity distribution and trajectory beyond the static BMI term, with ethnicity-adjusted thresholds. Waist-to-height ratio above 0.5, 1.25x (preferred, travels across sex and ethnicity); or waist circumference above 102 cm men / 88 cm women (90 / 80 Asian and South Asian), 1.3x. Strong [Ref 6]. Weight gain of 5% or more over 12 months, 1.3x [Ref 7]; sustained intentional loss of 5% or more, 0.7x protective [Ref 8, Ref 9]. Use one central-adiposity state; gain and loss are mutually exclusive.

## 2.3 Hepatic Risk (FIB-4)
Liver-specific risk QDiabetes omits, so largely orthogonal to the base. FIB-4 1.30 to 2.67, 1.25x plus a hepatic-awareness flag; above 2.67, 1.5x plus a hepatology-referral flag. Strong, guideline-backed fibrosis triage [Ref 10, Ref 11]; the metabolic scalar is layered on that hepatic state, not a published T2D-onset HR. Dual use: Gate 1 modifier and Gate 2 MASLD triage.

## 2.4 Family History
Beyond the single-parent term in QDiabetes. Two or more first-degree relatives with T2D, or one with onset before 45, 1.3x. Onset before 35 in a first-degree relative, 1.4x plus conditional monogenic-diabetes (MODY) evaluation outside this score. Moderate [Ref 1, Ref 12]. Highest applicable rung.

## 2.5 Cross-Cutting Modifier: Cardiorespiratory Fitness
Applied last, multiplicative, cap 0.65x to 1.4x. Strong as a prevention lever; the percentile rungs are model bins [Ref 8, Ref 9, Ref 13]. Below the 20th percentile (CPET) or 15th (wearable), 1.4x; 20th to 49th / 15th to 49th, 1.1x; 50th to 74th / 50th to 79th, 1.0x; 75th to 97th / 80th to 97th, 0.80x; 97.7th and above, 0.65x. Wearable CRF needs a rolling-median window ending within 90 days; a drop over 2 METs flags worsening metabolic health. If unavailable, skip and flag to establish a baseline.

## 2.6 Gate 2 Severity Vector
For established T2D the model emits a structured action state, not an incident probability.

- Glycemic tier: well-controlled below 7.0%; suboptimal 7.0 to 8.0%; poorly controlled 8.0 to 10.0%; dangerous above 10.0% or recurrent severe hypoglycemia [Ref 2, Ref 14].
- Hepatic tier: FIB-4 below 1.30 low (annual rescreen); 1.30 to 2.67 intermediate (ELF or FibroScan); above 2.67 high (hepatology) [Ref 10, Ref 11].
- Treatment-adequacy gaps: metformin, cardiorenal protection (SGLT2i / GLP-1), statin, blood pressure, and weight-management gaps, each flagged when eligibility is met [Ref 14, Ref 15, Ref 16, Ref 17, Ref 18, Ref 19, Ref 20].
- Trajectory: HbA1c, weight, eGFR, and FIB-4 classified improving, stable, or worsening with two or more points over 6 months.

## 2.7 Coverage
Coverage is runtime data completeness, not Appendix A acquisition tier. A base-only run presents base risk and lists the highest-value missing tests rather than a modified number that implies unsupported precision.

## 2.8 Shared Input and External Routing
Raw metabolic inputs feed the CVD, CKD, cancer, and neuro models independently because each predicts a different outcome; the action layer dedupes interventions, so one lever serves several domains without double-counting the same outcome [Ref 21]. MODY genes, diabetes PRS, PNPLA3, and TM6SF2 are diagnostic or reclassification signals routed outside this score, not phenotype modifiers.

# 3. Clinical Examples

## Patient SP-001: Gate 1, Limited Metabolic Data
47-year-old Korean-American man, BMI about 26, non-diabetic, nonsmoker, no T2D family history. Base: QDiabetes about 8% 10-year incident T2D. No insulin, adiposity, hepatic, or familial modifier data; CRF about the 80th percentile (wearable).

Coverage is base-only, so per the coverage rule the model holds at about 8% rather than applying a CRF-only discount that would imply unsupported precision. High CRF is surfaced as a favorable lever to maintain.

Traditional care: glucose and HbA1c fine, repeat annually. Aleron: not high enough for medication, but missing data limits the read. Obtain fasting insulin for HOMA-IR, waist circumference, and GGT; maintain high CRF as the strongest protective lever.

## Patient M-002: Gate 1, High-Risk Full Data
45-year-old woman, BMI 31, waist 96 cm, HOMA-IR 4.2, FIB-4 1.4, mother and sister with T2D, nonsmoker, CRF at the 25th percentile. Base: QDiabetes about 18% (logit -1.516).

Modifiers: HOMA-IR 4.2 fires severe insulin resistance, 1.6x; waist-to-height 0.58 fires central adiposity, 1.25x; FIB-4 1.4 fires intermediate hepatic risk, 1.25x; strong family history, 1.3x. Sigmoid: logit_adj = -1.516 + ln(1.6) + ln(1.25) + ln(1.25) + ln(1.3) = -0.338, giving 41.6%. CRF at the 25th percentile applies 1.1x. Adjusted Gate 1 risk 45.8%.

Traditional care: prediabetes counseling and weight-loss advice. Aleron: immediate DPP-equivalent lifestyle intervention, consider metformin, consider a GLP-1 RA or tirzepatide for combined weight and metabolic benefit, and follow FIB-4 as a hepatic signal.

## Patient M-003: Gate 2, Established T2D Severity
55-year-old with established T2D, HbA1c 8.7%, BMI 32, FIB-4 2.9, eGFR 78, not on GLP-1 RA or SGLT2i, not on statin. History of T2D routes to Gate 2; no incident probability is produced.

Severity vector: glycemic tier poorly controlled; hepatic tier high (FIB-4 above 2.67); treatment gaps in cardiorenal protection, statin, and weight management. Traditional care: intensify diabetes medication and repeat labs. Aleron: hepatology referral or FibroScan/ELF confirmation, GLP-1 RA or SGLT2i prioritization, statin per ADA standards, and short-interval reassessment because glycemia and hepatic risk are both active.

# Appendix A: Variable Legend / Input Classification
Tier 1 = incomplete or misleading without it; Tier 2 = meaningfully worse; Tier 3 = essentially unchanged. Base inputs are always Tier 1. A variable is an action-layer lever only when both modifiable and causal.

| Tier | Variable | Assoc. Evidence | Use | Effect Size | Source | Modifiable | Causal | References |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | age / sex / ethnicity | Strong | Base | — | History | No | No | 1 |
| 1 | bmi | Strong | Base + modifier | Strong | Clinical | Yes | Yes | 1, 6 |
| 1 | smoking_status | Strong | Base | — | History | Yes | Yes | 1 |
| 1 | first_degree_family_history_t2d | Strong | Base | — | History | No | No | 1 |
| 1 | townsend_deprivation_score | Strong | Base | — | Derived | No | No | 1 |
| 1 | treated_hypertension | Strong | Base | — | History | Partial | Yes | 1 |
| 1 | cvd_history | Strong | Base | — | History | No | Unsettled | 1 |
| 1 | corticosteroid / statin / atypical_antipsychotic use | Strong | Base | — | Medication list | Yes | Yes | 1 |
| 1 | pcos / gestational_diabetes / severe_mental_illness | Strong | Base | — | History | No | Yes | 1 |
| 1 | fasting_plasma_glucose_mg_dl | Strong | Base + modifier | Varied | Lab | Yes | Yes | 1, 2 |
| 1 | hba1c_percent | Strong | Base + modifier | Varied | Lab | Yes | Yes | 1, 2 |
| 1 | history_of_type_2_diabetes | Strong | Base | — | History | No | Yes | 1, 2 |
| 1 | homa_ir | Strong | Modifier | 1.3x / 1.6x (2.1) | Derived | Yes | Yes | 3 |
| 1 | waist_to_height_ratio / waist_circumference | Strong | Modifier | 1.25x / 1.3x (2.2) | Clinical/Derived | Yes | Yes | 6 |
| 1 | fib_4 | Strong | Modifier | 1.25x / 1.5x (2.3) | Derived | Yes | Yes | 10, 11 |
| 2 | fasting_insulin_uIU_ml | Moderate | Modifier | 1.25x fallback (2.1) | Lab | Yes | Yes | 4 |
| 2 | tyg_index | Moderate | Modifier | 1.2x fallback (2.1) | Derived | Yes | Yes | 5 |
| 2 | weight_trajectory | Strong | Modifier | 0.7x / 1.3x (2.2) | Weight history | Yes | Yes | 7, 8, 9 |
| 2 | strong_family_history_t2d | Moderate | Modifier | 1.3x / 1.4x (2.4) | History | No | No | 1, 12 |
| 2 | vo2max_crf_percentile | Strong | Modifier | 0.65 to 1.4x (2.5) | CPET/Wearable | Yes | Yes | 8, 9, 13 |
| 2 | metformin / cardiorenal / statin / bp / weight gaps | Strong | Modifier (Gate 2) | Action gaps (2.6) | Medication + status | Yes | Yes | 14, 15, 16, 17, 18, 19, 20 |
| 3 | metabolic_trajectory_vector | Moderate | Metadata | — | Longitudinal | Partial | Unsettled | 2, 7, 13 |
| — | external genetic findings | — | Placeholder | — | Genetics | No | No | — |

Known gaps: Unsettled rows are kept for risk refinement, not action-layer targeting, until adjudicated causal. The liver enzymes (ALT, GGT), TG/HDL ratio, ferritin, uric acid, C-peptide, adiponectin, isolated HbA1c trajectory, and the class III obesity residual scored in prior versions were removed in this condensation (Appendix C) and can return as estimated periphery if a later calibration justifies their cost.

# Appendix B: Reference Studies
Reduced in v3.0 to the studies the model cites, renumbered contiguously. PMIDs unchanged.

| Ref | Citation | PMID | Used For |
| --- | --- | --- | --- |
| 1 | Hippisley-Cox J, Coupland C. QDiabetes-2018 risk prediction algorithm. BMJ. 2017. | 29158232 | Base model, core predictors, family history (Section 1, 2.4) |
| 2 | ADA. Diagnosis and Classification of Diabetes: Standards of Care 2024. Diabetes Care. 2024. | 38078589 | Diagnostic thresholds, gate selection, glycemic tiers (1.3, 2.6) |
| 3 | González-González JG et al. HOMA-IR and health outcomes: meta-analysis. High Blood Press Cardiovasc Prev. 2022. | 36181637 | HOMA-IR (2.1) |
| 4 | Weyer C et al. High fasting plasma insulin predicts T2D independent of insulin resistance. Diabetes. 2000. | 11118012 | Fasting insulin fallback (2.1) |
| 5 | da Silva A et al. Triglyceride-glucose index predicts T2D: meta-analysis. Prim Care Diabetes. 2020. | 32928692 | TyG fallback (2.1) |
| 6 | Ashwell M et al. Waist-to-height ratio as a cardiometabolic screening tool: meta-analysis. Obes Rev. 2012. | 22106927 | Central adiposity thresholds (2.2) |
| 7 | Weight change and incident T2D: Tehran Lipid and Glucose Study. Cardiovasc Diabetol. 2024. | 38890609 | Weight gain/loss trajectory (2.2) |
| 8 | Knowler WC et al. (DPP). Reduction in T2D incidence with lifestyle or metformin. NEJM. 2002. | 11832527 | Weight-loss credit, CRF prevention lever (2.2, 2.5) |
| 9 | Lindström J et al. Sustained T2D prevention: Finnish DPS follow-up. Lancet. 2006. | 17098085 | Weight-loss credit, CRF prevention lever (2.2, 2.5) |
| 10 | Rinella ME et al. AASLD Practice Guidance on NAFLD. Hepatology. 2023. | 36727674 | FIB-4 and MASLD triage (2.3, 2.6) |
| 11 | EASL-EASD-EASO Clinical Practice Guidelines on MASLD. J Hepatol. 2024. | 38851997 | FIB-4 and MASLD triage (2.3, 2.6) |
| 12 | Mottillo S et al. Metabolic syndrome and cardiovascular risk: meta-analysis. JACC. 2010. | 20863953 | Familial metabolic clustering context (2.4) |
| 13 | Williams PT. Vigorous exercise, fitness and incident diabetes. Med Sci Sports Exerc. 2008. | 18461008 | CRF modifier (2.5) |
| 14 | ADA. Pharmacologic Approaches to Glycemic Treatment: Standards of Care 2024. Diabetes Care. 2024. | 38078590 | Glycemic treatment, metformin gap (2.6) |
| 15 | ADA. Cardiovascular Disease and Risk Management: Standards of Care 2024. Diabetes Care. 2024. | 38078592 | Statin, blood pressure, cardiorenal gaps (2.6) |
| 16 | ADA. Obesity and Weight Management: Standards of Care 2024. Diabetes Care. 2024. | 38078578 | Weight-management gap (2.6) |
| 17 | Heerspink HJL et al. Dapagliflozin in chronic kidney disease (DAPA-CKD). NEJM. 2020. | 32970396 | SGLT2i cardiorenal gap (2.6) |
| 18 | EMPA-KIDNEY Collaborative Group. Empagliflozin in chronic kidney disease. NEJM. 2023. | 36331190 | SGLT2i cardiorenal gap (2.6) |
| 19 | Lincoff AM et al. SELECT: semaglutide and CV outcomes in obesity. NEJM. 2023. | 37952131 | GLP-1 RA weight/cardiorenal gap (2.6) |
| 20 | Wadden TA et al. Tirzepatide after intensive lifestyle intervention (SURMOUNT-3). Nat Med. 2023. | 37840095 | Weight-management gap (2.6) |
| 21 | DPP Research Group. Metformin and lifestyle on cancer incidence over 21 years. Cancer Prev Res. 2025. | 40243198 | Shared-input cross-domain caution (2.8) |

# Appendix C: Revision History
Newest first. Each row is a released version; the version line at the top reflects the most recent entry.

| Version | Date | Changes |
| --- | --- | --- |
| 3.0 | June 26, 2026 | Condensed-model rewrite. Structure unchanged from v2.6 (Executive Summary, Section 1 two-gate Base Model, Section 2 Algorithmic Modifiers, Section 3 Clinical Examples, Appendices A/B/C); only the modifier section, the worked examples, and the appendices changed, and prose was tightened for an executive-physician reader with inline PMIDs moved to Appendix B. Reduced Gate 1 to five scored modifiers: insulin resistance (consolidates HOMA-IR rungs with fasting-insulin and TyG fallbacks, was 2.1), central adiposity and weight trajectory (was 2.2), hepatic risk via FIB-4 (was 2.3), family history (was 2.4), and cross-cutting cardiorespiratory fitness (was 2.5). Removed the liver enzymes (ALT, GGT), TG/HDL ratio, ferritin, uric acid, fasting C-peptide, adiponectin, isolated HbA1c trajectory, and the class III obesity residual as scored modifiers. Kept the sigmoid log-odds combination for Gate 1 (unlike CVD and CKD, the high Gate 1 base risk would make a flat product overshoot), with the combined non-CRF contribution capped at 3.0x and CRF applied last; retained magnitudes and thresholds are unchanged. Gate 2 severity vector, two-gate routing, coverage rule, shared-input policy, and external genetic routing retained. Reduced Appendix B to cited studies, renumbered contiguously (PMIDs unchanged). |
| 2.6 | June 24, 2026 | QA correction pass. Corrected five Appendix B author/title labels whose PMIDs were topically correct but mis-attributed (Refs 14, 15, 17, 20, 25). Resolved the SP-001 example vs coverage-rule contradiction: with base-only coverage the example holds at the ~8% base estimate instead of a CRF-only-discounted 6.4%. No change to scoring arithmetic, magnitudes, QDiabetes base, or PMIDs. |
| 2.5 | June 24, 2026 | Claim-audit correction pass. Corrected QDiabetes derivation/validation sample sizes and male C-statistic language; replaced the generic ADA citation with section-specific Standards of Care references; added weight-change trajectory evidence; labeled exact biomarker thresholds and scalars as model cutpoints where the literature supports direction but not the precise coefficient. No change to scoring arithmetic or magnitudes. |
| 2.4 | June 24, 2026 | Operating-standard compliance pass. Added inline citations to base, modifier, Gate 2, CRF, and shared-input rules; resolved pending Appendix A references; added endpoint-matched references across the biomarker modifiers. No change to scoring arithmetic or magnitudes. |
| 2.3 | June 24, 2026 | Restructured Metabolic to the phenotype-model architecture: Base Model, Algorithmic Modifiers, Clinical Examples, appendices. Reframed as two-gate routing, folded output and uncertainty into the Base Model, normalized Appendix A to the CKD/CVD schema. No change to QDiabetes base, Gate 2 logic, CRF thresholds, or non-genetic magnitudes. |
| 2.2 | June 22, 2026 | Recast Metabolic as a phenotype risk model. Removed MODY genes, PRS, PNPLA3, and TM6SF2 as scored inputs; they route through the deterministic reclassification layer outside the score. |
| 2.1 | April 2026 | Current Metabolic specification. Appendix structure standardized to the Aleron risk-model operating standard. |
