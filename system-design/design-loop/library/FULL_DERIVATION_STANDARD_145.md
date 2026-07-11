# Full Derivation Standard for the 145-Action Library

Status: working standard for converting `action_library.json` into the V2 Audited Valuation Library.

## Meaning of fully derived

An action is fully derived only when both axes are derived and validator-enforced:

```text
Y-axis: patient value / effect derivation
X-axis: confidence / evidence derivation
```

A source citation alone is not full derivation. A QALY scalar alone is not full derivation. An evidence bucket alone is not full derivation.

## Required item shape

Each legacy action must become a V2 valuation record with:

- `id`
- `source_action_ids`
- `valuation_kind`
- `applies_when`
- `channels` with honest C1/C2/C3 zeros where absent
- `burden_qaly` with cadence (`one_time` or `per_year`)
- `derivation_inputs`
- `net_qaly_if_achieved`
- `uncertainty_basis`
- `overlap_rules`
- `evidence_trace`
- `evidence_axis`
- `trace_status`
- `runner_method`

## Effect/value derivation requirements

### Direct actions

Each action must derive:

```text
net_patient_qaly = C1 prevention + C2 capacity + C3 resilience - burden_qaly
```

Required parameter traces:

- `channels.c1_prevention` if nonzero
- `channels.c2_capacity` if nonzero
- `channels.c3_resilience` if nonzero
- `burden_qaly`
- effect-size parameter (`effect.hr`, `effect.rr`, `effect.rrr`, or `effect.arr`)
- baseline-risk or trigger condition that makes the action apply

### Exercise / physical activity actions

Exercise recommendations must use the clinical exercise-prescription grammar, not vague lifestyle prose. The required prescription object is FITT-VP:

```text
Frequency
Intensity
Time
Type
Volume
Progression
```

For exercise records, keep these concepts separate:

| Concept | Library role |
|---|---|
| Physical activity exposure | Baseline and achieved behavior dose, e.g. minutes/week, MET-h/week, steps/day |
| Exercise prescription | FITT-VP intervention plan used to change the exposure |
| VO2 max / cardiorespiratory fitness | Destination phenotype, mediator, or risk-state input, not the generic exercise action itself |

Do not write exercise map cards as `exercise more` or as a naked `improve VO2 max` action. A promotable exercise action needs a bounded FITT-VP prescription plus an explicit target phenotype or endpoint. VO2 max can be the destination and valuation mediator, but it remains a separate phenotype from the prescription standard.

### Diagnostics / screens

Each screen must derive:

```text
expected_voi = P_reclass × QALY_if_reclassified - test_burden
```

Required parameter traces:

- `reclassification_probability`
- `qaly_if_reclassified`
- `test_burden`
- `evidence_grade`
- downstream decisions changed

The map must display both `P_reclass` and `QALY_if_reclassified`; expected VOI remains in audit.

## Confidence/evidence derivation requirements

Direct actions use these component scores:

- `study_design`
- `endpoint_directness`
- `population_match`
- `intervention_match`
- `magnitude_precision`
- `harm_characterization`

Diagnostics use these component scores:

- `test_validity`
- `reclassification_yield`
- `downstream_action_value`
- `population_match`
- `management_threshold`
- `burden_harms_known`

Rules:

- component scores must sum to `evidence_axis.score`
- score maps to display level: low 0.00-0.39, medium 0.40-0.69, high 0.70-1.00
- caps can only lower confidence, never raise it
- `needs_source_upgrade` on a primary trace forbids high confidence
- surrogate-only endpoints cap at medium
- model-translated values and burden-calibration-pending values cap at medium until runner binding and burden calibration are complete
- broad-screening-insufficient caps at low
- Aleron judgment as primary trace caps at low

## Derivation families

The current 145-action inventory classifies into these families:

| Family | Count | Runner implication |
|---|---:|---|
| `direct_multichannel_lifestyle` | 20 | needs lifestyle family scorer with C1/C2/C3/burden and overlap bundle handling |
| `event_or_curve_shift_action` | 76 | initial shared scorer adapter exists; records still need baseline-risk/event-value binding before map eligibility |
| `direct_procedure_prevention_or_resilience` | 27 | needs procedure scorer with one-time burden, treatment threshold, and residual-event/resilience handling |
| `diagnostic_voi` | 19 | can use or extend `diagnostic_direct_voi` once P_reclass/QALY_if/test_burden are traced |
| `direct_action_generic` | 2 | needs manual classification before derivation |
| `surrogate_translated_value` | 1 | needs surrogate-to-patient-value transform and cap |

## Acceptance gates

An item is not fully derived until all gates pass:

1. `evidence_trace` covers every value-bearing parameter.
2. `derivation_inputs` contain the values the runner uses.
3. Runner emits the same value shown on the map.
4. `evidence_axis` is component-derived and cap-checked.
5. Validator fails if any required trace or axis field is missing.
6. Dashboard renders emitted state only.
7. `trace_status` is `runner_computed`, not `asserted_legacy` or `method_anchored_values_pending_runner`.

## Work order

1. Convert all current map-visible items first.
2. Convert high-confidence hard-outcome items with simple effect structure next.
3. Convert diagnostics/screens using the direct-VOI adapter.
4. Convert procedures with one-time burden and threshold logic.
5. Convert lifestyle bundles last if they overlap heavily, because bundle de-duplication is the hard part.

## Current generated worklist

Run:

```bash
python3 system-design/design-loop/library/build_derivation_backlog.py
```

Outputs:

- `DERIVATION_BACKLOG_145.json`
- `DERIVATION_BACKLOG_145.md`

Domain research packet consolidation:

- `DERIVATION_RESEARCH_PACKETS_145.md`

First working derivation batch:

```bash
python3 system-design/design-loop/library/build_derivation_batch_001.py
```

Output:

- `derivation_batches/batch_001_ckd_cvd_strong_hard_outcomes.json`
