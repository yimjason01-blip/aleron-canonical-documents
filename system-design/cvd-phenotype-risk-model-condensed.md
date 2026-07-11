# CVD Phenotype Risk Model

## Version 3.0 | June 26, 2026

# Executive Summary
Estimates 10-year ASCVD risk for adults 35 to 60. AHA PREVENT is the calibrated base; five phenotype modifiers adjust it for risk PREVENT does not capture. The 10-year number is the calibrated anchor; the 30-year number is directional until separately calibrated.

Three components: the PREVENT base; five modifiers (Lp(a), ApoB/LDL-C discordance, hs-CRP, HOMA-IR, cardiorespiratory fitness); and a flat combination, where the four lab modifiers multiply under one shared cap and CRF is applied last.

This layer predicts risk, never benefit. The modifier stack is a transparent calibration layer, not yet an outcome-validated model, so read the adjusted percent as stratification, not a new probability. Imaging and genetic reclassification (CAC, CCTA, FH, CAD PRS) route to a separate layer. All scoring is deterministic.

# 1. Base Model: AHA PREVENT
AHA PREVENT (Khan 2024 [Ref 1]) is a sex-specific, race-free, competing-risk Cox model for total CVD (ASCVD plus heart failure), derived and validated on about 6.6M adults, C-statistic 0.79 in women and 0.76 in men. It returns 10-year and 30-year absolute risk.

We assume it rather than re-derive it per member: it carries the most sensitive variables, outputs a number clinicians already act on, and is a published standard a member can be tracked against. The 10-year estimate is the calibrated anchor; any adjusted 30-year number is directional until horizon-specific calibration exists.

## 1.1 Inputs
Core: age, sex, total and HDL cholesterol, systolic BP, BP-treatment and statin use, diabetes, smoking, eGFR (CKD-EPI 2021). Optional PREVENT enhancers: UACR, HbA1c, social deprivation index.

## 1.2 Why PREVENT for Ages 35 to 60
Chosen over the Pooled Cohort Equations [Ref 2], SCORE2, and Framingham for the reasons in the table: it adds heart failure to ASCVD, integrates kidney function, drops the race coefficient, starts at age 30, and adjusts for competing risk, all of which matter most in this age window.

| Criterion | PREVENT | PCE (2013) | SCORE2 (2021) | Framingham |
| --- | --- | --- | --- | --- |
| Guideline endorsement | AHA 2024 primary prevention (replaces PCE) | ACC/AHA 2013 to 2018, now superseded | ESC 2021, European populations | Legacy |
| Race-free | Yes | No; race coefficient | Region-calibrated | Race-free |
| Includes HF | Yes; total CVD = ASCVD + HF | No; ASCVD only | No; fatal CVD only | Partial |
| Kidney integration | Yes; eGFR + optional UACR | No | No | No |
| Age range | 30 to 79 | 40 to 79 | 40 to 69 | 30 to 74 |
| Competing risk adjusted | Yes | No | No | No |
| Calibration in 35 to 60 | Well calibrated (derivation mean age 53) | Overestimates in younger adults | European-calibrated | Dated |
| Derivation N | 6.6M total | ~25K | ~680K | ~5K |
| Transparency | Published coefficients, deterministic | Published | Published | Published |

# 2. Algorithmic Modifiers
Five modifiers adjust PREVENT for what it does not capture: atherogenic particle burden, residual inflammation, insulin resistance, and fitness. The v2.9 four-domain stack (about two dozen sub-modifiers combined through a sigmoid) is condensed to these five; Appendix C lists what was dropped.

## Evidence grading
Each modifier carries a grade, reported beside it and never multiplied into the hazard ratio. Strong: RCT or large meta-analysis with a CVD endpoint. Moderate: large cohort with a CVD endpoint and some confounding. Weak: extrapolation or high heterogeneity.

