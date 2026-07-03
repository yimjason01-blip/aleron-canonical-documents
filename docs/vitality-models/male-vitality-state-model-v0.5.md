# Aleron MD Male Vitality State Model v0.5

## In brief

Male Vitality State Model = felt-state score plus a three-failure-mode causal classifier. Symptoms set the score. A first split routes the patient into Recovery Failure, Drive Failure, or Capability Failure. Subdrivers explain the mode. The Action Layer receives the dominant mode plus ranked subdrivers, not recommendations.

## 1. Architecture

```text
Symptoms (7 domains)            -> vitality_score, vitality_band
Failure-mode classifier         -> dominant mode (recovery | drive | capability)
Subdriver attribution           -> ranked subdrivers inside the dominant mode
Modifiers                       -> medication, substance, androgen, metabolic, medical
Output                          -> Vitality State Brief + Action Layer seeds
```

Hard separations:
- Symptom data feeds only the score and the failure-mode classifier.
- Objective and contextual data feed only attribution.
- Androgen is a modifier inside Drive Failure, not a top-level driver.

## 2. Failure modes

| Failure mode | What it means | Dominant symptoms |
|---|---|---|
| **Recovery Failure** | The patient does not recover from daily load. | poor sleep, fatigue, low exercise tolerance, cognitive fog after exertion |
| **Drive Failure** | The patient feels low motivational and sexual drive. | low mood, low drive, low libido, withdrawal, irritability |
| **Capability Failure** | The patient cannot do the things he wants to do. | pain, functional limitation, weakness, exercise intolerance from pain or injury |

A patient can have more than one mode. The model names the dominant mode and lists secondary modes if present.

## 3. Method

The model runs in six deterministic steps.

1. Validate minimum inputs.
2. Compute the vitality score from seven symptom domains.
3. Compute failure-mode scores from symptoms only.
4. Pick the dominant failure mode.
5. Inside the dominant mode, rank subdrivers using objective and contextual signals.
6. Apply modifiers, emit Vitality State Brief and Action Layer seeds.

## 4. Minimum inputs

Required for a complete run.

Seven symptom domains, each 0 to 4:

```text
energy_fatigue
sleep_quality
mood_drive
cognitive_clarity
libido_sexual_function
pain_discomfort
exercise_tolerance_recovery
```

Required context (used only for attribution, not score):

```text
sleep screen (snoring, witnessed apnea, daytime sleepiness, nocturia)
height, weight, BMI or waist
BP
A1c or glucose if available
standard lipid panel if available
morning total testosterone if available
PHQ-2 or PHQ-9
GAD-2 or GAD-7
alcohol, cannabis, nicotine screen
medication list with start dates
training history
injury and functional limitation screen
```

High-value but nonblocking:

```text
SHBG
calculated free testosterone
grip strength
DEXA
ApoB
STOP-BANG
Epworth
IIEF-5
sleep study
wearable sleep, RHR, HRV, training load
```

## 5. Vitality score equation

Score is symptom burden only.

```text
vitality_score = 100 - sum(weight_i * severity_i / 4)
```

| Symptom domain | Weight |
|---|---:|
| sleep_quality | 18 |
| energy_fatigue | 16 |
| mood_drive | 16 |
| pain_discomfort | 14 |
| libido_sexual_function | 12 |
| cognitive_clarity | 12 |
| exercise_tolerance_recovery | 12 |

Bands:

| Score | Band |
|---|---|
| 0 to 24 | low |
| 25 to 49 | strained |
| 50 to 74 | stable |
| 75 to 100 | high |

Rule: objective data cannot move the score. Objective data only explains the score.

## 6. Failure-mode classifier

Each failure mode gets a 0 to 100 score from symptoms only.

```text
RecoveryFailure = 100 * (
  0.40 * sleep_quality/4
+ 0.25 * energy_fatigue/4
+ 0.20 * exercise_tolerance_recovery/4
+ 0.15 * cognitive_clarity/4
)

DriveFailure = 100 * (
  0.45 * mood_drive/4
+ 0.30 * libido_sexual_function/4
+ 0.15 * cognitive_clarity/4
+ 0.10 * energy_fatigue/4
)

CapabilityFailure = 100 * (
  0.45 * pain_discomfort/4
+ 0.35 * exercise_tolerance_recovery/4
+ 0.20 * energy_fatigue/4
)
```

Dominant mode = the highest score, with these rules:

1. If two modes are within 10 points, both are reported. The higher score is dominant.
2. If all three are below 25, the patient is in a high vitality state with no dominant failure mode.
3. If exercise_tolerance_recovery is high but pain is zero, route to Recovery Failure, not Capability Failure.
4. If libido is the only elevated symptom, route to Drive Failure and gate androgen concordance in Section 7.

## 7. Subdriver attribution inside the dominant mode

Each mode has a fixed subdriver set. Subdrivers are scored 0 to 100 using objective and contextual signals only. Symptoms already used in the classifier are not reused.

Notation: each `n_*` is a normalized 0 to 4 signal with provenance metadata.

