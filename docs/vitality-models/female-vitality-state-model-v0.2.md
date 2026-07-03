# Meridian Female Vitality State Model v0.2

## IN BRIEF

The Female Vitality State Model estimates a female patient's current lived vitality and identifies which of the six load-bearing drivers of female vitality is most responsible for the current state. Vitality is the lived experience of energy, recovery, sleep quality, mood and anxiety, cognitive clarity, pain burden, libido and sexual function, and physical capability. Six domains drive 80% of how a woman feels day to day: sleep, hormonal and life-stage state, body composition and metabolic state, mood and agency, iron status, and strength and physical capability. All six are required inputs. Without them, the model cannot honestly produce a female vitality state and instead returns insufficient input with a list of what is missing.

## 1. Purpose

**In brief.** The Female Vitality Model answers what is dragging on a female patient's lived state and what Meridian should try to move next. It does this by collecting a structured baseline across the six 80/20 drivers of female vitality plus the patient's reported lived state, then attributing which driver loop best explains the current state. The output is consumed by the Action Layer alongside Risk State and Conditioning State. The score is secondary; the driver attribution, life-stage interpretation, missing-input logic, and cadence are the clinical payload.

The model answers four questions:

1. What is the patient's current vitality state?
2. Which of the six female vitality drivers is most likely responsible, given life-stage context?
3. What missing data would most improve confidence and routing?
4. What should Meridian try to move over the next 30 to 180 days?

## 2. Defined Terms

- **Vitality State** - modeled lived energy, recovery, sleep quality, mood, cognitive clarity, pain burden, libido and sexual function, and physical capability.
- **80/20 Driver** - one of the six load-bearing domains that drive most of how a woman feels: sleep, hormonal/life-stage state, body composition/metabolic, mood/agency, iron status, strength/capability.
- **Life-Stage Context** - reproductive stage that changes interpretation of every other driver: cycling, pregnant, postpartum, perimenopausal, menopausal, surgical menopause, on contraception, on menopausal hormone therapy.
- **Driver Loop** - a coupled pattern of multiple drivers that reinforce each other (for example, perimenopause to VMS-driven sleep fragmentation to mood volatility to less training to weight gain).
- **Domain Burden** - patient-reported severity in one symptom domain, scored 0 to 4 in v0.2.
- **Driver Phenotype** - a likely explanatory pattern for low vitality, attributable to one or more 80/20 drivers and life-stage context.
- **Required Input** - an input without which the model does not produce a vitality state.
- **High-Value Input** - an input that improves confidence or driver attribution but does not block the model.
- **Confidence** - low, medium, or high confidence in the model output based on input quality and signal agreement.
- **Cadence** - the recommended interval for reassessment of the top vitality driver.

## 3. Required Inputs vs High-Value Inputs

**In brief.** The Female Vitality Model has a single run mode. It requires baseline data across all six 80/20 drivers plus core symptoms, life-stage context, and medication/hormone/substance exposure. If any required domain is missing, the model returns insufficient input rather than a low-confidence vitality estimate. This is intentional. A female vitality model that does not measure sleep, hormonal/life-stage state, body composition, mood, iron, and physical capability is not a female vitality model. Hormone labs (FSH, estradiol) are not required for the model to run; perimenopause and menopause pattern recognition is symptom and history driven.

### 3.1 Required for the model to run

If any required group is missing, return `insufficient_input` and list the missing group.

