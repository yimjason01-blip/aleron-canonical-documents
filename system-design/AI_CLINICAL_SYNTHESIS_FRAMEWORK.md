# Aleron AI Clinical Synthesis Framework

**Status:** governing methodology for how AI is allowed to participate in Aleron's clinical engine, action map, discovery layer, and physician-facing synthesis. Written 2026-06-30 after the Ethan Park action-map QA failure.

> One sentence: AI may find patterns and synthesize the final clinical frame, but it may not turn a pattern into a recommendation until that item has passed through the same structured action, diagnostic, genetics, evidence, and value gates as every other item on the map.

---

## 0. Why this exists

Aleron's core danger with AI is not that it cannot reason. The danger is that it reasons fluently in the wrong layer.

The Ethan Park review exposed the failure mode:

1. The model saw a plausible rhythm concern: overnight heart rate 38 with low VO2max and metabolic risk.
2. It surfaced a reasonable AI pattern signal: "nocturnal bradycardia needs rhythm check."
3. The clinical synthesis then treated that pattern as if it were a scored diagnostic recommendation.
4. But ECG/Holter was not in the structured diagnostic list, had no `P_reclass`, no `QALY_if_reclassified`, no expected value, no burden model, and no evidence grade.

That was not a clinical reasoning failure alone. It was a **layering failure**. The AI skipped the promotion step.

The same issue appeared with OGTT in the opposite direction. OGTT was visible and clinically defensible, but its reclassification odds were only 4%. The prose overweighted it because it sounded like a meaningful glucose gate, even though the structured diagnostic value did not support treating it as one of the main next steps.

This document exists to prevent those errors.

---

## 1. The governing principle

AI is a **pattern finder and final reducer**, not an independent action engine.

It has two legitimate jobs:

1. **Discovery:** find patient-specific patterns, contradictions, missing data, or reclassification opportunities that deterministic models may miss.
2. **Synthesis:** after all scoring is complete, reduce the full state into a small, clinically coherent next-step frame.

It does **not** get to:

- Diagnose.
- Recommend a treatment that is absent from the action library.
- Recommend a diagnostic that is absent from the diagnostic library.
- Assign audited QALY by narrative reasoning.
- Override the evidence axis.
- Convert a hypothesis into a must-do.
- Fill visual or prose space with plausible but unscored items.

If AI finds something important that is not in the library, the output is not "recommend it." The output is a structured candidate that must be scored before it can affect the map or final plan:

```
candidate_library_gap:
  proposed_item:
  item_type:
  why_it_matters:
  required_structured_fields:
  proposed_initial_calibration:
  evidence_to_review:
  human_review_status: pending
```

Only after that item is structured, reviewed, and scored can it enter the shared action space. Once scored, it should appear on the same map as library therapies, lifestyle changes, diagnostics, and procedures. The map is where the physician sees whether AI found a meaningful gap between the existing tiles or just produced a plausible but low-value idea.

---

## 2. What we learned

### Lesson 1: The final synthesis must be last

The clinical summary is only a synthesis if it is generated after:

1. Patient data is frozen.
2. Deterministic risk and vitality models run.
3. The action library is scored.
4. Diagnostics are decomposed into `P_reclass` and `QALY_if_reclassified`.
5. Genetics must-dos are routed.
6. AI pattern candidates are generated and deduped.
7. Eligible AI candidates are structured and scored.
8. The action map is assembled with library items plus scored AI candidates.

If the summary is prewritten per patient, it is not synthesis. It is copy.

### Lesson 2: AI can smuggle unscored ideas into guidance

The rhythm example showed the problem. The signal was clinically reasonable, but it was not a structured diagnostic. AI moved it from "pattern to resolve" into "one of the final recommendations" without the diagnostic admission test.

Rule: **No final recommendation without a structured record.**

### Lesson 3: AI overweights narrative salience

OGTT sounded important because hidden post-load diabetes is a meaningful clinical idea. But for this patient, the model's current reclassification odds were 4%. A low-probability diagnostic can remain visible, but it should not dominate the next-step frame unless the conditional harm is severe enough to justify a safety exception.

