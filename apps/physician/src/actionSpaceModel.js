const DIAGNOSTIC_TOLERANCE_QALY = 0.000001;
const CONFIDENCE_RUBRIC_VERSION = 'CONFIDENCE_RUBRIC_v1';
const CONFIDENCE_COMPONENTS = [
  'trial_design', 'effect_transferability', 'outcome_fidelity', 'consistency', 'harm_completeness',
];

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

function normalizedEvidenceAxis(record) {
  const axis = record?.evidence_axis ?? ranking(record).evidence_axis;
  if (!axis || typeof axis !== 'object' || Array.isArray(axis)) return null;
  if (axis.rubric_version !== CONFIDENCE_RUBRIC_VERSION) return null;
  const score = axis.overall_confidence;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) return null;
  if (CONFIDENCE_COMPONENTS.some((key) => {
    const value = axis[key];
    return typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1;
  })) return null;
  const band = score >= 0.85 ? 'high' : score >= 0.65 ? 'moderate' : score >= 0.45 ? 'low' : 'very_low';
  const label = band === 'very_low' ? 'Very low' : `${band[0].toUpperCase()}${band.slice(1)}`;
  if (axis.confidence_label !== `${label} confidence (heuristic)`) return null;
  return { score, band, axis, version: axis.rubric_version };
}

export function diagnosticExpectedValue(record) {
  const emitted = finiteValue(ranking(record).patient_value_qaly)
    ?? finiteValue(record?.expected_voi_internal)
    ?? finiteValue(record?.expected_value_qaly);
  if (emitted !== null) return emitted;
  const probability = diagnosticProbability(record);
  const qalyIfReclassified = finiteValue(record?.qaly_if_reclassified);
  return probability !== null && qalyIfReclassified !== null ? probability * qalyIfReclassified : null;
}

export function evidenceCategory(record) {
  if (traceStatus(record) === 'asserted_legacy') return 'unverified';
  return normalizedEvidenceAxis(record)?.band ?? 'missing';
}

function actionExpectedValue(record) {
  const direct = finiteValue(record?.patient_value_qaly);
  return direct ?? finiteValue(ranking(record).patient_value_qaly) ?? displayedPatientValue(record);
}

function valueConsistency(record) {
  if ((record?.kind ?? record?.type) !== 'diagnostic') return null;
  const emitted = finiteValue(ranking(record).patient_value_qaly)
    ?? finiteValue(record?.expected_voi_internal)
    ?? finiteValue(record?.expected_value_qaly);
  const probability = diagnosticProbability(record);
  const qalyIfReclassified = finiteValue(record?.qaly_if_reclassified);
  if (emitted === null || probability === null || qalyIfReclassified === null) return null;
  const recomputed = probability * qalyIfReclassified;
  const deltaQaly = Math.abs(emitted - recomputed);
  return {
    emittedQaly: emitted, recomputedQaly: recomputed, deltaQaly,
    toleranceQaly: DIAGNOSTIC_TOLERANCE_QALY,
    status: deltaQaly <= DIAGNOSTIC_TOLERANCE_QALY ? 'within_tolerance' : 'outside_tolerance',
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
  if (!confidence) return 'evidence_axis.rubric_version must equal CONFIDENCE_RUBRIC_v1; current axis is audit-visible but not plottable.';
  if (record.promotion_eligible !== true) return 'Clinical promotion eligibility was not explicitly true.';
  if (record.library_status !== 'fully_derived_v2') return `Library status ${record.library_status ?? 'missing'} is not promotion-eligible.`;
  if (record.map_eligible !== true) return 'Engine map_eligible was not true.';
  if (traceStatus(record) !== 'runner_computed') return `Trace status ${traceStatus(record) ?? 'missing'} is not runner_computed.`;
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
    const confidence = normalizedEvidenceAxis(record);
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
      ...(confidence ? { confidenceScore: confidence.score, confidenceBand: confidence.band, evidenceAxis: confidence.axis, evidenceAxisVersion: confidence.version } : {}),
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