## How modifiers combine
The four lab modifiers multiply under one shared 2.0x cap; cardiorespiratory fitness is applied last and separately, because it is the dominant modifiable lever and can move risk in either direction.

```
modifier_HR = min( Lp(a)_HR x ApoB_HR x hsCRP_HR x HOMA_HR , 2.0 )   # one shared cap
risk_adj    = clamp( PREVENT_risk x modifier_HR x CRF_HR )
```

This replaces the v2.9 per-domain caps and sigmoid log-odds combination; at these base risks the two agree. Missing modifiers default to 1.0 with no imputation, so when coverage is low, flag it and avoid false precision rather than implying reassurance.

## 2.1 Lipoprotein(a)
Lifelong, genetically set atherogenic particle that PREVENT omits. Continuous: HR = (Lp(a) nmol/L / 10)^0.11, floor 1.0, cap 1.5x. Strong and causal (ERFC [Ref 3]; Mendelian randomization [Ref 4], beta 0.11, a modeling choice to recalibrate on Aleron data). Measure in nmol/L, not mg/dL, which is contaminated by isoform-size variation [Ref 5].

| Lp(a) nmol/L | HR |
| --- | --- |
| 10 or below | 1.00 |
| 30 | 1.12 |
| 50 | 1.17 |
| 75 | 1.22 |
| 100 | 1.26 |
| 150 | 1.31 |
| 200 | 1.35 |
| 300 | 1.40 |
| 500 or above | 1.50 (cap) |

Action triggers (recommendations, not score): above 75 nmol/L, intensify risk factors and repeat the test; above 125, lipid-clinic referral, consider PCSK9 inhibition and CAC; above 200, target LDL-C below 55 and consider trial enrollment.

## 2.2 ApoB/LDL-C discordance
ApoB above 130 mg/dL with LDL-C below 130 mg/dL reveals particle burden LDL-C misses: 1.3x. Strong [Ref 6, Ref 7]; when the two disagree, ApoB tracks events better [Ref 8]. Fires only on discordance; if concordant, PREVENT already captures the lipid risk.

## 2.3 hs-CRP
Residual inflammation, two mutually exclusive rungs: at or above 2.0 mg/L on two reads, 1.25x; at or above 5.0 mg/L persistent with infection excluded, 1.4x. Strong (ERFC exposure [Ref 9]; JUPITER [Ref 10]; CANTOS, COLCOT, LoDoCo2 [Ref 11, Ref 12, Ref 13] support inflammation as a causal pathway). Attenuated because PREVENT partly captures inflammation through metabolic and renal inputs.

## 2.4 HOMA-IR (non-diabetic)
Insulin resistance before overt diabetes: HOMA-IR above 3.0, 1.15x. Moderate [Ref 14]; attenuated because the metabolic model owns the diabetes trajectory, leaving CVD the residual vascular signal.

## 2.5 Cross-Cutting Modifier: Cardiorespiratory Fitness (CRF)
The strongest modifiable lever, applied last and separately from the lab stack (Mandsager [Ref 15]: roughly a 5-fold mortality gradient, continuous, no plateau; Kodama [Ref 16]).

### 2.5.1 CRF Modifier Levels (Age/Sex-Adjusted Percentiles)
VO2max converts to METs, then to an age/sex-adjusted percentile (the percentile is the input, not absolute METs). Single modifier, cap 0.65x to 1.5x:

- Below 20th percentile: 1.5x
- 20th to 49th: 1.15x
- 50th to 74th: 1.0x (neutral)
- 75th to 97th: 0.80x
- 97.7th and above: 0.65x

Wearable bins shift about 5 percentile points to absorb measurement error. For a 47-year-old man this spans roughly VO2max below 28 (low) to above 51 ml/kg/min (elite).

### 2.5.2 Measurement Source and Uncertainty Buffer
Wearable VO2max correlates r = 0.83 with CPET [Ref 18] but carries plus or minus 3 to 5 ml/kg/min of individual error. Require a source flag (wearable, CPET, or submaximal); widen wearable thresholds rather than attenuate the hazard ratio.