Rule: **The prose must respect the numbers.**

### Lesson 4: Vague bundles hide weak thinking

"Capacity rebuild" sounded directionally right but was not an action. It hid multiple separate things: GLP-1/GIP therapy, resistance training, nutrition, aerobic work, sleep treatment, and BP tracking. The physician needs a small number of specific orders or plans.

Rule: **Every recommended item must be atomic.**

Good:

- Home sleep apnea test.
- Start GLP-1/GIP metabolic therapy.
- Start supervised resistance training.

Bad:

- Capacity rebuild.
- Lifestyle optimization.
- Cardiometabolic reset.

### Lesson 5: AI should expose missing machinery, not compensate for it

If ECG/Holter matters, the fix is not to let AI mention it loosely. The fix is to add a rhythm-safety diagnostic entry with:

- `reclassification_probability`
- `qaly_if_reclassified`
- `expected_voi`
- `dominant_reclassification_path`
- `downstream_decisions_changed`
- `test_burden`
- `false_positive_or_cascade_risk`
- `evidence_grade`

AI should turn missing machinery into a scored candidate or a backlog item, not a stealth recommendation. If the candidate can be calibrated now, it enters the same scored action map with explicit AI provenance. If it cannot be calibrated, it stays in review and does not affect synthesis.

### Lesson 6: AI-generated candidates belong on the same map after scoring

The value of AI discovery is not only the written summary. Its harder job is to find the grouting between the tiles: patient-specific ideas that the current action library, diagnostic library, genetics library, or risk models did not surface cleanly.

Those candidates must not live in a separate visual universe. After scoring, they need to occupy the same axes as every other option:

- Same patient-QALY scale.
- Same evidence scale.
- Same burden and gate logic.
- Same diagnostic decomposition into `P_reclass` and `QALY_if_reclassified`.
- Same eligibility and contradiction checks.

The distinction is provenance, not geometry. A scored AI-generated candidate may have a dashed outline, source label, or filter state, but it should still take its real position on the map. Otherwise the physician cannot see whether AI genuinely expanded the option space.

### Lesson 7: Clinical realism can beat a naive top-QALY reading

For Ethan, the cleaner clinical plan is not a pile of diagnostic gates. It is:

1. Home sleep apnea test.
2. Start GLP-1/GIP metabolic therapy.
3. Start supervised resistance training.

That plan is clinically coherent because GLP-1/GIP therapy directly addresses the metabolic root, weight loss can improve relative VO2max, resistance training protects lean mass and function, and sleep apnea treatment may unblock BP, fatigue, recovery, and training response.

The AI's job is to find that coherence after scoring, not to mechanically list every plausible unresolved signal.

---

## 3. The layer model

Every item must stay in its lane.

| Layer | Owner | Job | What it may emit | What it may not emit |
|---|---|---|---|---|
| Risk models | Deterministic model | Estimate baseline risk by domain | Risk, drivers, sensitivity | Treatment claims |
| Vitality model | Deterministic plus intake | Track how the patient feels and likely drivers | Outcome trends, gates, drivers | Disease-risk ranking |
| Action library | Structured library | Score known interventions | Scored actions with QALY, evidence, burden, gates | AI-only hypotheses |
| Diagnostic library | Structured library | Score information value | `P_reclass`, `QALY_if_reclassified`, expected VOI | Unscored tests |
| Genetics library | Structured library | Route pathogenic findings | Required guidance, conditionally triggered actions | Optional wellness suggestions |
| AI discovery | LLM with deterministic gates | Find crack-space hypotheses | Pattern signal plus proposed candidate | Diagnosis, audited QALY, final recommendation |
| AI candidate scoring | Shared scoring machinery | Convert eligible AI ideas into scored actions or diagnostics | Scored candidate with provenance | Unreviewed narrative ideas |
| Action map | Renderer plus reducer | Put library items and scored AI candidates in one view | Provenance-marked map state | Hidden source mixing |
| AI clinical synthesis | Final reducer | Pick the clinician-facing frame | A small next-step plan | New items not present in map state |

---

## 4. Required sequence

