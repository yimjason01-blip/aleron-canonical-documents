function array(value) {
  return Array.isArray(value) ? value : [];
}

const PATIENT_DATA_PRESENTATION_GROUPS = [
  { id: 'blood-pressure-sleep', label: 'Blood Pressure & Sleep', keys: ['blood_pressure', 'systolic_blood_pressure', 'diastolic_blood_pressure', 'resting_heart_rate', 'overnight_resting_heart_rate', 'overnight_spo2_nadir', 'sleep_duration', 'sleep_efficiency', 'hrv'] },
  { id: 'metabolic', label: 'Metabolic', keys: ['hba1c', 'a1c', 'fasting_glucose', 'fasting_insulin', 'homa_ir'] },
  { id: 'lipids-inflammation', label: 'Lipids & Inflammation', keys: ['total_cholesterol', 'ldl', 'ldl_c', 'hdl', 'hdl_c', 'triglycerides', 'apob', 'apo_b', 'lpa', 'lp_a', 'hscrp', 'hs_crp'] },
  { id: 'renal', label: 'Renal', keys: ['egfr', 'uacr', 'creatinine', 'cystatin_c'] },
  { id: 'body', label: 'Body', keys: ['height', 'height_cm', 'weight', 'weight_kg', 'bmi', 'body_fat', 'body_fat_percent', 'waist', 'waist_cm', 'waist_to_height_ratio'] },
  { id: 'fitness', label: 'Fitness', keys: ['vo2max', 'vo2_max', 'cardiorespiratory_fitness', 'activity', 'activity_level', 'steps', 'strength'] },
  { id: 'context', label: 'Context', keys: ['smoking', 'smoking_status', 'alcohol', 'alcohol_use', 'genetics', 'genetic_status', 'anti_obesity_rx', 'medications'] }
];

function presentationGroups(rows) {
  const byKey = new Map(PATIENT_DATA_PRESENTATION_GROUPS.flatMap((group) => group.keys.map((key) => [key, group.id])));
  const grouped = new Map(PATIENT_DATA_PRESENTATION_GROUPS.map((group) => [group.id, []]));
  const uncategorized = [];
  for (const row of rows) {
    const normalizedKey = String(row.key ?? '').trim().toLowerCase();
    const groupId = byKey.get(normalizedKey);
    if (groupId) grouped.get(groupId).push(row);
    else uncategorized.push(row);
  }
  return {
    groups: PATIENT_DATA_PRESENTATION_GROUPS.map(({ id, label }) => ({ id, label, measurements: grouped.get(id) })),
    uncategorized
  };
}

function overrideRecord(value) {
  const payload = value?.payload ?? value?.structured_override;
  if (!payload) return value ?? {};
  return {
    ...payload,
    override_id: payload.override_id ?? value.override_id ?? null,
    created_at: payload.created_at ?? value.created_at ?? null
  };
}

function overrideTargetId(value) {
  const override = overrideRecord(value);
  return override.target?.artifact_id ?? override.target?.id ?? override.target_id ?? override.item_id ?? null;
}

function latestOverrides(values) {
  const latest = new Map();
  for (const value of array(values)) {
    const override = overrideRecord(value);
    const targetId = overrideTargetId(override);
    if (targetId) latest.set(targetId, override);
  }
  return latest;
}

function applyOverride(action, override) {
  if (!override) return action;
  const patch = override.patch ?? override.details ?? {};
  const field = patch.field ?? override.field;
  const value = patch.value ?? override.value;
  const wording = override.action === 'modify' && field === 'action_phrase' && value ? value : null;
  const namedPatch = Object.fromEntries(Object.entries(patch).filter(([key]) => ['title', 'action_phrase', 'what_to_do', 'why_it_matters', 'status'].includes(key)));
  return {
    ...action,
    ...namedPatch,
    ...(wording ? { action_phrase: wording, what_to_do: wording } : {}),
    physician_decision: override.action,
    physician_reason_code: override.reason_code ?? patch.reason_code ?? null,
    physician_reason: typeof override.reason === 'string' ? override.reason : override.reason?.note ?? null,
    persisted_override_id: override.override_id ?? null
  };
}

export function releaseIdentifier(release) {
  return release?.release_id ?? null;
}