### 2.5.3 Data Quality Safeguards
Wearable CRF: 30 or more days, rolling median, window ending within 90 days of the run. Report level and trend. Flag an unexplained drop of more than 2 METs over 6 months for occult cardiac or pulmonary disease.

### 2.5.4 CRF Not Available
With no CRF data, skip the modifier, output lab-modified risk, and recommend establishing a baseline by wearable onboarding or an exercise test.

### 2.5.5 Shared Input Policy
CRF feeds every domain model with outcome-specific hazard ratios (CVD mortality here; dementia, insulin sensitivity, and future CKD elsewhere). The action layer dedupes "increase exercise" into one intervention with a multi-domain benefit.

## 2.6 Context Flags (carried, not scored)
Surfaced for the care discussion, not folded into the number:

- Premature ASCVD family history (first-degree relative, man under 55 or woman under 65) [Ref 20].
- Untreated LDL-C at or above 190 mg/dL: suspect familial hypercholesterolemia and route to genetic confirmation [Ref 21]; a confirmed variant routes to reclassification, not here.
- SGLT2 inhibitor or GLP-1 agonist use: protective context.
- Cardiomyopathy or sudden-death family history: cardiology referral, never a score.

## 2.7 Imaging and Genetic Reclassification Handoff
CAC, CCTA, FH findings, and CAD PRS are not phenotype modifiers. They route to the separate reclassification layer, which may cap, floor, override, or refer after this estimate is generated. This document exposes the handoff, not the rules.

# 3. Clinical Examples

## Patient SP-001: The Enhancer-Positive, Fitness-Protected Case
47-year-old man, non-diabetic, nonsmoker. Lp(a) 72 nmol/L; ApoB and LDL-C concordant; hs-CRP normal; HOMA-IR not drawn. CRF about the 80th percentile (wearable). No FH variant.

PREVENT 10-year risk about 4.5%. Modifiers: Lp(a) (72/10)^0.11 = 1.24, others 1.0, so combined 1.24, giving 5.6%. CRF at the 80th percentile applies 0.80x, returning to 4.5%.

Adjusted output about 4.5%. The Lp(a) signal lifts risk roughly a point; strong fitness offsets it. Traditional care says "labs fine, see you next year." Aleron reads it as low-intermediate with a standing Lp(a) signal and a fitness offset that is not guaranteed to last: surveil, optimize lifestyle, attend to lipids, and obtain ApoB and fasting insulin to close coverage.

# Appendix A: Variable Legend / Input Classification
Tier 1 = incomplete or misleading without it; Tier 2 = meaningfully worse; Tier 3 = essentially unchanged. Base inputs are always Tier 1.