The production pipeline must run in this order:

```text
0. Freeze patient packet
1. Run risk models and vitality model
2. Score action library
3. Score diagnostic library
4. Route genetics must-dos
5. Run AI discovery against known-library manifest
6. Dedup AI candidates against existing findings and actions
7. Convert eligible AI findings into structured candidate actions or diagnostics
8. Score AI-generated candidates with the same machinery as library items
9. Assemble final action-map state with library items plus scored AI candidates
10. Generate AI clinical synthesis from final action-map state
11. Run synthesis QA
```

The synthesis may not run at step 5. It may not run from `patient.synthesis`. It may not run from a hand-authored paragraph. It runs only from the assembled state.

---

## 5. Admission tests

### 5.1 Admission to AI Pattern Signals

An AI candidate may enter the AI pattern section if all are true:

- It cites patient-specific data fields.
- It names a plausible pattern, not a diagnosis.
- It identifies one confirmatory action or test.
- It explains what downstream action class could change.
- It is not a true duplicate of an existing finding.
- It carries low, central, and high provisional value.
- It is marked as provisional and visually distinct.

It may not enter if:

- The cited data are not present.
- It only restates an existing library item.
- It cannot name a confirmation step.
- It produces a recommendation without a confirmation step.
- It relies on generic medical intuition without patient data.

### 5.2 Admission to Diagnostic Library

A diagnostic candidate may enter the diagnostic library only if it has:

```yaml
id:
name:
clinical_question:
reclassification_probability:
qaly_if_reclassified:
expected_voi:
dominant_reclassification_path:
downstream_decisions_changed:
test_burden:
false_positive_or_cascade_risk:
evidence_grade:
patient_applicability:
contraindications_or_limitations:
source_basis:
review_status:
```

AI may propose these fields, but a human or calibrated engine must review them before the diagnostic can be treated as scored.

### 5.3 Admission to Action Library

An action candidate may enter the action library only if it has:

```yaml
id:
name:
action_class:
domain:
eligibility:
effect_size:
effect_source:
c1_prevention:
c2_capacity:
c3_resilience:
burden_qaly:
net_qaly:
evidence_grade:
surrogate_flag:
bundle_or_dedup_group:
contraindications:
monitoring_requirements:
review_status:
```

AI may not invent a net QALY without this structure.

### 5.4 Admission to Final Recommendations

An item can be one of the clinician's final recommendations only if:

1. It is in the action library, diagnostic library, or genetics required channel.
2. Or it began as an AI-generated candidate and has been structured, scored, and placed on the action map.
3. It is applicable to this patient.
4. It is not blocked by a higher-priority safety issue.
5. It is not a vague bundle.
6. It survives contradiction checks against the action map.
7. It can be stated as one specific thing to do.

The final recommendation count should default to:

- **Must-do channel:** all compliance or required items, separate from ranking.
- **Beyond must-dos:** usually 2, maximum 3 without explicit clinician request.

---

## 6. Recommendation grammar

Final recommendations must be atomic.

Allowed forms:

```text
Complete [specific diagnostic].
Start [specific therapy or protocol].
Refer to [specific specialty or service] for [specific reason].
Stop [specific harmful exposure].
Repeat [specific measurement] at [specific interval].
```

Disallowed forms:

```text
Optimize metabolic health.
Rebuild capacity.
Address sleep, nutrition, activity, and BP.
Manage all cardiometabolic risks.
```

Guardrails may be attached to an action, but they do not become hidden extra recommendations.

Example:

```text
Start GLP-1/GIP metabolic therapy, with resistance-training and protein guardrails to protect lean mass.
```

This is one recommendation if the main action is medication initiation and the guardrail is part of safe use. It becomes three recommendations if the surface separately asks the patient to start medication, start resistance training, and follow a nutrition plan.

---

## 7. Clinical synthesis rules

### 7.1 The synthesis must answer one question

For this patient, after must-dos, what are the few things most likely to change the clinical trajectory or near-term felt progress?

It should not summarize everything interesting. It should reduce.

### 7.2 The synthesis must preserve object type

Do not mix:

