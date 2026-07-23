const CONFIDENCE_METHOD_ID = 'method.action_library_scoring.v1.1';
const DIRECT_CONFIDENCE_COMPONENTS = new Set([
  'study_design_consistency', 'endpoint_directness', 'population_match',
  'intervention_match', 'parameter_precision', 'harm_burden_completeness',
]);
const DIAGNOSTIC_CONFIDENCE_COMPONENTS = new Set([
  'test_validity', 'reclassification_yield',
  'downstream_action_value', 'population_transport',
  'management_threshold_clarity', 'test_harm_burden_completeness',
]);

function finiteValue(value) {
  const candidate = value && typeof value === 'object' ? value.value : value;
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}

function ranking(record) {
  return record?.ranking_dimensions && typeof record.ranking_dimensions === 'object'
    ? record.ranking_dimensions
    : {};
}

function diagnosticProbability(record) {
  for (const candidate of [record?.reclassification_probability, record?.p_reclass]) {
    const value = finiteValue(candidate);
    if (value !== null && value >= 0 && value <= 1) return value;
  }
  return null;
}

function displayedPatientValue(record) {
  return finiteValue(record?.patient_value?.display_qaly);
}

function traceStatus(record) {
  const direct = record?.trace_status;
  const ranked = ranking(record).trace_status;
  if (direct === 'asserted_legacy' || ranked === 'asserted_legacy') return 'asserted_legacy';
  return direct ?? ranked ?? null;
}

function normalizedConfidenceContract(record, kind) {
  const contract = record?.confidence_contract;
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return null;
  if (contract.method_id !== CONFIDENCE_METHOD_ID) return null;
  const required = kind === 'diagnostic' ? DIAGNOSTIC_CONFIDENCE_COMPONENTS : DIRECT_CONFIDENCE_COMPONENTS;
  const components = contract.components;
  if (!components || typeof components !== 'object' || Array.isArray(components)) return null;
  if (Object.keys(components).length !== required.size) return null;
  for (const name of required) {
    const component = components[name];
    if (!component || typeof component !== 'object' || component.state !== 'pass') return null;
    if (!Array.isArray(component.provenance_ids) || component.provenance_ids.length === 0) return null;
  }
  return { band: 'component_pass', contract, version: contract.method_id };
}

export function diagnosticExpectedValue(record) {
  return finiteValue(ranking(record).patient_value_qaly)
    ?? finiteValue(record?.expected_voi_internal);
}

const MAP_GATE_NAMES = [
  'library_promoted', 'patient_eligible', 'runner_computed', 'value_complete',
  'confidence_provenance_valid', 'burden_and_harms_complete', 'overlap_resolved', 'audit_complete',
];
const STRUCTURAL_GATE_NAMES = [
  'atomic', 'no_contraindication', 'not_duplicated', 'not_required_route', 'dependency_resolved',
];

function methodGatesPass(record, names) {
  const gates = record?.method_gates;
  return gates && typeof gates === 'object' && !Array.isArray(gates)
    && names.every((name) => gates[name] === 'pass')
    && ['AI-proposed', 'not AI-proposed'].includes(record?.candidate_origin);
}

function feasibilityAllowsSelection(record) {
  const feasibility = record?.feasibility;
  return feasibility && typeof feasibility === 'object' && !Array.isArray(feasibility)
    && ['available', 'constrained'].includes(feasibility.state)
    && Array.isArray(feasibility.provenance_ids) && feasibility.provenance_ids.length > 0
    && feasibility.provenance_ids.every((source) =>
      typeof source === 'string' && (source.startsWith('patient:') || source.startsWith('physician:'))
    );
}

export function evidenceCategory(record) {
  if (traceStatus(record) === 'asserted_legacy') return 'unverified';
  return normalizedConfidenceContract(record, record?.kind ?? record?.type)?.band ?? 'missing';
}

function actionExpectedValue(record) {
  const direct = finiteValue(record?.patient_value_qaly);
  return direct ?? finiteValue(ranking(record).patient_value_qaly) ?? displayedPatientValue(record);
}

function valueConsistency(record) {
  if ((record?.kind ?? record?.type) !== 'diagnostic') return null;
  const expectedVoi = diagnosticExpectedValue(record);
  return {
    probabilityOfMeaningfulReclassification: diagnosticProbability(record),
    conditionalQalyIfReclassified: finiteValue(record?.qaly_if_reclassified),
    expectedVoiQaly: expectedVoi,
    valueChannel: record?.value_channel ?? null,
    status: expectedVoi === null ? 'expected_voi_unavailable' : 'typed_components_present',
  };
}

function stableId(record) {
  return [record?.candidate_id, record?.library_item_id, record?.id]
    .find((value) => typeof value === 'string' && value.trim()) ?? null;
}

function sourceItems(actionMap) {
  const items = Array.isArray(actionMap?.action_map_state?.scored_items) ? actionMap.action_map_state.scored_items : [];
  return items.filter((record) => record && typeof record === 'object' && !Array.isArray(record) && stableId(record));
}

function dispositionPriority(disposition) {
  return disposition === 'selected' ? 0 : 1;
}

