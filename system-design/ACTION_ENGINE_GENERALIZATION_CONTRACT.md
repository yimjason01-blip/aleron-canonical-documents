# Aleron Action Engine Generalization Contract

**Status:** target implementation contract and prototype graduation specification. The production canonical Action Engine runner is currently unavailable. This document defines the boundary to reach before the prototype can become an operational engine.

**Purpose:** remove patient-specific judgment from the dashboard and force the result to emerge from typed inputs, reusable libraries, deterministic scoring, scored AI-generated candidates, and a final reducer that only consumes the assembled action-map state.

---

## 1. The Readiness Bar

The engine is sufficiently generalized when a new synthetic patient can be run by adding only a patient packet. No code, prompt, or UI branch may reference that patient's id, name, or expected plan.

The output must be:

1. `action_map_state.json`
2. `clinical_plan.json`
3. `run_audit.json`

The dashboard is only a renderer for those artifacts. It may not contain clinical ranking logic, patient-specific priority tables, hidden recommendations, or scoring shortcuts.

---

## 2. Non-Negotiable Boundaries

### The engine owns

- Patient packet validation.
- Library item eligibility.
- Direct action scoring.
- Diagnostic reclassification scoring.
- Genetics routing.
- AI candidate admission.
- AI candidate scoring.
- Bundle and overlap resolution.
- Final recommendation reduction.
- Audit output.

### The dashboard owns

- Rendering the patient packet.
- Rendering the action map.
- Rendering the candidate pipeline.
- Rendering the final clinical plan.
- Rendering provenance and audit fields.

The dashboard must never decide what is clinically important.

---

## 3. Required Pipeline

```text
0. Freeze input versions
1. Validate patient_packet
2. Run deterministic risk and vitality models
3. Score action library
4. Score diagnostic library
5. Route genetics must-dos
6. Run AI discovery against patient_packet + library manifest
7. Ground AI candidates against cited patient fields
8. Deduplicate AI candidates against known scored space
9. Convert eligible AI candidates into typed candidate records
10. Score AI-generated candidates through the same scoring adapters
11. Resolve bundles, overlaps, gates, and contraindications
12. Assemble action_map_state
13. Run final reducer from action_map_state only
14. Emit clinical_plan and run_audit
```

The final reducer may not read raw patient prose, raw AI output, or hard-coded patient plans. It reads only typed state.

---

## 4. Core Schemas

### 4.1 Patient Packet

```json
{
  "schema_version": "patient_packet.v1",
  "patient_id": "synthetic-or-real-id",
  "snapshot_date": "YYYY-MM-DD",
  "demographics": {
    "age": 47,
    "sex_at_birth": "male",
    "height_cm": 178,
    "weight_kg": 93
  },
  "clinical_context": {
    "diagnoses": [],
    "medications": [],
    "contraindications": [],
    "family_history": [],
    "care_gaps": []
  },
  "measurements": {
    "labs": {},
    "vitals": {},
    "body_composition": {},
    "wearables": {},
    "fitness": {},
    "sleep": {}
  },
  "vitality": {
    "energy": null,
    "mood": null,
    "body_ease": null,
    "cognitive_clarity": null
  },
  "genetics": {
    "panel": null,
    "findings": []
  },
  "missing_data": [],
  "valid_keys": []
}
```

Rules:

- Every candidate must cite at least one `valid_keys` entry.
- Derived fields must be materialized with provenance, not recomputed differently by each layer.
- Patient packet fields are facts. They are not recommendations.

### 4.2 Action Library Item

```json
{
  "id": "tirzepatide_metabolic",
  "type": "action",
  "class": "drug",
  "domain": ["metabolic"],
  "eligibility": {
    "required_fields": [],
    "criteria": [],
    "contraindications": []
  },
  "effect": {
    "measure": "weight_loss_percent",
    "central": 0.21,
    "low": 0.14,
    "high": 0.26,
    "source_basis": []
  },
  "valuation": {
    "c1_prevention": {},
    "c2_capacity": {},
    "c3_resilience": {},
    "burden_qaly": {},
    "overlap_group": null
  },
  "evidence": {
    "grade": "moderate",
    "surrogate_flag": false,
    "basis": []
  }
}
```

### 4.3 Diagnostic Library Item

```json
{
  "id": "home_sleep_apnea_test",
  "type": "diagnostic",
  "clinical_question": "Does sleep-disordered breathing reclassify the plan?",
  "eligibility": {},
  "reclassification": {
    "probability": { "low": 0.2, "central": 0.35, "high": 0.55 },
    "qaly_if_reclassified": { "low": 0.2, "central": 0.45, "high": 1.0 },
    "dominant_path": "sleep diagnosis changes BP and recovery sequence",
    "downstream_decisions_changed": []
  },
  "burden": {
    "qaly": { "low": 0, "central": 0, "high": 0.01 },
    "cascade_risk": null
  },
  "evidence": {
    "grade": "moderate",
    "basis": []
  }
}
```

