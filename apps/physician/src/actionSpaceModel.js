const DIAGNOSTIC_TOLERANCE_QALY = 0.000001;

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
  const candidates = [record?.reclassification_probability, record?.p_reclass];
  for (const candidate of candidates) {
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

export function diagnosticExpectedValue(record) {
  const probability = diagnosticProbability(record);
  const qalyIfReclassified = finiteValue(record?.qaly_if_reclassified);
  return probability !== null && qalyIfReclassified !== null
    ? probability * qalyIfReclassified
    : null;
}

export function evidenceCategory(record) {
  if (traceStatus(record) === 'asserted_legacy') return 'unverified';

  const evidence = record?.evidence_grade ?? ranking(record).evidence;
  return ['strong', 'moderate', 'see_library'].includes(evidence) ? evidence : 'missing';
}

function actionExpectedValue(record) {
  const direct = finiteValue(record?.patient_value_qaly);
  return direct ?? finiteValue(ranking(record).patient_value_qaly) ?? displayedPatientValue(record);
}

function valueConsistency(record) {
  if ((record?.kind ?? record?.type) !== 'diagnostic') return null;

  const emitted = finiteValue(ranking(record).patient_value_qaly);
  const probability = diagnosticProbability(record);
  const qalyIfReclassified = finiteValue(record?.qaly_if_reclassified);
  if (emitted === null || probability === null || qalyIfReclassified === null) return null;

  const recomputed = probability * qalyIfReclassified;
  const deltaQaly = Math.abs(emitted - recomputed);
  return {
    emittedQaly: emitted,
    recomputedQaly: recomputed,
    deltaQaly,
    toleranceQaly: DIAGNOSTIC_TOLERANCE_QALY,
    status: deltaQaly <= DIAGNOSTIC_TOLERANCE_QALY ? 'within_tolerance' : 'outside_tolerance',
  };
}

function stableId(record) {
  return [record?.candidate_id, record?.library_item_id, record?.id]
    .find((value) => typeof value === 'string' && value.trim()) ?? null;
}

function sourceItems(actionMap) {
  const items = Array.isArray(actionMap?.action_map_state?.scored_items)
    ? actionMap.action_map_state.scored_items
    : [];
  return items.filter((record) => record && typeof record === 'object' && !Array.isArray(record) && stableId(record));
}

function dispositionPriority(disposition) {
  return disposition === 'selected' ? 0 : 1;
}

export function normalizeActionSpace(actionMap) {
  return sourceItems(actionMap).map((record) => {
    const id = stableId(record);
    const kind = record.kind ?? record.type ?? null;
    const expectedValueQaly = kind === 'protocol_collection'
      ? null
      : kind === 'diagnostic'
        ? diagnosticExpectedValue(record)
        : actionExpectedValue(record);

    return {
      id,
      libraryItemId: record.library_item_id ?? null,
      label: record.label ?? null,
      kind,
      disposition: record.disposition ?? null,
      expectedValueQaly,
      plottable: record.disposition !== 'excluded'
        && (kind === 'action' || kind === 'diagnostic')
        && expectedValueQaly !== null,
      evidenceCategory: evidenceCategory(record),
      valueConsistency: valueConsistency(record),
      patientSignals: record.patient_signals_used ?? record.patientSignals ?? [],
      modelOutputRefs: record.model_output_refs ?? record.modelOutputRefs ?? [],
      evidenceBasis: record.evidence_basis ?? record.evidenceBasis ?? null,
      assumptions: record.assumptions ?? [],
      eligibility: record.eligibility ?? null,
      traceStatus: traceStatus(record),
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
    if (leftFinite && left.expectedValueQaly !== right.expectedValueQaly) {
      return right.expectedValueQaly - left.expectedValueQaly;
    }
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