- Must-do obligations.
- Therapeutic actions.
- Lifestyle protocols.
- Diagnostics.
- AI hypotheses.
- Patient-facing explanation.

If a genetics finding is already in the must-do channel, do not repeat it as an AI pattern. If an AI signal is only provisional, do not write it like a treatment.

### 7.3 The synthesis must use the patient-value lens

The synthesis follows the QALY framework:

- No payer discounting.
- Evidence stays separate from magnitude.
- Diagnostics show reclassification odds and value if reclassified.
- Expected value cannot hide rare high-consequence findings.
- Rare high-consequence findings cannot dominate if they are not action-changing for this patient.

### 7.4 The synthesis must respect clinical sequence

Some actions can run in parallel. Some should wait. AI must name the sequence.

For Ethan:

- HSAT can run while therapy starts.
- GLP-1/GIP can start without waiting for OGTT.
- Resistance training should start with GLP-1/GIP to protect lean mass.
- High-intensity cardiometabolic conditioning can come later after weight, sleep, and recovery improve.
- ECG/Holter is not a top recommendation unless the rhythm pathway is structured and the intake raises its pretest probability.

### 7.5 The synthesis must name why excluded items are not top recommendations

If an item was salient but not selected, the synthesis should be able to explain why.

Examples:

- OGTT is clinically defensible but low priority here because reclassification odds are 4%.
- ECG/Holter is a plausible rhythm-safety pathway but is not yet a structured diagnostic and has low central expected value in an asymptomatic patient.
- Liver staging is useful if MASLD suspicion remains after labs, but it is not faster than HSAT plus metabolic therapy for near-term patient progress.

---

## 8. The AI self-QA checklist

Before any AI clinical synthesis is displayed, run this checklist:

### Source and sequence

- [ ] Was the synthesis generated after final action-map assembly?
- [ ] Did it read scored actions, diagnostics, genetics, vitality, and AI pattern signals?
- [ ] Are all final recommendations present in a structured library, required channel, or scored AI-generated candidate record?
- [ ] Are AI-generated candidates either scored on the map or still labeled provisional?

### Recommendation discipline

- [ ] Are there no more than 2 to 3 recommendations beyond must-dos?
- [ ] Is each recommendation atomic?
- [ ] Are vague bundles removed?
- [ ] Are guardrails clearly subordinate to the action they guard?
- [ ] Are must-dos separated from ranked opportunities?

### Diagnostic discipline

- [ ] Does every diagnostic recommendation show `P_reclass`?
- [ ] Does every diagnostic recommendation show `QALY_if_reclassified`?
- [ ] Is expected VOI not the only story?
- [ ] Are low-probability diagnostics demoted unless safety justifies escalation?
- [ ] Are unscored diagnostics blocked from the final recommendation surface?

### Clinical coherence

- [ ] Does the plan make sense to a practicing clinician?
- [ ] Does it address the dominant patient phenotype?
- [ ] Does it prioritize the fastest meaningful patient progress when clinically safe?
- [ ] Does it avoid sending the patient into a workup maze?
- [ ] Does it explain why the recommended few beat the plausible many?

### Provenance

- [ ] Does each item show whether it came from the action library, diagnostic library, genetics library, risk model, vitality model, or AI discovery?
- [ ] Are scored AI-discovered items on the same map with provenance, rather than in a separate value scale?
- [ ] Is every claim traceable to patient data or a source?

If any answer is "no," the synthesis is blocked.

---

## 9. Example: Ethan Park corrected flow

### What AI saw

- Low VO2max.
- Central adiposity.
- Insulin resistance and prediabetes.
- Stage-2 BP.
- Overnight SpO2 nadir 89%.
- Overnight resting heart rate 38.
- Low energy and cognitive clarity.
- ATM heterozygous P/LP finding.

### What went wrong

AI treated "rhythm check" as a final recommendation even though it was only an AI pattern signal. It also let OGTT stay too prominent in prose despite low reclassification odds.

### Correct handling

Must-do channel:

- ATM genetic guidance.
- ATM family-history gate.
- Colorectal screening.

Beyond must-dos:

1. Home sleep apnea test.
2. Start GLP-1/GIP metabolic therapy.
3. Start supervised resistance training.

Why these three:

- HSAT has meaningful reclassification odds and can change BP, fatigue, recovery, and training execution.
- GLP-1/GIP directly targets central adiposity, insulin resistance, prediabetes, BP exposure, and likely MASLD risk.
- Resistance training protects lean mass and function during weight loss and sets up later cardiometabolic conditioning.

What stays secondary:

- OGTT: defensible, but low reclassification odds in the current model.
- ECG/Holter: plausible safety pathway, but must first be structured as a diagnostic with `P_reclass`, `QALY_if_reclassified`, burden, and evidence.
- Liver staging: valuable third-line or parallel metabolic workup if labs support concern, but not the fastest patient-progress move.

---

## 10. Prompt contract for the AI layer

Every AI synthesis prompt must include this contract:

```text
You are not allowed to add recommendations.

You may only synthesize from:
1. structured required items,
2. scored action-library items,
3. scored diagnostic-library items,
4. structured genetics outputs,
5. vitality model outputs,
6. scored AI-generated candidates,
7. provisional AI pattern signals.

If you think a missing item should be recommended, output it as a structured candidate for scoring, not as a recommendation. After it is scored and placed on the action map, it can compete with the rest of the action space.

Return:
- one clinical overview paragraph,
- the must-do items separately,
- no more than 2 to 3 recommendations beyond must-dos,
- one sentence explaining why the strongest excluded candidate was not selected.

Each recommendation must be atomic and must include its source object id.
```

---

## 11. Production acceptance criteria

An AI synthesis feature is not production-ready until:

1. The action map exposes a typed final state object.
2. The synthesis reads only that typed final state object.
3. The synthesis cannot access raw unscored candidate text except through typed provisional AI signals.
4. AI-generated candidates are either scored into the same action space or remain unplotted review items.
5. The renderer shows provenance for every item.
6. The recommendation limit is enforced by schema, not by prompt hope.
7. Unstructured recommendations fail validation.
8. Library-gap candidates are routed to scoring or review, not displayed as orders.
9. Every diagnostic on the final surface has `P_reclass` and `QALY_if_reclassified`.
10. A test fixture catches the ECG failure mode: an AI signal cannot become a recommendation unless a matching diagnostic candidate has been scored.
11. A test fixture catches the OGTT failure mode: a low-reclassification diagnostic cannot be promoted above higher-value gates without a safety override.

---

## 12. Relationship to existing documents

- `ACTION_ENGINE_GENERALIZATION_CONTRACT.md` governs the operational schemas, state machine, reducer rules, audit outputs, and independent-agent test.
- `QALY_VALUATION_FRAMEWORK.md` governs value calculation.
- `design-loop/discovery-prototype/DISCOVERY_LAYER_HANDOFF.md` governs crack-space discovery.
- This document governs how AI outputs are allowed to become physician-facing synthesis and recommendations.

The shortest version:

```text
QALY framework: how value is calculated.
Discovery layer: how AI finds what the models miss.
Action engine contract: how candidates become scored state and final plans.
AI synthesis framework: how AI is prevented from turning hypotheses into unscored recommendations.
```

---

## 13. External guardrails

These sources support the direction of the framework:

- FDA Clinical Decision Support Software guidance: CDS must provide enough basis for a health care professional to independently review recommendations and not rely primarily on the software for an individual diagnosis or treatment decision. Source: https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software
- ONC HTI-1 final rule: predictive algorithms in certified health IT need baseline transparency so clinical users can assess fairness, appropriateness, validity, effectiveness, and safety. Source: https://healthit.gov/regulations/hti-rules/hti-1-final-rule/
- NIST AI Risk Management Framework: AI systems should be designed, evaluated, and used with explicit risk management and trustworthiness considerations. Source: https://www.nist.gov/itl/ai-risk-management-framework

These sources do not define Aleron's patient-value method. They define the minimum posture: transparency, independent clinician review, provenance, validation, and risk management. Aleron adds the patient-value QALY lens and the strict promotion gates above.