### 4.4 AI Candidate

```json
{
  "id": "ai_sleep_breathing_candidate",
  "source": "ai_discovery",
  "candidate_type": "diagnostic",
  "status": "structured_candidate",
  "pattern_signal": "sleep-disordered breathing signal",
  "cited_patient_keys": [],
  "clinical_question": "Would confirming sleep-disordered breathing change sequencing?",
  "proposed_item": {
    "name": "Home sleep apnea test",
    "library_match_id": "home_sleep_apnea_test",
    "new_library_item_required": false
  },
  "downstream_decisions_changed": [],
  "dedup": {
    "relation_to_known": "related_but_distinct",
    "known_item_id": null
  },
  "admission": {
    "grounded": true,
    "eligible_for_scoring": true,
    "human_review_required": false
  }
}
```

The AI candidate is not a recommendation. It is an item asking to be scored.

### 4.5 Scored Map Item

```json
{
  "id": "home_sleep_apnea_test",
  "source": "ai_scored_candidate",
  "origin_candidate_id": "ai_sleep_breathing_candidate",
  "type": "diagnostic",
  "label": "Home sleep apnea test",
  "applicability": "eligible",
  "evidence_grade": "moderate",
  "evidence_axis": {
    "score": 0.69,
    "level": "medium",
    "display_label": "Medium evidence",
    "basis_summary": "AASM-supported testing in high-pretest OSA phenotypes; value comes from symptom/BP sequencing while CV event prevention is excluded.",
    "component_scores": {
      "test_validity": 0.18,
      "reclassification_yield": 0.15,
      "downstream_action_value": 0.16,
      "population_match": 0.10,
      "management_threshold": 0.06,
      "burden_harms_known": 0.04
    },
    "caps_applied": [],
    "primary_trace_parameters": ["reclassification_probability", "qaly_if_reclassified", "test_burden", "evidence_grade"]
  },
  "patient_value": {
    "display_qaly": 0.45,
    "display_basis": "qaly_if_reclassified",
    "expected_voi_internal": 0.1575,
    "low": 0.2,
    "central": 0.45,
    "high": 1.0
  },
  "diagnostic": {
    "p_reclass": 0.35,
    "qaly_if_reclassified": 0.45
  },
  "gates": [],
  "overlap_group": null,
  "provenance": {
    "library_id": "home_sleep_apnea_test",
    "candidate_id": "ai_sleep_breathing_candidate",
    "patient_keys": []
  }
}
```

For direct actions, `patient_value.display_basis` is `net_qaly_if_achieved`.

### 4.6 Action Map State

```json
{
  "schema_version": "action_map_state.v1",
  "run_id": "uuid",
  "patient_packet_hash": "sha256",
  "library_versions": {},
  "risk_outputs": [],
  "vitality_outputs": [],
  "required_items": [],
  "scored_items": [],
  "ai_candidates": [],
  "excluded_items": [],
  "warnings": []
}
```

This is the only input the final reducer may consume.

### 4.7 Evidence Trace

Every value-bearing library item must carry an `evidence_trace` array. This is the antagonistic-audit layer: it separates the raw clinical source from the Aleron transformation into patient-value QALY or diagnostic VOI.

```json
{
  "parameter": "channels.c1_prevention",
  "supports": ["major_vascular_event_rrr", "mortality_curve_shift"],
  "basis_type": "RCT_meta_analysis",
  "citation": {
    "pmid": "21067804",
    "doi": "10.1016/S0140-6736(10)61350-5",
    "title": "Efficacy and safety of more intensive lowering of LDL cholesterol..."
  },
  "transformation": "Import relative effect; recompute patient-specific QALY through the Aleron survival curve and patient baseline risk.",
  "limitations": "Population-level effect; patient value depends on baseline risk, survival curve, and sustained therapy.",
  "review_status": "reviewed"
}
```

Allowed `basis_type` values include `RCT`, `RCT_meta_analysis`, `cohort`, `meta_analysis`, `Mendelian_randomization`, `guideline`, `model_output`, `internal_method`, `internal_model`, and `Aleron_judgment`. Aleron judgment is allowed only when explicitly labeled with rationale, limitations, and provisional review status. The validator fails missing traces on required parameters.

### 4.8 Evidence Axis