### 7.1 Recovery Failure subdrivers

```text
S_sleep_apnea           = 100 * (0.45 * n_OSA_risk + 0.35 * n_sleep_fragmentation + 0.20 * n_central_adiposity)/4
S_sleep_behavior        = 100 * (0.40 * n_sleep_duration + 0.30 * n_sleep_fragmentation + 0.20 * n_substance_burden + 0.10 * n_alcohol_evening)/4
S_overreaching          = 100 * (0.40 * n_training_load + 0.30 * n_HRV_drop + 0.20 * n_RHR_elevation + 0.10 * n_training_disruption)/4
S_metabolic_drag        = 100 * (0.30 * n_central_adiposity + 0.25 * n_glycemic + 0.25 * n_BP + 0.20 * n_lipids)/4
S_medical_contributor_R = 100 * (0.40 * n_thyroid_or_anemia_signal + 0.30 * n_inflammatory + 0.30 * n_missing_medical_labs)/4
```

### 7.2 Drive Failure subdrivers

```text
S_mood                  = 100 * (0.50 * n_PHQ + 0.30 * n_GAD + 0.20 * n_agency_withdrawal)/4
S_medication_substance  = 100 * (0.45 * n_medication_temporal_match + 0.30 * n_substance_burden + 0.25 * n_alcohol_burden)/4
S_androgen              = 100 * (0.50 * androgen_concordance + 0.30 * n_free_testosterone + 0.20 * n_total_testosterone)/4
S_stress_burnout        = 100 * (0.40 * n_perceived_stress + 0.35 * n_workload + 0.25 * n_social_isolation)/4
S_medical_contributor_D = 100 * (0.40 * n_thyroid_signal + 0.30 * n_inflammatory + 0.30 * n_missing_medical_labs)/4
```

Concordance gate for S_androgen:

```text
androgen_symptom = max(libido_sexual_function, mood_drive, energy_fatigue, exercise_tolerance_recovery)
androgen_lab     = max(n_total_testosterone, n_free_testosterone)
androgen_concordance = min(androgen_symptom, androgen_lab)
```

Rule: if `androgen_concordance < 2`, S_androgen cannot exceed 40 and cannot be primary subdriver. Symptoms or labs alone do not earn primary attribution.

### 7.3 Capability Failure subdrivers

```text
S_pain_injury           = 100 * (0.50 * n_injury_limitation + 0.30 * n_functional_limitation + 0.20 * n_pain_chronicity)/4
S_deconditioning        = 100 * (0.40 * n_training_disruption + 0.30 * n_strength_deficit + 0.30 * n_exercise_tolerance_objective)/4
S_metabolic_drag_C      = 100 * (0.30 * n_central_adiposity + 0.25 * n_glycemic + 0.25 * n_BP + 0.20 * n_lipids)/4
S_sarcopenia_signal     = 100 * (0.50 * n_strength_deficit + 0.30 * n_lean_mass_deficit + 0.20 * n_age_decline_signal)/4
S_medical_contributor_C = 100 * (0.40 * n_inflammatory + 0.30 * n_cardiopulm_signal + 0.30 * n_missing_medical_labs)/4
```

## 8. Modifiers

Modifiers reweight subdrivers across modes. They do not introduce new subdrivers.

| Modifier | Effect |
|---|---|
| Strong medication temporal match | +15 to S_medication_substance (Drive) and to S_sleep_behavior (Recovery) |
| AUDIT-C >= 6 | +10 to S_sleep_behavior, S_mood, S_androgen suppression |
| Central adiposity + OSA risk + low energy | +10 to S_sleep_apnea, prefer Recovery Failure on ties |
| Pain blocks training | force Capability Failure if Capability score is within 15 of dominant |
| Elite conditioning (>= 90th percentile) | -25% on S_deconditioning and S_sarcopenia_signal only |
| Missing high-value data | lowers confidence, never erases a clear symptom pattern |

## 9. Vitality State Brief output

```json
{
  "state_type": "vitality",
  "model": "male_vitality_v0.5",
  "status": "complete|insufficient_input|complete_with_quality_warning",
  "vitality_score": 0,
  "vitality_band": "low|strained|stable|high",
  "state_summary": "",
  "dominant_failure_mode": "recovery|drive|capability|none",
  "secondary_failure_modes": [],
  "subdriver_rank": [
    {
      "subdriver": "sleep_apnea",
      "score": 78,
      "supporting_signals": [],
      "data_that_would_change_rank": [],
      "confidence": "low|medium|high"
    }
  ],
  "primary_subdriver": "",
  "secondary_subdrivers": [],
  "missing_data_that_would_change_rank": [],
  "confidence": "low|medium|high",
  "recommended_cadence_days": 30,
  "action_layer_seeds": []
}
```

## 10. Confidence equation

```text
confidence_score = 100 * (
  0.40 * input_completeness
+ 0.30 * measurement_quality
+ 0.20 * symptom_mode_agreement
+ 0.10 * subdriver_separation
)
```

All components are 0 to 1.