| Required group | Minimum fields | Why required |
|---|---|---|
| Applicability | age, sex assigned at birth, current gender/hormone context | Determines whether the female model applies. |
| Life-stage context | one of: cycling, pregnant, postpartum, perimenopausal, menopausal, surgical menopause, on contraception, on menopausal hormone therapy, unknown | Required because life stage changes the causal interpretation of every other driver. |
| Core lived state | self-reported severity 0 to 4 across energy/fatigue, sleep quality, mood/anxiety, cognitive clarity, libido/sexual function, pain/discomfort, exercise tolerance/recovery, hormone/life-stage burden | Vitality is a lived state. The model must start from how the patient feels, not from biomarkers. |
| Sleep state | sleep duration, sleep quality, awakenings/fragmentation, night sweats, snoring/OSA risk, nocturia, insomnia symptoms | Sleep is a top driver of female vitality and is often hormone, pain, mood, or OSA mediated. |
| Hormonal and life-stage state | menstrual regularity (if cycling), bleeding burden, vasomotor symptoms, night sweats, PMS/PMDD pattern, pelvic pain, vaginal/urinary/sexual pain symptoms, MHT/HRT status, contraception status, postpartum context if applicable | Female-specific load-bearing driver that a generic vitality model misses. |
| Body composition and metabolic state | height, weight, waist circumference (or BMI as fallback), A1c, lipids or ApoB, BP | Metabolic state drives sleep apnea risk, vasomotor severity, mood, energy, and recovery in midlife women. |
| Mood and agency state | PHQ-2 or PHQ-9, GAD-2 or GAD-7, AUDIT-C, agency/withdrawal screen, postpartum mood screen if applicable, PMDD/luteal-phase pattern if cycling | Captures depression, anxiety, postpartum mood, PMDD, perimenopausal mood volatility. |
| Iron status | CBC, ferritin (and iron studies if ferritin low or anemia present) | Iron deficiency is one of the most common reversible drivers of female fatigue, exercise intolerance, brain fog, and restless legs. Heavy menstrual bleeding, postpartum, and adolescent/perimenopausal contexts make this a load-bearing baseline. |
| Strength and physical capability state | grip strength or validated functional proxy, lean mass proxy (DEXA if available, otherwise anthropometric/activity-derived estimate), training history, current functional limitations and injuries | Sarcopenia and frailty are codified constructs. Felt physical capability separates "feel old" from "feel capable" independently of cardiometabolic markers. |
| Medication, hormone, and substance screen | current medications, contraception, MHT/HRT, antidepressants, sedatives, GLP-1s, thyroid medications, alcohol, cannabis, nicotine | Common reversible or interpretive drivers across all six 80/20 domains. |

### 3.2 Required symptom scale

Use a simple 0 to 4 severity scale for v0.2:

| Score | Meaning |
|---|---|
| 0 | no issue |
| 1 | mild |
| 2 | moderate |
| 3 | significant |
| 4 | severe |

Required core lived-state domains:

```json
{
  "energy_fatigue": 0,
  "sleep_quality": 0,
  "mood_anxiety": 0,
  "cognitive_clarity": 0,
  "libido_sexual_function": 0,
  "pain_discomfort": 0,
  "exercise_tolerance_recovery": 0,
  "hormone_life_stage_burden": 0
}
```

### 3.3 High-value but not required

| High-value group | Examples | What it improves |
|---|---|---|
| Additional labs | CMP, TSH (and free T4 if abnormal), hs-CRP, B12, vitamin D | Separates behavioral burden from thyroid, inflammatory, and deficiency contributors. |
| Reproductive hormone labs | FSH, estradiol, prolactin, androgens (PCOS context), pregnancy test where relevant | Helps specific clinical questions; symptoms and life stage remain primary. |
| Validated instruments | STOP-BANG, Epworth, PROMIS Fatigue, PROMIS Sleep Disturbance, Menopause Rating Scale, Greene Climacteric Scale, Brief Pain Inventory, FSFI, Perceived Stress Scale, SARC-F | Improves repeatability, phenotype confidence, and longitudinal tracking. |
| Wearables | sleep duration/regularity, RHR, HRV trend, training load, steps, nighttime SpO2, cycle tracking | Adds longitudinal recovery, sleep, and cycle-symptom timing. |
| Body composition and fitness | DEXA fat/lean mass, visceral fat estimate, CPET VO2max, strength benchmarks | Improves metabolic, conditioning, pain, and recovery attribution beyond required minimum. |
| Cycle and reproductive detail | cycle length, variability, bleeding days, heavy bleeding pattern, luteal-phase symptom timing, perimenopause symptom timeline | Improves cycling and perimenopause attribution. |
| Diagnostic studies | home sleep apnea test, polysomnography, pelvic imaging when indicated | Confirms specific drivers when screening positive. |

### 3.4 80/20 high-value extension lab set

When the model is run with the required minimum, the highest-yield additional labs are:

```text
CMP
TSH (with free T4 if abnormal)
B12 if fatigue or brain fog pattern
vitamin D if pain, fatigue, or low mood pattern
hs-CRP
FSH and estradiol only when clinically useful (cycle still present + perimenopause question, or post-hysterectomy menopause-stage question)
prolactin if galactorrhea or unexplained amenorrhea
androgens if PCOS or hirsutism context
HSAT or polysomnography when sleep/OSA driver is positive
```

## 4. Model Output Contract

**In brief.** The Female Vitality Model returns the same shared Vitality output contract as the male model, so the Action Layer can consume either model consistently. The contract includes a score and band, but the top driver loop, life-stage flags, missing inputs, confidence, and cadence are the operational outputs.