Every map-eligible item must also carry an item-level `evidence_axis`. This is the x-axis roll-up. It is separate from QALY/VOI value and receives the same audit treatment: the dashboard may show three clean groups, but the engine stores the continuous score, component scores, caps, and trace links.

```json
{
  "score": 0.62,
  "level": "medium",
  "display_label": "Medium evidence",
  "basis_summary": "Clinically supported, but the patient-value claim requires population or endpoint translation.",
  "component_scores": {
    "study_design": 0.20,
    "endpoint_directness": 0.10,
    "population_match": 0.09,
    "intervention_match": 0.10,
    "magnitude_precision": 0.03,
    "harm_characterization": 0.10
  },
  "caps_applied": ["model_translated_value_cap"],
  "primary_trace_parameters": ["channels.c1_prevention", "channels.c3_resilience", "burden_qaly"]
}
```

For direct actions, component scores are `study_design`, `endpoint_directness`, `population_match`, `intervention_match`, `magnitude_precision`, and `harm_characterization`. For diagnostics, component scores are `test_validity`, `reclassification_yield`, `downstream_action_value`, `population_match`, `management_threshold`, and `burden_harms_known`.

Display bins are `low` = 0.00-0.39, `medium` = 0.40-0.69, and `high` = 0.70-1.00. Caps can force a lower displayed group: broad-screening-insufficient and Aleron-judgment-primary cap at low; surrogate-only, population-mismatch, downstream-uncertain, needs-source-upgrade-primary, and model-translated-value cap at medium. The validator fails if a high evidence item depends on a primary trace marked `needs_source_upgrade`.

---

### 4.9 Clinical Plan

```json
{
  "schema_version": "clinical_plan.v1",
  "source_action_map_state": "run_id",
  "clinical_overview": "",
  "required_items": [],
  "recommended_next_steps": [],
  "deferred_not_selected": [],
  "synthesis_checks": []
}
```

---

## 5. Promotion State Machine

AI-generated items move through explicit states:

```text
raw_signal
-> grounded_signal
-> structured_candidate
-> scored_candidate
-> map_eligible
-> recommendation_eligible
-> selected | deferred | rejected | promoted_to_library
```

Allowed transitions:

- `raw_signal -> grounded_signal` only if cited keys exist in `patient_packet.valid_keys`.
- `grounded_signal -> structured_candidate` only if it names a candidate type and decision changed.
- `structured_candidate -> scored_candidate` only if the proper scoring adapter can score it.
- `scored_candidate -> map_eligible` only if it has value, evidence, burden, and provenance.
- `map_eligible -> recommendation_eligible` only if it is applicable, atomic, not blocked, and not a duplicate.
- `recommendation_eligible -> selected` only through the final reducer.

Blocked transitions:

- Raw AI text may not enter `scored_items`.
- Raw AI text may not enter `clinical_plan`.
- A candidate with missing scoring fields may not get a map coordinate.
- A candidate may not become a must-do unless it came from a deterministic required channel.

---

## 6. Scoring Rules

### 6.1 Direct Actions

Every action is scored as:

```text
net_patient_qaly = c1_prevention + c2_capacity + c3_resilience - burden_qaly
```

Rules:

- Evidence grade is not multiplied into QALY.
- Feasibility and adherence are not multiplied into intrinsic QALY.
- Cost and effort are represented as burden or selection context, not hidden discounts.
- C2 and C3 must be explicit zeroes when absent.
- Overlap groups prevent double counting.

### 6.2 Diagnostics

Every diagnostic is scored as:

```text
expected_voi_internal = p_reclass * qaly_if_reclassified - test_burden
```

Display value:

```text
patient_qaly_if_reclassified = qaly_if_reclassified
```

Rules:

- The map can show diagnostics on the same QALY space using `qaly_if_reclassified`, with `p_reclass` exposed beside it.
- Expected VOI remains in the audit, but it cannot be the only visible story.
- Low-probability, high-consequence diagnostics stay visible, but the reducer must explain if they are not selected.

### 6.3 Genetics

Genetics must route through:

- Required guidance if the finding is pathogenic or likely pathogenic and in a deterministic must-do rule.
- Structured candidate scoring if the finding is moderate-penetrance, context-sensitive, off-panel, or not in the must-do library.
- No action if VUS, benign, or likely benign unless a separate deterministic rule says otherwise.

### 6.4 Vitality

Vitality is not a separate recommendation engine. It contributes:

- Outcome measures.
- Driver relevance.
- Tie-break context for near-term felt progress.
- C2 capacity context when a scored action affects lived quality.

Vitality cannot override eligibility, evidence, or scoring.

---

## 7. Final Reducer Rules

The final reducer answers one question:

```text
After required items, what are the few actions most likely to change this patient's trajectory or felt progress now?
```

