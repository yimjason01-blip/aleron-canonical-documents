# Aleron MD · Sporadic Cancer Burden Calculator · v0 (illustrative, not yet calibrated)

**Status:** v0 draft. Structure is defensible; coefficients are evidence-anchored starting values that require clinical review (Mizani) and cohort calibration before any number is shown to a patient.

**Scope:** Sporadic (non-hereditary) cancer risk only. Genetics and family history are handled in separate layers and do not enter this model.

---

## 1. What this is and is not

This calculator produces a **modifiable-risk multiplier** for sporadic cancer, relative to an ideal-phenotype peer of the same age and sex.

- It **is** a deterministic, versioned index of preventable cancer-risk pressure carried by the patient's behavior and physiology.
- It **is not** an absolute screening probability, and it **does not** override site-specific screening protocols.
- It answers one question: *How much preventable, non-genetic cancer-risk pressure is this patient carrying, and what are the biggest movable drivers?*

Report it as a tier (Low / Moderate / High / Very High), never as an exact percentage.

### Hard boundaries

1. No genetics.
2. No family history. (That belongs in site-specific / familial routing, not sporadic burden.)
3. No screening override. High burden raises prevention priority; it does not by itself justify extra scans.
4. Correlated inputs are capped (see the metabolic-energetic cluster). Activity, VO2max, BMI, glucose, and waist overlap biologically and cannot all multiply freely.

---

## 2. Model form

A log-HR burden sum relative to an ideal phenotype.

```
SCB_lnHR = (B_smoke + B_alcohol)
         + lambda * (B_adiposity + max(B_activity, B_CRF) + B_dysglycemia + B_diet)

SCB Index = exp(SCB_lnHR)
```

Each `B_i = ln(HR)` for the patient's state relative to the lowest-risk reference state for that factor.

`lambda = 0.6` (shrinkage parameter for the correlated metabolic-energetic cluster).

### Why this structure

Two load-bearing design decisions:

1. **Carcinogen exposure (smoking, alcohol) combines multiplicatively at full weight.** These are mechanistically independent of metabolism and of each other, so their log-HRs add cleanly.
2. **The metabolic-energetic cluster is shrunk by `lambda` and uses MAX for fitness.** Adiposity, activity, CRF, dysglycemia, and diet share the same pathways (insulin / IGF-1, chronic inflammation, sex hormones). Summing their raw HRs double-counts the shared mechanism. `lambda ~ 0.6` discounts the cluster; `max(activity, CRF)` prevents counting fitness twice, since VO2max and physical activity are largely the same axis.

---

## 3. Coefficient table (evidence-anchored v0)

All HRs are all-cancer (or all-site cancer incidence/mortality) relative to the reference state.

| Factor | State | HR (all-cancer) | B = ln(HR) | Evidence anchor |
|---|---|---:|---:|---|
| **Smoking** | never (ref) | 1.00 | 0.00 | ACS CPS-II / CPS-3, *Cancer* 2022 (current vs never HR 1.55 W / 1.63 M) |
| | former | 1.20 | 0.18 | CHANCES consortium, pooled European cohorts |
| | current | 1.60 | 0.47 | ACS CPS-II / CPS-3 (above) |
| **Alcohol** | none / occasional (ref) | 1.00 | 0.00 | Bagnardi et al., *Br J Cancer* 2015 (dose-response meta, 572 studies) |
| | moderate (1-2 drinks/day) | 1.05 | 0.05 | site-weighted composite |
| | heavy (>=3 drinks/day) | 1.25 | 0.22 | composite; oral/pharynx/esophagus/liver/breast drive |
| **Adiposity** | per +5 kg/m^2 above BMI 22.5 | 1.08 | 0.077 * ((BMI - 22.5) / 5) | Renehan et al., *Lancet* 2008 (per 5 kg/m^2, all-site) |
| **Physical activity** | high (ref) | 1.00 | 0.00 | Moore et al., *JAMA Intern Med* 2016 (1.44M adults, 13/26 cancers) |
| | moderate | 1.10 | 0.10 | Shreves et al., *Lancet* 2023 (10k vs 5k steps HR 0.81) |
| | low / sedentary | 1.20 | 0.18 | composite 13-cancer |
| **CRF / VO2max** | high (ref) | 1.00 | 0.00 | Lee et al. meta, *Eur J Cancer* 2019 |
| | low | 1.23 | 0.21 | all-sites incidence HR 0.81 (high vs low CRF) |
| **Dysglycemia** | normal (ref) | 1.00 | 0.00 | Ohkuma et al., *Diabetologia* 2018 (121 cohorts, 20M people) |
| | prediabetes / insulin resistance | 1.08 | 0.08 | interpolated |
| | diabetes | 1.20 | 0.18 | RR 1.19 M / 1.27 W |
| **Diet** | WCRF-optimal (ref) | 1.00 | 0.00 | WCRF/AICR adherence meta, *Cancer* 2023 (~10% lower per point) |
| | mid | 1.05 | 0.05 | per-point ~0.90-0.97 |
| | poor | 1.12 | 0.11 | highest vs lowest tertile ~0.73-0.84 |

**Notes:**
- `lambda = 0.6`.
- The Diet term is the WCRF residual **after** removing the weight / activity / alcohol components of the WCRF score, so it does not double-count the cluster or the alcohol carcinogen term.
- The Adiposity term is continuous in BMI; waist circumference may replace or augment BMI in a later revision (better visceral-fat proxy).

---

## 4. Tier mapping

| SCB Index | Tier |
|---|---|
| < 1.3 | Low |
| 1.3 - 1.8 | Moderate |
| 1.8 - 2.5 | High |
| > 2.5 | Very High |

---