function nonPlottableReason(record, kind, expectedValueQaly, confidence) {
  if (record.disposition === 'excluded') return `Disposition is excluded: ${record.exclusion_reason ?? record.why_not_selected ?? 'eligibility failed'}`;
  if (kind !== 'action' && kind !== 'diagnostic') return `Unsupported map kind: ${kind ?? 'missing'}`;
  if (expectedValueQaly === null) return 'Expected patient value was not emitted as a finite number.';
  if (kind === 'diagnostic' && (
    finiteValue(record.reclassification_probability) === null
    || finiteValue(record.qaly_if_reclassified) === null
    || record.value_channel !== 'expected_voi'
  )) return 'Diagnostic value requires probability, conditional QALY, and value_channel=expected_voi.';
  if (!confidence) return `confidence_contract lacks governed rubric provenance for ${CONFIDENCE_METHOD_ID}; legacy evidence_axis is audit-visible only.`;
  if (!methodGatesPass(record, MAP_GATE_NAMES)) return 'The complete map-gate contract and candidate origin did not pass.';
  if (!methodGatesPass(record, STRUCTURAL_GATE_NAMES)) return 'The complete structural recommendation-gate contract did not pass.';
  if (!feasibilityAllowsSelection(record)) return 'Typed patient- or physician-sourced feasibility was unavailable.';
  if (record.promotion_eligible !== true) return 'Clinical promotion eligibility was not explicitly true.';
  if (record.library_status !== 'fully_derived_v2') return `Library status ${record.library_status ?? 'missing'} is not promotion-eligible.`;
  if (record.map_eligible !== true) return 'Engine map_eligible was not true.';
  if (!['runner_computed', 'runner_computed_optimized_policy_voi'].includes(traceStatus(record))) return `Trace status ${traceStatus(record) ?? 'missing'} is not a governed runner result.`;
  const gate = record.missing_input_gate;
  if (gate?.gated === true) return `Required inputs missing: ${(gate.missing_fields ?? []).join(', ') || 'unspecified'}.`;
  if (record.gate_status && record.gate_status !== 'ready_to_order_or_discuss') return `Workflow gate is ${record.gate_status}.`;
  return null;
}

export function normalizeActionSpace(actionMap) {
  return sourceItems(actionMap).map((record) => {
    const id = stableId(record);
    const kind = record.kind ?? record.type ?? null;
    const expectedValueQaly = kind === 'protocol_collection' ? null : kind === 'diagnostic' ? diagnosticExpectedValue(record) : actionExpectedValue(record);
    const confidence = normalizedConfidenceContract(record, kind);
    const reason = nonPlottableReason(record, kind, expectedValueQaly, confidence);
    return {
      id,
      libraryItemId: record.library_item_id ?? null,
      label: record.label ?? null,
      kind,
      disposition: record.disposition ?? null,
      expectedValueQaly,
      plottable: reason === null,
      nonPlottableReason: reason,
      evidenceCategory: traceStatus(record) === 'asserted_legacy' ? 'unverified' : confidence?.band ?? 'missing',
      evidenceAxis: record.evidence_axis ?? ranking(record).evidence_axis ?? null,
      ...(confidence ? { confidenceBand: confidence.band, confidenceContract: confidence.contract, confidenceContractVersion: confidence.version } : {}),
      valueConsistency: valueConsistency(record),
      patientSignals: record.patient_signals_used ?? record.patientSignals ?? [],
      modelOutputRefs: record.model_output_refs ?? record.modelOutputRefs ?? [],
      evidenceBasis: record.evidence_basis ?? record.evidenceBasis ?? null,
      evidenceTrace: record.evidence_trace ?? [],
      assumptions: record.assumptions ?? [],
      eligibility: record.eligibility ?? null,
      traceStatus: traceStatus(record),
      libraryStatus: record.library_status ?? null,
      promotionEligible: record.promotion_eligible === true,
      mapEligible: record.map_eligible === true,
      recommendationEligible: record.recommendation_eligible === true,
      valuationBands: record.valuation_bands ?? null,
      whySelected: record.why_selected ?? null,
      whyNotSelected: record.why_not_selected ?? null,
      category: record.category ?? record.class ?? record.intervention_type ?? null,
      domain: record.domain ?? null,
      diagnosticFactors: kind === 'diagnostic' ? {
        reclassificationProbability: record.reclassification_probability ?? record.p_reclass ?? null,
        qalyIfReclassified: record.qaly_if_reclassified ?? null,
      } : null,
      provenance: record.provenance ?? record.source ?? null,
      source: record.source ?? record.provenance?.source ?? record.provenance?.library_id ?? null,
      decisionLogic: record.decision_logic ?? record.gate ?? record.path ?? record.note ?? null,
    };
  }).sort((left, right) => {
    const dispositionOrder = dispositionPriority(left.disposition) - dispositionPriority(right.disposition);
    if (dispositionOrder !== 0) return dispositionOrder;
    const leftFinite = Number.isFinite(left.expectedValueQaly);
    const rightFinite = Number.isFinite(right.expectedValueQaly);
    if (leftFinite !== rightFinite) return leftFinite ? -1 : 1;
    if (leftFinite && left.expectedValueQaly !== right.expectedValueQaly) return right.expectedValueQaly - left.expectedValueQaly;
    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });
}

export function actionSpaceSummary(records) {
  const rows = Array.isArray(records) ? records : [];
  return {
    total: rows.length,
    selected: rows.filter((record) => record.disposition === 'selected').length,
    deferred: rows.filter((record) => record.disposition === 'deferred').length,
    excluded: rows.filter((record) => record.disposition === 'excluded').length,
    plottable: rows.filter((record) => record.plottable).length,
    nonPlottable: rows.filter((record) => !record.plottable).length,
  };
}