### 7.1 Hard Filters

Remove any item from final recommendation eligibility if:

- It is not in `action_map_state.scored_items`.
- It is a raw or unscored AI candidate.
- It is not applicable to the patient.
- It is blocked by contraindication.
- It is not atomic.
- It duplicates a higher-value item in the same overlap group.
- It is a diagnostic without `p_reclass` and `qaly_if_reclassified`.

### 7.2 Required Items

Required items are shown separately and are never ranked against opportunities.

Examples:

- Cancer screening care gap.
- Pathogenic genetics guidance.
- Documentation requirement.

### 7.3 Recommendation Count

Default:

- All required items.
- Two next steps beyond required items.
- Maximum three beyond required items unless the clinician explicitly expands the plan.

### 7.4 Selection Order

The reducer should not use hidden weights or patient-id tables. It uses this ordered logic:

1. Safety or compliance required items.
2. High-value, high-applicability direct actions with moderate or strong evidence.
3. Diagnostics with high chance of action-changing reclassification.
4. Diagnostics with lower probability but severe conditional consequence.
5. Actions that create near-term felt progress when risk-value is otherwise similar.
6. Sequencing dependencies, meaning an item that unlocks multiple later decisions may move earlier.

When two candidates compete, prefer the one with:

- Higher patient QALY.
- Better evidence grade.
- Lower burden.
- More immediate actionability.
- More downstream decisions changed.
- Stronger vitality relevance.

The reducer must emit why the strongest non-selected item was deferred.

### 7.5 Prohibited Reducer Behavior

- No patient-id branches.
- No hard-coded patient names.
- No final recommendation from raw AI text.
- No vague bundles such as "capacity rebuild."
- No hidden multiplication of QALY by evidence grade.
- No hiding `p_reclass` behind expected VOI.

---

## 8. Audit Output

Every run emits:

```json
{
  "schema_version": "run_audit.v1",
  "run_id": "uuid",
  "patient_packet_hash": "sha256",
  "library_versions": {},
  "pipeline_steps": [],
  "candidate_funnel": {
    "raw_ai_signals": 0,
    "grounded": 0,
    "structured": 0,
    "scored": 0,
    "map_eligible": 0,
    "recommendation_eligible": 0,
    "selected": 0
  },
  "blocked_items": [],
  "overlap_resolutions": [],
  "deferred_items": [],
  "synthesis_checks": []
}
```

Required synthesis checks:

- `source_is_action_map_state_only`
- `no_unscored_recommendations`
- `recommendation_count_ok`
- `required_items_separate`
- `diagnostics_show_p_reclass_and_qaly_if_reclassified`
- `no_patient_id_branch_used`
- `strongest_deferred_item_explained`

---

## 9. Independent Agent Test

### Inputs the agent may see

- `ACTION_ENGINE_GENERALIZATION_CONTRACT.md`
- `QALY_VALUATION_FRAMEWORK.md`
- `AI_CLINICAL_SYNTHESIS_FRAMEWORK.md`
- Frozen library JSON files.
- One patient packet.

### Inputs the agent may not see

- Dashboard output.
- Prior conversation conclusions.
- Patient-specific expected answer.
- Any code branch keyed to patient id.

### Required output

```text
1. scored action_map_state
2. AI candidate funnel
3. clinical_plan
4. run_audit
5. strongest deferred item and why
```

### Pass criteria

The run passes if:

- Every recommendation is traceable to a scored item.
- Every scored AI candidate has provenance and scoring fields.
- Diagnostics expose both `p_reclass` and `qaly_if_reclassified`.
- Required items are separate from recommendations.
- The plan contains no more than three non-required next steps.
- The result is clinically coherent without using the expected answer.

### Fail criteria

The run fails if:

- The agent recommends an unscored item.
- The agent uses a patient-specific shortcut.
- The agent hides diagnostic value inside expected VOI only.
- The agent emits more than three non-required recommendations by default.
- The agent cannot explain why the strongest non-selected candidate was deferred.

---

## 10. Immediate Implementation Targets

1. Move patient profiles out of dashboard literals into patient packet JSON.
2. Move current inline diagnostics and actions into library JSON.
3. Build a small command-line runner that emits `action_map_state.json`.
4. Replace dashboard clinical logic with rendering from `action_map_state.json` and `clinical_plan.json`.
5. Add a validation script that fails on patient-id branches, unscored recommendations, missing diagnostic fields, and missing audit checks.
6. Run Ethan and Mara through the command-line runner.
7. Add a third blind synthetic patient and run an independent-agent test.

This is the point where the prototype becomes a testable engine rather than an expressive dashboard.