```text
input_completeness    = required_groups_present / required_groups_total
measurement_quality   = mean(provenance_quality across top 3 subdrivers)
symptom_mode_agreement = (dominant_mode_score - second_mode_score) / 25, clipped 0 to 1
subdriver_separation  = (top_subdriver_score - second_subdriver_score) / 25, clipped 0 to 1
```

| Confidence score | Confidence |
|---|---|
| 0 to 49 | low |
| 50 to 74 | medium |
| 75 to 100 | high |

## 11. Cadence equation

```text
if primary_subdriver in [sleep_behavior, sleep_apnea, mood, medication_substance, stress_burnout]: cadence = 30 days
elif primary_subdriver in [pain_injury, metabolic_drag, deconditioning, androgen, sarcopenia_signal]: cadence = 90 days
elif vitality_band == "high" and dominant_failure_mode == "none": cadence = 180 days
else cadence = 90 days
```

## 12. Action Layer seed contract

For each subdriver with score >= 50:

```json
{
  "target_failure_mode": "recovery|drive|capability",
  "target_subdriver": "sleep_apnea",
  "score": 78,
  "reason": "",
  "tracking_signals": [],
  "data_that_would_change_rank": [],
  "risk_interaction_check_required": true
}
```

Tracking signals by subdriver (representative, not exhaustive):

| Subdriver | Tracking signals |
|---|---|
| sleep_apnea | STOP-BANG, HSAT/PSG, daytime sleepiness, BP, RHR |
| sleep_behavior | sleep duration, sleep regularity, evening alcohol, screen exposure |
| overreaching | training load, HRV, RHR, perceived recovery |
| mood | PHQ, GAD, drive rating, social engagement |
| medication_substance | symptom timing relative to dose, AUDIT-C, libido, sleep |
| androgen | repeat morning total testosterone, SHBG, free testosterone, libido, IIEF-5 |
| stress_burnout | perceived stress, workload, social connectedness |
| pain_injury | pain rating, functional limitation, training tolerance |
| deconditioning | training consistency, grip, RHR, functional benchmarks |
| metabolic_drag | waist, BP, A1c, ApoB, training tolerance |
| sarcopenia_signal | grip strength, lean mass, SARC-F, functional tests |
| medical_contributor | CBC, TSH, ferritin, hs-CRP, B12, vitamin D as indicated |

## 13. Evidence anchors

The architecture and weights are calibrated against established literature in male vitality, sleep, androgens, mood, and capability. Weights remain proposed priors until fixture-tested. Anchors include:

- Sleep, testosterone, and cortisol balance in aging men (Rev Endocr Metab Disord 2022, PMID 36152143).
- Sexual dysfunction predictors in men with obstructive sleep apnea (Front Neurol 2026, PMID 41884338).
- Approach to the Patient: Low Testosterone in Men With Obesity, Grossmann (J Clin Endocrinol Metab 2025, PMID 40052430).
- Indications for testosterone therapy in men (Curr Opin Endocrinol Diabetes Obes 2024, PMID 39311216).
- SSRI-associated sexual dysfunction, systematic review and meta-analysis (Eur J Clin Pharmacol 2026, PMID 41721013).
- Hand grip strength as a proposed new vital sign (J Health Popul Nutr 2024, PMID 38195493).
- Sleep and athletic performance, multidimensional review (J Clin Med 2025, PMID 41227002).
- Lifestyle, diet, and body composition effects on free testosterone and cortisol in young men (Nutrients 2025, PMID 41374062).

Standing references retained:
- Endocrine Society Clinical Practice Guideline on Testosterone Therapy (Bhasin et al, J Clin Endocrinol Metab 2018).
- AUA Guideline on Testosterone Deficiency (Mulhall et al, 2018).
- PHQ-9 (Kroenke et al), GAD-7 (Spitzer et al), AUDIT-C (Bush et al).
- EWGSOP2 sarcopenia consensus (Cruz-Jentoft et al, Age Ageing 2019).
- Leong et al, PURE Study, grip strength and mortality (Lancet 2015).
- Leproult and Van Cauter, sleep restriction and testosterone (JAMA 2011).

## 14. What v0.5 changes from v0.4

1. Replaces seven co-equal drivers with three failure modes plus subdrivers.
2. Splits symptom math (score and mode classifier) from objective math (subdriver attribution). No shared symptom terms across the two layers.
3. Androgen is a Drive Failure subdriver with a concordance gate, not a top-level driver.
4. Modifiers reweight existing subdrivers; they do not introduce new driver categories.
5. Confidence now reflects both mode separation and subdriver separation.

## 15. Development gate

Required before claiming the model is calibrated, not just specified:

1. Lock thresholds for every n_* normalizer.
2. Lock provenance scoring for measurement_quality.
3. Implement validator for required input groups.
4. Implement score, mode classifier, subdriver, modifier, confidence, and cadence equations.
5. Build 20 archetype fixtures spanning each failure mode and modifier interaction.
6. Adjudicate fixture outputs with a clinician of record before claiming 80/20 calibration.