```json
{
  "state_type": "vitality",
  "model": "female_vitality_v0.2",
  "status": "complete | insufficient_input",
  "score": 0,
  "band": "low | strained | stable | high",
  "life_stage": "cycling | pregnant | postpartum | perimenopausal | menopausal | surgical_menopause | unknown",
  "primary_driver_loop": "menopause_sleep_mood | bleeding_iron_fatigue | stress_mood_substance | pain_pelvic_deconditioning | medical_contributor | medication_hormone_induced",
  "primary_drivers": [],
  "secondary_drivers": [],
  "sex_specific_flags": [],
  "medical_contributors_to_check": [],
  "modifiable_levers": [],
  "missing_required_inputs": [],
  "missing_high_value_inputs": [],
  "confidence": "low | medium | high",
  "recommended_cadence_days": 30,
  "cadence_reason": ""
}
```

### Bands

| Score | Band |
|---|---|
| 0 to 24 | low |
| 25 to 49 | strained |
| 50 to 74 | stable |
| 75 to 100 | high |

## 5. The Six 80/20 Drivers

**In brief.** Six domains drive most of how a woman feels day to day. Each is independently anchored to clinical guidelines and validated measures. The model collects all six at baseline because they are coupled and life-stage modulated. Iron status earns its own domain because of cyclical and postpartum blood loss and because iron deficiency is one of the most common, most missed, and most reversible drivers of female fatigue.

### 5.1 Sleep

**Anchor:** AASM Clinical Practice Guidelines for OSA. Wisconsin Sleep Cohort, Sleep Heart Health Study, Cappuccio meta-analyses. Joffe et al on perimenopausal sleep disruption and VMS. Postpartum sleep fragmentation literature.

**Why dominant:** Sleep is upstream of energy, mood, libido, cognition, pain tolerance, recovery, appetite, BP, and metabolic health. Female sleep disruption has additional drivers (VMS, postpartum fragmentation, PMS sleep disruption) layered on top of OSA, insomnia, pain, and substance effects.

### 5.2 Hormonal and life-stage state