| Tier | Variable | Assoc. Evidence | Use | Effect Size | Source | Modifiable | Causal | References |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | age | Strong | Base | — | History | No | No | 1 |
| 1 | sex | Strong | Base | — | History | No | No | 1 |
| 1 | systolic_bp | Strong | Base | — | Clinic | Yes | Yes | 1 |
| 1 | smoking_status | Strong | Base | — | History | Yes | Yes | 1 |
| 1 | diabetes_status | Strong | Base | — | History | Yes | Yes | 1 |
| 1 | hdl_cholesterol | Strong | Base | — | Lab | Yes | No | 1, 22 |
| 1 | total_cholesterol | Strong | Base | — | Lab | Yes | No | 1, 6 |
| 1 | egfr / serum_creatinine | Strong | Base | — | Derived | Partial | Unsettled | 1, 19 |
| 1 | statin_use | Strong | Base | — | History | No | Yes | 1, 7 |
| 1 | bp_treatment_status | Strong | Base | — | History | No | Yes | 1 |
| 2 | uacr | Strong | Base | Optional PREVENT enhancer | Lab (urine) | Yes | Unsettled | 19 |
| 2 | hba1c / fasting_glucose | Strong | Base | Optional PREVENT enhancer | Lab | Yes | Unsettled | 1 |
| 2 | lpa_nmol | Strong | Modifier | Continuous HR to 1.5x cap (2.1) | Lab | Partial | Yes | 3, 4, 5 |
| 2 | apob | Strong | Modifier | 1.3x ApoB/LDL-C discordance (2.2) | Lab | Yes | Yes | 6, 7, 8 |
| 2 | ldl_cholesterol | Strong | Modifier | ApoB/LDL-C discordance support (2.2) | Lab | Yes | Yes | 6, 7, 8 |
| 2 | vo2max / crf_percentile | Strong | Modifier | 0.65 to 1.5x CRF cross-cutting (2.5) | CPET/Wearable | Yes | Unsettled | 15, 16, 17, 18 |
| 3 | hscrp | Strong | Modifier | 1.25x / 1.4x (2.3) | Lab | Yes | Unsettled | 9, 10, 11, 12, 13 |
| 3 | fasting_insulin / homa_ir | Moderate | Modifier | 1.15x if HOMA-IR above 3.0 (2.4) | Lab | Yes | Unsettled | 14 |
| — | family_history_cvd | Moderate | Context flag (not scored) | Surfaced for care discussion (2.6) | History | No | No | 20 |
| — | untreated_ldl / fh_suspicion | Strong | Context flag (not scored) | FH suspicion, route to genetics (2.6) | Lab/History | Yes | Yes | 21 |
| — | sglt2i_status / glp1ra_status | Strong | Context flag (not scored) | Protective context (2.6) | History | No | Yes | — |

Known gaps: Unsettled rows are kept for risk refinement, not action-layer targeting, until adjudicated causal. The autonomic, oxidized-LDL, omega-3, and metabolic-syndrome variables scored in v2.9 were removed in this condensation (Appendix C) and can return as estimated periphery if a later calibration justifies their cost.

# Appendix B: Reference Studies
Reduced in v3.0 to the studies the model cites, renumbered contiguously. PMIDs unchanged.