## 5. Worked examples

### Patient A — clean phenotype
Never-smoker, occasional alcohol, BMI 23, high activity, high CRF, normal glucose, good diet.

```
SCB_lnHR = 0
SCB Index = exp(0) = 1.00  ->  Low
```

### Patient B — typical at-risk
Never-smoker, moderate alcohol (0.05), BMI 30 (0.116), low activity (0.18) vs low CRF (0.21) -> max = 0.21, prediabetes (0.08), mid diet (0.05).

```
cluster = 0.6 * (0.116 + 0.21 + 0.08 + 0.05) = 0.274
SCB_lnHR = 0.05 + 0.274 = 0.324
SCB Index = exp(0.324) = 1.38  ->  Moderate
```

### Patient C — high burden
Current smoker (0.47), heavy alcohol (0.22), BMI 35 (0.193), low CRF (0.21), diabetes (0.18), poor diet (0.11).

```
cluster = 0.6 * (0.193 + 0.21 + 0.18 + 0.11) = 0.416
SCB_lnHR = 0.47 + 0.22 + 0.416 = 1.106
SCB Index = exp(1.106) = 3.02  ->  Very High
```

The spread (1.0 to ~3.0) is consistent with the iCARE / UK Biobank finding that setting all modifiable factors to ideal cuts lifetime cancer risk by roughly a third (median lifetime risk 29.5% M / 21.0% W -> 20.5% M / 16.5% W).

---

## 6. Output shape

### Physician view

```
Sporadic Cancer Burden: Moderate (index 1.38)

Top drivers (ranked by delta ln HR contribution):
  1. Adiposity (BMI 30)         +0.116
  2. Low fitness / activity     +0.126  (cluster-weighted)
  3. Dysglycemia (prediabetes)  +0.048  (cluster-weighted)

Protective: non-smoker, light alcohol, adequate diet
Largest movable lever: visceral adiposity + CRF (shared pathway)
```

### Patient view

> Your inherited cancer findings are handled separately. This section looks only at the part of cancer risk most affected by daily physiology and behavior. Your biggest opportunities are improving fitness, reducing visceral fat, and lowering alcohol exposure. These do not mean you need extra scans today, but they are meaningful prevention targets.

---

## 7. Limitations and open calibration items

| Issue | Status |
|---|---|
| Relative, not absolute | This is a modifiable-risk multiplier vs ideal phenotype, not a screening probability. Must not override protocols. |
| `lambda = 0.6` is a judgment | The single least-empirical number here. Needs calibration against a cohort (UK Biobank-style) once data exist. |
| Sex-specific coefficients needed | BMI (endometrial vs colon) and alcohol (breast) differ by sex. v1 should split the table by sex. |
| CRF is association, not rule-validated | Strong incidence/mortality signal, but no cancer calculator uses VO2max as a screening input. Kept in the cluster, capped via MAX, labeled association-grade. |
| Coefficients from heterogeneous meta-analyses | Mixed populations and endpoints (incidence vs mortality). Treat as anchored starting values pending Mizani review and cohort calibration. |
| Diet residualization | The Diet term must be computed as the WCRF residual after removing weight/activity/alcohol; otherwise it double-counts. |

---

## 8. Evidence references

1. Moore SC et al. Leisure-Time Physical Activity and Risk of 26 Types of Cancer in 1.44 Million Adults. *JAMA Intern Med* 2016. (13/26 cancers inverse; colon HR 0.84, lung 0.74, liver 0.73, kidney 0.77, breast 0.90)
2. Shreves AH et al. Dose-response of accelerometer-measured physical activity, step count, and cancer risk in the UK Biobank. *Lancet* 2023. (total activity HR 0.85 per SD; 10k vs 5k steps HR 0.81)
3. Schmid D, Leitzmann MF. Cardiorespiratory fitness as predictor of cancer mortality: a systematic review and meta-analysis. *Ann Oncol* 2015. (high vs low CRF, total cancer mortality RR 0.55)
4. Lee J et al. Cardiorespiratory fitness and site-specific risk of cancer in men: a systematic review and meta-analysis. *Eur J Cancer* 2019. (all-sites incidence HR 0.81; lung ~0.52; colorectal ~0.77)
5. Renehan AG et al. Body-mass index and incidence of cancer: a systematic review and meta-analysis of prospective observational studies. *Lancet* 2008. (per 5 kg/m^2 BMI, site-specific RRs)
6. Bagnardi V et al. Alcohol consumption and site-specific cancer risk: a comprehensive dose-response meta-analysis. *Br J Cancer* 2015. (572 studies; heavy-drinker RRs by site)
7. Ohkuma T et al. Sex differences in the association between diabetes and cancer. *Diabetologia* 2018. (121 cohorts, 20M individuals; all-site RR 1.27 W / 1.19 M)
8. ACS CPS-II / CPS-3. Key risk factors for the relative and absolute 5-year risk of cancer. *Cancer* 2022. (current smoking, any cancer HR 1.63 M / 1.55 W)
9. WCRF/AICR 2018 adherence score and cancer risk: systematic review and meta-analysis. *Cancer* 2023. (~27% lower highest vs lowest; ~10% per 1-point increment)
10. Butala NM et al. Projecting individualized probabilities of lifetime all-cancer risk (iCARE, UK Biobank). 2025. (median lifetime risk 29.5% M / 21.0% W; ideal modifiable -> 20.5% M / 16.5% W)

---

## 9. Revision history

| Version | Date | Change |
|---|---|---|
| v0 | 2026-06-22 | Initial structure (independent carcinogen factors + shrunk metabolic-energetic cluster), evidence-anchored coefficients, tier mapping, three worked examples. Illustrative, not yet calibrated. |