export function addressedRequiredItemIds(caseBundle) {
  const plan = caseBundle?.clinical_plan ?? {};
  const overrides = array(caseBundle?.structured_overrides).map(overrideRecord);
  const requiredIds = new Set(array(plan.required_items).map((item) => String(item.id ?? '')).filter(Boolean));
  const addressed = [];
  for (const override of latestOverrides(overrides).values()) {
    const targetId = String(overrideTargetId(override) ?? '');
    if (requiredIds.has(targetId) && ['approve', 'defer', 'reject', 'modify'].includes(override.action)) addressed.push(targetId);
  }
  return addressed;
}

export function buildReleasePreviewRequest(caseBundle) {
  const packet = caseBundle?.patient_packet ?? {};
  const run = caseBundle?.engine_run ?? {};
  const actionMap = caseBundle?.action_map_state ?? {};
  const plan = caseBundle?.clinical_plan ?? {};
  const payload = {
    packet_id: packet.packet_id,
    packet_hash: packet.packet_hash ?? run.patient_packet_hash ?? actionMap.patient_packet_hash,
    source_engine_run_id: run.run_id ?? plan.source_engine_run_id ?? actionMap.source_engine_run_id ?? actionMap.run_id,
    source_plan_id: plan.plan_id,
    source_action_map_state_id: actionMap.action_map_state_id ?? plan.source_action_map_state,
    addressed_required_item_ids: addressedRequiredItemIds(caseBundle)
  };
  const missing = Object.entries(payload).filter(([key, value]) => key !== 'addressed_required_item_ids' && !value).map(([key]) => key);
  if (missing.length) throw new Error(`Release preview requires current backend artifact guards: ${missing.join(', ')}.`);
  const messageRef = caseBundle?.persisted_physician_message_ref ?? caseBundle?.physician_message_ref ?? plan.persisted_physician_message_ref;
  if (messageRef) payload.physician_message_ref = messageRef;
  return payload;
}

export function displayValue(value, units, state) {
  const normalized = String(state ?? '').toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  if (normalized === 'pending') return 'Pending';
  if (normalized === 'not_measured') return 'Not measured';
  if (normalized === 'insufficient_input' || normalized === 'insufficient_inputs') return 'Insufficient input';
  if (value === null || value === undefined || value === '') return 'Missing';
  return units ? `${value} ${units}` : String(value);
}

function identity(caseBundle) {
  const packet = caseBundle?.patient_packet ?? {};
  const projection = caseBundle?.patient ?? {};
  const actionPatient = caseBundle?.action_map_state?.patient ?? {};
  return {
    id: packet.patient_id ?? projection.patient_id ?? caseBundle?.patient_id ?? null,
    name: packet.display_name ?? packet.name ?? projection.display_name ?? projection.name ?? actionPatient.display_name ?? 'Patient identity missing',
    code: packet.code ?? projection.code ?? actionPatient.code ?? 'Code missing',
    age: packet.age?.value ?? packet.age ?? actionPatient.age ?? null,
    sex: packet.sex ?? actionPatient.sex ?? null,
    phenotype: packet.phenotype ?? actionPatient.phenotype ?? null,
    snapshotDate: packet.snapshot_date ?? projection.updated_at ?? null
  };
}

function normalizeMeasurement(row, key, lane) {
  const value = row && typeof row === 'object' && !Array.isArray(row) ? row : { value: row };
  return {
    ...value,
    key: value.key ?? value.id ?? value.code ?? key,
    label: value.label ?? value.name ?? key,
    value: value.value,
    units: value.units ?? value.unit ?? null,
    provenance: value.provenance ?? value.source ?? null,
    lane
  };
}

function flattenMeasurementLanes(value) {
  if (Array.isArray(value)) return value.map((row, index) => normalizeMeasurement(row, row?.key ?? String(index), row?.lane ?? 'legacy'));
  if (!value || typeof value !== 'object') return [];
  const rows = [];
  const visit = (node, lane, path = []) => {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, lane, [...path, String(index)]));
      return;
    }
    if (!node || typeof node !== 'object') {
      rows.push(normalizeMeasurement(node, path.at(-1), lane));
      return;
    }
    const isMeasurement = 'value' in node || 'key' in node || 'id' in node || 'code' in node;
    if (isMeasurement) {
      rows.push(normalizeMeasurement(node, path.at(-1), lane));
      return;
    }
    for (const [key, child] of Object.entries(node)) visit(child, lane ?? key, [...path, key]);
  };
  for (const [lane, laneValue] of Object.entries(value)) visit(laneValue, lane, []);
  return rows;
}