**Anchor:** STRAW+10 staging system for reproductive aging (Harlow et al, Climacteric 2012). NAMS (Menopause Society) position statements on hormone therapy. SWAN (Study of Women's Health Across the Nation). ACOG Committee Opinion on perimenopause and menopause. Menopause Rating Scale and Greene Climacteric Scale.

**Why dominant:** Reproductive life stage changes the causal interpretation of nearly every symptom a woman reports. The same symptom cluster (fatigue, brain fog, sleep disruption, mood volatility, low libido) means different things in a cycling 32-year-old, postpartum 36-year-old, perimenopausal 48-year-old, and postmenopausal 58-year-old. Perimenopause and menopause pattern recognition is symptom and history driven, not lab-first.

### 5.3 Body composition and metabolic state

**Anchor:** AHA PREVENT 2024. SWAN metabolic findings on midlife transition. NHANES distributions. Endocrine Society and NAMS guidance on metabolic health across the menopause transition.

**Why dominant:** Visceral adiposity drives OSA risk, VMS severity, inflammatory tone, and degrades energy, mood, and recovery. Midlife metabolic transition is a load-bearing driver of how a woman feels.

### 5.4 Mood and agency

**Anchor:** PHQ-9 (Kroenke et al), GAD-7 (Spitzer et al), AUDIT-C, Edinburgh Postnatal Depression Scale (Cox et al), DSM-5 PMDD criteria, SWAN findings on mood across menopause transition.

**Why dominant:** Depression, anxiety, PMDD, postpartum mood disorders, and perimenopausal mood volatility are major drivers of female vitality. Mood is both a primary driver and a critical confound for attributing energy, libido, or cognitive symptoms to other domains.

### 5.5 Iron status

**Anchor:** WHO criteria for iron deficiency and iron deficiency anemia. ACOG guidance on iron in pregnancy and postpartum. Camaschella, Iron deficiency, NEJM 2015. Camaschella, Iron-deficiency anemia, NEJM 2015. Heavy menstrual bleeding and iron literature (Mansour, Munro, others). Pasricha et al, restless legs and iron.

**Why dominant:** Iron deficiency without anemia is extremely common in menstruating women, postpartum women, athletes, and perimenopausal women with heavy bleeding. It causes fatigue, exercise intolerance, brain fog, restless legs, irritability, and hair loss, and is reliably reversible. Female vitality cannot be honestly assessed without ferritin and CBC.

### 5.6 Strength and physical capability

**Anchor:** EWGSOP2 sarcopenia consensus. Foundation for the NIH Sarcopenia Project. Leong et al PURE study (Lancet 2015) on grip strength and mortality. Studenski et al JAMA 2011. Fried Frailty Phenotype. SARC-F.

**Why dominant:** Grip strength is a robust mortality predictor across sexes. Sarcopenia and frailty are codified constructs. Felt physical capability is independent of cardiometabolic markers and is load-bearing for "feel old vs feel capable."

## 6. Driver Loops

**In brief.** Female vitality drivers are not independent and are life-stage modulated. The model classifies the dominant loop the patient is currently in. Six canonical loops cover most female vitality presentations.

### 6.1 Menopause / sleep / mood loop

```text
perimenopause or menopause transition
  -> VMS / night sweats / sleep fragmentation
  -> mood volatility + brain fog + low libido
  -> less training + worse metabolic state
  -> deeper VMS + worse sleep
```

Flag when life stage is perimenopausal/menopausal/surgical menopause and VMS, sleep fragmentation, mood volatility, or GSM symptoms cluster.

### 6.2 Bleeding / iron / fatigue loop

```text
heavy menstrual bleeding or postpartum context
  -> iron depletion (low ferritin)
  -> fatigue + exercise intolerance + brain fog + restless legs
  -> less training + worse mood + lower capacity
```

Flag when ferritin is low or unmeasured and bleeding burden, postpartum context, or restless-legs/fatigue/exercise-intolerance cluster.

### 6.3 Stress / mood / substance loop

```text
stress / caregiving load / burnout
  -> alcohol + poor sleep + less training
  -> low energy + low libido + worse mood
  -> less agency
  -> more stress
```

Flag when PHQ/GAD elevation, AUDIT-C concerning, and reduced drive cluster.

### 6.4 Pain / pelvic / deconditioning loop

```text
chronic pain, pelvic pain, dyspareunia, or migraine
  -> sleep disruption + reduced activity
  -> weight gain + low mood + low libido
  -> lower sense of capability
```

Flag when chronic pain, pelvic/sexual pain, training disruption, and reduced strength/capability cluster.

### 6.5 Medical contributor loop

Flag when symptoms are present and medical-contributor screens (TSH, B12, etc.) are missing or abnormal, or when life stage suggests workup (postpartum thyroiditis, perimenopausal thyroid drift).

### 6.6 Medication and hormone induced loop

Flag when medication, contraception, MHT/HRT, or substance exposure is plausibly explaining symptom pattern.

## 7. Scoring v0.2

**In brief.** v0.2 scoring is intentionally transparent and symptom-first. Start at 100 and subtract weighted domain burden from the eight core lived-state domains. This is not a calibrated psychometric score. Calibration can later replace the weights with validated instruments and cohort-derived anchors.

| Domain | Max penalty |
|---|---:|
| sleep quality (lived) | 17 |
| energy/fatigue | 15 |
| mood/anxiety | 14 |
| pain/discomfort | 13 |
| hormone/life-stage burden | 13 |
| cognitive clarity | 10 |
| libido/sexual function | 9 |
| exercise tolerance/recovery | 9 |

Formula:

```text
penalty_i = max_penalty_i * (domain_burden_i / 4)
vitality_score = 100 - sum(penalty_i)
```

Score is a scaffold. Driver loop attribution is the product.

## 8. Confidence Logic

**In brief.** Confidence reflects whether the model has enough data to trust driver attribution. Because all six 80/20 drivers are required, baseline confidence cannot be lower than medium when the model runs successfully. High confidence requires validated instruments, wearable/cycle data, and high-value extension labs.

| Confidence | Criteria |
|---|---|
| medium (default when model runs) | All required inputs complete, including all six 80/20 drivers and medication/hormone/substance screen. |
| high | All required inputs complete, plus validated instruments (PHQ/GAD, MRS or Greene Climacteric, PROMIS Sleep, FSFI), wearable sleep/recovery data, cycle tracking detail when relevant, extended labs where indicated, and DEXA or grip benchmark. |
| low | Reserved for cases where required inputs were collected but with known quality limitations (self-reported labs more than 18 months old, ferritin without iron studies despite low value, etc.). |

## 9. Missing Input Logic

**In brief.** Missing required inputs block the model and trigger insufficient_input. Missing high-value inputs lower confidence and become data-gathering priorities. The model never produces a vitality score from a partial 80/20 baseline.

Example insufficient input:

```json
{
  "status": "insufficient_input",
  "missing_required_inputs": [
    "iron_status",
    "strength_capability_state",
    "life_stage_context"
  ]
}
```

Example complete:

```json
{
  "status": "complete",
  "score": 48,
  "band": "strained",
  "life_stage": "perimenopausal",
  "primary_driver_loop": "menopause_sleep_mood",
  "missing_high_value_inputs": ["MRS", "DEXA", "STOP-BANG"],
  "confidence": "medium"
}
```

## 10. Action Layer Interface

**In brief.** Actions declare which 80/20 driver, life stage, and driver loop they target. The Action Layer should not treat all lifestyle or hormone-adjacent interventions as interchangeable. The driver loop and life stage determine which action class is plausible and which metric to track.

Example candidate:

```json
{
  "candidate": "evaluate VMS-driven sleep disruption with menopause specialist",
  "targets": ["vitality"],
  "vitality_driver": "hormonal_life_stage",
  "driver_loop": "menopause_sleep_mood",
  "expected_vitality_delta": "medium",
  "time_horizon": "30-90 days",
  "tracking_metric": "night sweats, awakenings, sleep quality, daytime energy, MRS"
}
```

| Driver loop | Action class |
|---|---|
| Menopause / sleep / mood | menopause evaluation, MHT eligibility discussion, GSM evaluation, VMS management, sleep/mood support |
| Bleeding / iron / fatigue | CBC and ferritin, iron studies, heavy bleeding evaluation, iron repletion, gynecology referral if indicated |
| Stress / mood / substance | PHQ/GAD, therapy, medication review, alcohol/cannabis plan, sleep restoration |
| Pain / pelvic / deconditioning | MSK and pelvic pain evaluation, PT/pelvic floor PT, migraine plan, training plan |
| Medical contributor | targeted labs (TSH, B12, etc.) or clinician evaluation |
| Medication / hormone induced | medication review, contraception/MHT side-effect review, taper plans |

## 11. Cadence Logic

**In brief.** Cadence follows the dominant driver loop and expected time-to-signal. Sleep, medication, mood, VMS, heavy bleeding/iron workup, and active diagnostic workups merit 30 days. Training, metabolic, body composition, and hormone-treatment adjustments need 90 days. Stable vitality moves to 180-day monitoring unless a new driver appears.

| Cadence | Use when |
|---|---|
| 30 days | sleep intervention, VMS-driven sleep disruption, mood/stress intervention, heavy bleeding/iron workup, medication/hormone change, active pain flare, OSA workup |
| 90 days | training block, metabolic intervention, weight/body composition strategy, MHT/HRT or contraception adjustment if initiated, pain/rehab plan, iron repletion follow-up |
| 180 days | stable/high vitality, maintenance phase, lower-burden monitoring |

## 12. What This Model Does Not Do

**In brief.** The Female Vitality Model is a state and driver model, not a diagnostic engine. It does not diagnose menopause, PMDD, endometriosis, depression, OSA, thyroid disease, sarcopenia, or iron deficiency by itself. It does not reduce female vitality to hormones or menopause. It does not infer lived state from labs without symptoms.

The model does not:

- diagnose perimenopause or menopause from symptoms or single-draw labs alone
- treat menopause as the central female vitality axis for all patients
- replace OSA, endocrine, depression, gynecologic, pelvic-pain, or geriatric workup
- infer vitality from labs without patient-reported symptoms
- assume low vitality is lifestyle failure
- collapse risk reduction and vitality improvement into one score
- decide MHT/HRT eligibility by itself
- replace the Conditioning State Model

## 13. Locked Decisions and Open Questions

### Locked

1. Female Vitality is a state model, not a behavior score.
2. The six 80/20 drivers (sleep, hormonal/life-stage, body composition/metabolic, mood/agency, iron status, strength/capability) are all required inputs.
3. The model has one run mode. If any required domain is missing, output is insufficient_input.
4. Reproductive life-stage context is required.
5. Sleep and OSA risk screening are required.
6. Iron status (CBC plus ferritin) is required.
7. Strength/capability is required.
8. Hormone labs (FSH, estradiol) are not required for the model to run; perimenopause and menopause pattern recognition is symptom and history driven.
9. The model outputs driver loops, not isolated symptoms.
10. The Action Layer consumes the shared Vitality output contract.

### Open

1. Which validated instruments become mandatory in Meridian intake versus optional?
2. Whether to score via direct burden penalties or validated scale normalization.
3. Whether wearable sleep and cycle data should override or only contextualize patient-reported sleep and cycle pattern.
4. How to calibrate the 0 to 100 score against external cohorts.
5. How to combine Vitality with Risk and Conditioning in Action Layer prioritization.
6. Whether pregnancy and active postpartum require their own submodel rather than inclusion in the general Female Vitality Model.
7. Strength baseline standardization: grip alone, grip + lean mass, or grip + functional movement screen.

## 14. References and Anchor Literature

**Sleep:**
- AASM Clinical Practice Guidelines for OSA
- Wisconsin Sleep Cohort, Sleep Heart Health Study
- Cappuccio et al meta-analyses on sleep duration and mortality
- Joffe H et al, perimenopausal sleep disruption and VMS
- Chung et al, STOP-BANG screen
- Johns MW, Epworth Sleepiness Scale

**Hormonal and life-stage:**
- Harlow SD et al, STRAW+10 reproductive aging staging, Climacteric 2012
- NAMS (The Menopause Society) position statements on hormone therapy
- SWAN (Study of Women's Health Across the Nation) findings
- ACOG Committee Opinions on perimenopause and menopause
- Heinemann LA, Menopause Rating Scale
- Greene JG, Climacteric Scale

**Body composition and metabolic:**
- AHA PREVENT 2024 risk equations
- SWAN metabolic findings on midlife transition
- NHANES population distributions
- NAMS and Endocrine Society guidance on midlife metabolic health

**Mood and agency:**
- Kroenke K et al, PHQ-9
- Spitzer RL et al, GAD-7
- Bush K et al, AUDIT-C
- Cox JL et al, Edinburgh Postnatal Depression Scale
- DSM-5 PMDD diagnostic criteria
- SWAN findings on mood across the menopause transition

**Iron status:**
- WHO criteria for iron deficiency and iron-deficiency anemia
- Camaschella C, Iron deficiency, NEJM 2015
- Camaschella C, Iron-deficiency anemia, NEJM 2015
- ACOG guidance on iron in pregnancy and postpartum
- Munro MG et al, heavy menstrual bleeding and iron
- Pasricha SR et al, iron deficiency and restless legs

**Strength and capability:**
- Cruz-Jentoft AJ et al, EWGSOP2 sarcopenia consensus, Age Ageing 2019
- Foundation for the NIH Sarcopenia Project diagnostic cutpoints
- Leong DP et al, grip strength and mortality, PURE Study, Lancet 2015
- Studenski S et al, gait speed and survival, JAMA 2011
- Fried LP et al, frailty phenotype, J Gerontol 2001
- Malmstrom TK, Morley JE, SARC-F

## 15. Implementation Summary

**In brief.** A complete Female Vitality Model run requires baseline data across all six 80/20 drivers plus core symptoms, life-stage context, and medication/hormone/substance context. Without this baseline, the model returns insufficient_input. With this baseline, it returns a vitality score, band, life-stage flag, dominant driver loop, missing high-value inputs, confidence, and cadence.

Required:

```text
age, sex/hormone context
life-stage context (cycling, pregnant, postpartum, perimenopausal, menopausal, surgical menopause, contraception, MHT/HRT, unknown)
core lived-state symptom ratings (8 domains)
sleep state (duration, quality, fragmentation, OSA screen, night sweats)
hormonal and life-stage state (cycle, bleeding burden, VMS, PMS/PMDD, pelvic pain, GSM, MHT/HRT)
body composition and metabolic state (waist, A1c, lipids/ApoB, BP)
mood and agency state (PHQ-2/9, GAD-2/7, AUDIT-C, postpartum/PMDD as relevant)
iron status (CBC, ferritin; iron studies if low)
strength and capability state (grip, lean mass proxy, training history, functional limits)
medication, hormone, and substance screen
```

High-value extensions:

```text
CMP, TSH, B12, vitamin D, hs-CRP
FSH and estradiol when clinically useful
prolactin, androgens where context supports
PROMIS Fatigue, PROMIS Sleep, MRS or Greene Climacteric, FSFI, Brief Pain Inventory, SARC-F, STOP-BANG
wearable sleep / RHR / HRV / cycle tracking
DEXA fat/lean mass, CPET VO2max
HSAT or polysomnography when sleep driver is positive
pelvic imaging when pain pattern indicates
```

Core output:

```text
vitality score
band
life-stage flag
primary driver loop
top driver phenotypes
missing high-value inputs
confidence
cadence
```