| Ref | Citation | PMID | Used For |
| --- | --- | --- | --- |
| 1 | Khan SS et al. Development and Validation of the AHA/ASA PREVENT Equations. Circulation. 2024. | 37947085 | PREVENT base equations (Section 1) |
| 2 | Goff DC Jr et al. 2013 ACC/AHA Guideline on the Assessment of Cardiovascular Risk. Circulation. 2014. | 24222018 | Base model comparison (Section 1.2) |
| 3 | Emerging Risk Factors Collaboration. Lipoprotein(a) concentration and risk of CHD, stroke, and nonvascular mortality. JAMA. 2009. | 19622820 | Lp(a) association (2.1) |
| 4 | Burgess S et al. Association of LPA Variants With Risk of Coronary Disease: A Mendelian Randomization Analysis. JAMA Cardiol. 2018. | 29926099 | Lp(a) causal evidence (2.1) |
| 5 | Volgman AS et al. Genetics and Pathophysiology of Lipoprotein(a). JACC. 2024. | 38879448 | Lp(a) unit interpretation (2.1) |
| 6 | Ference BA et al. Low-density lipoproteins cause atherosclerotic cardiovascular disease. Eur Heart J. 2017. | 28444290 | LDL/ApoB causal evidence (2.2) |
| 7 | Cholesterol Treatment Trialists' Collaboration. Efficacy and safety of LDL-lowering therapy. Lancet. 2012. | 22607822 | ApoB/LDL treatment evidence (2.2) |
| 8 | Mora S et al. Discordance of LDL cholesterol with alternative LDL-related measures and future coronary events. Circulation. 2014. | 24345402 | ApoB/LDL-C discordance (2.2) |
| 9 | Emerging Risk Factors Collaboration. C-reactive protein concentration and risk of CHD, stroke, and mortality. Lancet. 2010. | 20031199 | hsCRP exposure association (2.3) |
| 10 | Ridker PM et al. Rosuvastatin to Prevent Vascular Events in Men and Women with Elevated CRP (JUPITER). NEJM. 2008. | 18997196 | hsCRP / JUPITER (2.3) |
| 11 | Ridker PM et al. Antiinflammatory Therapy with Canakinumab for Atherosclerotic Disease (CANTOS). NEJM. 2017. | 28845751 | Inflammation causal support (2.3) |
| 12 | Tardif JC et al. Efficacy and Safety of Low-Dose Colchicine after Myocardial Infarction (COLCOT). NEJM. 2019. | 31733140 | Inflammation intervention support (2.3) |
| 13 | Nidorf SM et al. Colchicine in Patients with Chronic Coronary Disease (LoDoCo2). NEJM. 2020. | 32865380 | Inflammation intervention support (2.3) |
| 14 | Gast KB et al. Insulin Resistance and Risk of Incident Cardiovascular Events in Adults without Diabetes. PLoS ONE. 2012. | 23300589 | HOMA-IR insulin resistance (2.4) |
| 15 | Mandsager K et al. Association of Cardiorespiratory Fitness With Long-term Mortality. JAMA Netw Open. 2018. | 30646252 | CRF association (2.5) |
| 16 | Kodama S et al. Cardiorespiratory fitness as a quantitative predictor of all-cause mortality. JAMA. 2009. | 19454641 | CRF meta-analysis (2.5) |
| 17 | Singh B et al. Objectively measured and estimated CRF and mortality: a meta-analysis. J Sport Health Sci. 2025. | 39271056 | CRF modifier evidence (2.5) |
| 18 | Dosis A et al. Exploiting Unsupervised Free-Living Data for Wearable VO2max Estimation. JMIR Mhealth Uhealth. 2026. | 41592155 | Wearable VO2max validation (2.5.2) |
| 19 | Matsushita K et al. Association of eGFR and albuminuria with mortality and renal outcomes (CKD-PC). Lancet. 2010. | 20483451 | eGFR/UACR association (Section 1, Appendix A) |
| 20 | Lloyd-Jones DM et al. Parental cardiovascular disease as a risk factor for CVD in middle-aged adults. JAMA. 2004. | 15138242 | Premature family history context flag (2.6) |
| 21 | Perak AM et al. Long-Term Risk of ASCVD in US Adults With the FH Phenotype. Circulation. 2016. | 27358432 | FH phenotype context flag (2.6) |
| 22 | Voight BF et al. Plasma HDL cholesterol and risk of myocardial infarction. Lancet. 2012. | 22607825 | HDL non-causal evidence (Appendix A) |

# Appendix C: Revision History
Newest first. Each row is a released version; the version line at the top reflects the most recent entry.