function measurements(caseBundle) {
  const packet = caseBundle?.patient_packet ?? {};
  const direct = flattenMeasurementLanes(packet.measurements);
  const observations = array(caseBundle?.diagnostic_results).flatMap((result) => array(result?.observations).map((observation) => ({
    key: observation.code,
    label: observation.name ?? observation.code,
    value: observation.value,
    units: observation.unit,
    provenance: observation.provenance?.source ?? result.vendor,
    state: observation.state
  })));
  const directKeys = new Set(direct.map((row) => row.key ?? row.label));
  const seen = new Set();
  return [...direct, ...observations.filter((row) => !directKeys.has(row.key ?? row.label))].filter((row) => {
    const key = `${row.lane ?? 'diagnostic'}:${row.key ?? row.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function adaptPhysicianCase(caseBundle) {
  if (!caseBundle || typeof caseBundle !== 'object') throw new Error('Physician case bundle is missing.');
  if (caseBundle.schema_version !== 'physician_case.v1') {
    throw new Error(`Physician case must use physician_case.v1; received ${caseBundle.schema_version ?? 'missing schema_version'}.`);
  }
  const actionMap = caseBundle.action_map_state ?? {};
  const clinicalPlan = caseBundle.clinical_plan ?? {};
  const risk = array(actionMap.risk_outputs ?? actionMap.model_outputs?.risk_domains);
  const vitality = array(actionMap.vitality_outputs ?? actionMap.model_outputs?.vitality?.outcomes);
  const audit = array(caseBundle.audit_log);
  const overrides = array(caseBundle.structured_overrides).map(overrideRecord);
  const overridesByTarget = latestOverrides(overrides);
  const releasePreview = caseBundle.release_preview ?? caseBundle.release_package ?? null;
  const patientMeasurements = measurements(caseBundle);
  const groupedPatientMeasurements = presentationGroups(patientMeasurements);
  const addressedRequired = addressedRequiredItemIds(caseBundle);
  return {
    schemaVersion: 'physician_case.v1',
    sourceSchemaVersion: caseBundle.schema_version ?? null,
    patient: identity(caseBundle),
    patientData: {
      measurements: patientMeasurements,
      groups: groupedPatientMeasurements.groups,
      uncategorized: groupedPatientMeasurements.uncategorized,
      familyHistory: array(caseBundle.patient_packet?.family_history),
      symptoms: array(caseBundle.patient_packet?.symptoms),
      orders: array(caseBundle.diagnostic_orders ?? caseBundle.patient_packet?.orders),
      missing: array(caseBundle.patient_packet?.missing_data)
    },
    risk,
    vitality,
    actionMap: {
      items: array(actionMap.scored_items),
      required: array(actionMap.required_items),
      excluded: array(actionMap.excluded_items),
      warnings: array(actionMap.warnings)
    },
    carePlan: {
      id: clinicalPlan.plan_id ?? null,
      title: clinicalPlan.title ?? 'Care plan unavailable',
      state: clinicalPlan.state ?? clinicalPlan.release_state ?? clinicalPlan.clinical_note_draft?.signature_status ?? 'draft',
      overview: clinicalPlan.clinical_overview ?? clinicalPlan.summary ?? 'Clinical overview missing.',
      required: array(clinicalPlan.required_items).map((item) => applyOverride(item, overridesByTarget.get(item.id))),
      actions: array(clinicalPlan.recommended_next_steps).map((item) => applyOverride(item, overridesByTarget.get(item.id))),
      requiredDecisions: {
        total: array(clinicalPlan.required_items).length,
        decided: addressedRequired.length,
        addressedIds: addressedRequired
      },
      additions: overrides.filter((override) => ['add_problem', 'add_order'].includes(override.action)),
      overrides,
      deferred: array(clinicalPlan.deferred_not_selected),
      note: clinicalPlan.clinical_note_draft ?? null,
      checks: array(clinicalPlan.synthesis_checks)
    },
    journal: audit,
    ai: {
      readOnly: true,
      status: 'Case-grounded read-only evidence. New AI actions are unavailable for this release gate.',
      candidates: array(actionMap.ai_candidates ?? actionMap.ai_candidate_funnel)
    },
    workflow: {
      releasePackage: releasePreview,
      canvasHandoff: caseBundle.canvas_handoff ?? null,
      runAudit: caseBundle.run_audit ?? null,
      monitoringAlerts: array(caseBundle.monitoring_alerts)
    },
    raw: caseBundle
  };
}