| Version | Date | Changes |
| --- | --- | --- |
| 3.0 | June 26, 2026 | Condensed-model rewrite. Structure unchanged from v2.9 (Executive Summary, Section 1 Base Model, Section 2 Algorithmic Modifiers, Section 3 Clinical Examples, Appendices A/B/C); only the modifier section, the worked example, and the appendices changed, and the prose was tightened for an executive-physician reader with inline PMIDs moved to Appendix B. Reduced the modifier set from the v2.9 four-domain stack (about two dozen sub-modifiers) to five scored modifiers: Lp(a) (was A1), ApoB/LDL-C discordance (was A4), hs-CRP (was A6/A7, now two rungs of one modifier), HOMA-IR (was C1), and cardiorespiratory fitness (was Section 2.5). Removed oxidized LDL (A5), omega-3 index (A8), the Domain B autonomic ladder (B1 through B7), metabolic syndrome (C2), the HbA1c rungs (C3, C4), and the protective-medication credits (C5, C6) as scored modifiers. Replaced the per-domain caps (A 2.5x, B 2.0x, C 2.0x, D 1.5x) and the sigmoid log-odds combination with a flat multiplicative layer under one shared 2.0x cap, CRF applied last. Dropped the Lp(a) x FH interaction multiplier. Demoted premature family history (D1), the untreated-LDL FH trigger (D2), the cardiomyopathy/sudden-death history (D3), and SGLT2i/GLP-1 use to non-scored context flags (Section 2.6). Retained magnitudes and thresholds are unchanged from v2.9; this revision removes modifiers and simplifies combination, it does not re-tune the kept ones. Basis: in cohort simulation the five modifiers retain essentially all scoreable CVD modifier value at about $46 per member-year versus about $196 for the full battery. |
| 2.9 | June 24, 2026 | Applied review-note fixes. Clarified that the 10-year PREVENT base risk is the calibrated anchor for adjusted phenotype scoring, while adjusted 30-year phenotype risk is directional/unvalidated until horizon-specific modifier calibration exists. Added the caveat that the full modifier stack is not yet an integrated validated prediction model and should be treated as stratification rather than a newly calibrated probability. Added modifier-coverage policy for missing data. Fixed Domain C protective-medication logic and added indication gating for non-diabetic SGLT2i use. No change to modifier magnitudes. |
| 2.8 | June 24, 2026 | Second source-validation pass. Corrected the metabolic-syndrome effect size in C2 to Mottillo RR 2.35 (CVD) and 2.40 (CV mortality). Separated SGLT2i MACE effect from the HF/CV-death benefit. Corrected omega-3 (A8) to Harris 2018 quintiles. Reframed B1 BP-variability evidence as direction-only. Fixed the Mandsager direction and the Tsuji cohort label. Corrected Appendix B metadata. No change to magnitudes or arithmetic. |
| 2.7 | June 24, 2026 | Claim-validation pass against source abstracts. Added endpoint-matched sources for ApoB/LDL-C discordance, hsCRP exposure, HbA1c dose-response, FH phenotype risk, and reverse-dipping nocturnal BP. No change to magnitudes or arithmetic. |
| 2.6 | June 24, 2026 | Operating-standard compliance pass. Added inline citations to all body rules and Domain D. Resolved 6 pending Appendix A references. Removed 8 orphan imaging/genetics refs. Renumbered Appendix B. Fixed hsCRP grade mismatch. No change to base equation, magnitudes, or arithmetic. |
| 2.5 | June 24, 2026 | Normalized Appendix A to the CKD v3.5 legend contract: Effect Size and References columns, association evidence strength-only, references out of evidence prose, future-only rows removed except the ABPM placeholder. |
| 2.4 | June 24, 2026 | Restructured to the concise phenotype-model architecture: Base Model, Algorithmic Modifiers, Clinical Examples, appendices. Moved CRF under modifiers, converted CAC/CCTA/PRS to an external reclassification handoff. No change to PREVENT equation, non-imaging magnitudes, or arithmetic. |
| 2.3 | June 22, 2026 | Ground-up structural rewrite to the operating-standard architecture matching the CKD document. Folded combination, confidence, and time-horizon sections into the modifier and confidence sections. No change to the PREVENT equation, CRF logic, magnitudes, or arithmetic. |
| 2.2 | June 22, 2026 | Recast CVD as a phenotype risk model. Removed genetic test-result rows as scored inputs (FH variant gene, Invitae panel, FH classification, CAD PRS); genetic findings now route through the deterministic reclassification layer. No change to PREVENT equation, CRF logic, or non-genetic magnitudes. |
| 2.1 | April 2026 | Standardized appendices to Variable Legend, Reference Studies, and Revision History. Converted the legend to the Aleron schema separating association from causal interpretation. No change to base model, modifiers, combination, or arithmetic. |
