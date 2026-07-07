import { assertFixtureBundle, loadFixtureBundle } from './fixtureLoader.js';

let fixtureCache;
let backendCache;

function backendBaseURL() {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  return url.searchParams.get('apiBase') || window.localStorage?.getItem('ALERON_API_BASE') || null;
}

async function getJSON(baseURL, path) {
  const url = new URL(path, baseURL.endsWith('/') ? baseURL : `${baseURL}/`);
  const response = await fetch(url, {
    headers: {
      'x-actor-role': 'physician',
      'x-actor-id': 'physician:local-reviewer',
      'x-request-id': `physician-app-${Date.now()}`
    }
  });
  if (!response.ok) {
    throw new Error(`Backend request failed for ${path}: ${response.status}`);
  }
  return response.json();
}

async function postJSON(baseURL, path, payload = {}) {
  const url = new URL(path, baseURL.endsWith('/') ? baseURL : `${baseURL}/`);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-role': 'physician',
      'x-actor-id': 'physician:local-reviewer',
      'x-request-id': `physician-app-${Date.now()}`
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = body.detail ?? body.error ?? body.message ?? `HTTP ${response.status}`;
    const error = new Error(`Backend request failed for ${path}: ${response.status} ${reason}`);
    error.status = response.status;
    error.backend = body;
    error.path = path;
    throw error;
  }
  return body;
}

function buildQueueFromPatients(patients) {
  return patients.map((patient) => ({
    patient_id: patient.patient_id,
    display_name: patient.name ?? patient.patient_id,
    lifecycle_state: patient.lifecycle_state,
    release_state: patient.release_state,
    blocker: patient.release_state === 'released_to_patient'
      ? 'Plan released to patient.'
      : 'Awaiting backend artifacts or physician release gate.'
  }));
}

async function loadBackendBundle(baseURL) {
  if (backendCache?.baseURL === baseURL) return backendCache.bundle;

  const patientsResponse = await getJSON(baseURL, 'patients');
  const queue = buildQueueFromPatients(patientsResponse.patients ?? []);
  const activeTask = queue.find((task) => ['engine_run_complete', 'physician_review_pending', 'monitoring_update_requires_review'].includes(task.lifecycle_state)) ?? queue[0];
  if (!activeTask) throw new Error('Backend returned no patients for the physician app queue.');

  const patient = await getJSON(baseURL, `patients/${activeTask.patient_id}`);
  const snapshot = await getJSON(baseURL, 'fixtures/backend-snapshot');
  const clinicalPlanEntries = Object.entries(snapshot.artifacts ?? {})
    .filter(([, value]) => value?.schema_version === 'clinical_plan.v1');
  const clinicalPlanEntry = clinicalPlanEntries
    .find(([, value]) => value?.patient_id === activeTask.patient_id)
    ?? (clinicalPlanEntries.length === 1 ? clinicalPlanEntries[0] : null);
  const runId = clinicalPlanEntry?.[1]?.source_engine_run_id;
  if (!runId) throw new Error('Backend patient has no completed engine run artifacts for the physician app.');

  const [actionMapState, clinicalPlan, runAudit, auditLog, canvasHandoff, ordersResponse, monitoringResponse, messageThreadsResponse] = await Promise.all([
    getJSON(baseURL, `engine/runs/${runId}/action-map-state`),
    getJSON(baseURL, `engine/runs/${runId}/clinical-plan`),
    getJSON(baseURL, `engine/runs/${runId}/audit`),
    getJSON(baseURL, `audit/events?patient_id=${encodeURIComponent(activeTask.patient_id)}`),
    getJSON(baseURL, `canvas/${activeTask.patient_id}/handoff`),
    getJSON(baseURL, `orders/${activeTask.patient_id}`),
    getJSON(baseURL, `monitoring/${activeTask.patient_id}/alerts`),
    getJSON(baseURL, `patients/${activeTask.patient_id}/message-threads`).catch(() => ({ message_threads: [], seam_unavailable: true }))
  ]);
  const diagnosticOrders = ordersResponse.orders ?? [];
  const diagnosticResults = diagnosticOrders.flatMap((order) => (order.result_refs ?? [])
    .map((ref) => snapshot.artifacts?.[ref])
    .filter(Boolean));

  const bundle = {
    source: 'backend',
    queue,
    case: {
      patient_packet: {
        schema_version: 'patient_packet.backend_projection.v1',
        patient_id: patient.patient_id,
        display_name: patient.name,
        snapshot_date: patient.updated_at?.slice(0, 10),
        facts: { lifecycle_state: patient.lifecycle_state, release_state: patient.release_state },
        provenance: { source: 'backend:/patients/{patient_id}' }
      },
      action_map_state: actionMapState,
      clinical_plan: clinicalPlan,
      run_audit: runAudit,
      release_package: null,
      canvas_handoff: canvasHandoff,
      diagnostic_orders: diagnosticOrders,
      diagnostic_results: diagnosticResults,
      monitoring_alerts: monitoringResponse.monitoring_alerts ?? [],
      message_threads: messageThreadsResponse.message_threads ?? [],
      message_seam_unavailable: messageThreadsResponse.seam_unavailable === true,
      audit_log: auditLog.events ?? []
    }
  };
  assertFixtureBundle(bundle);
  backendCache = { baseURL, bundle };
  return bundle;
}

export async function getPhysicianFixture() {
  if (!fixtureCache) {
    fixtureCache = await loadFixtureBundle();
    fixtureCache.source = 'fixture';
    assertFixtureBundle(fixtureCache);
  }
  return fixtureCache;
}

export async function getPhysicianBundle() {
  const baseURL = backendBaseURL();
  if (baseURL) {
    try {
      return await loadBackendBundle(baseURL);
    } catch (error) {
      console.warn(`Physician app backend mode unavailable, falling back to fixture mode: ${error.message}`);
    }
  }
  return getPhysicianFixture();
}

export async function getQueue() {
  const bundle = await getPhysicianBundle();
  return bundle.queue;
}

export async function getActiveCase() {
  const bundle = await getPhysicianBundle();
  return bundle.case;
}

export async function startPhysicianReview(patientId, payload = {}) {
  const baseURL = backendBaseURL();
  if (!baseURL) return null;
  try {
    return await postJSON(baseURL, `patients/${patientId}/reviews`, payload);
  } catch (error) {
    console.warn(`Physician review start unavailable, keeping local review state: ${error.message}`);
    return null;
  }
}

export async function persistStructuredEdit(planId, edit) {
  const baseURL = backendBaseURL();
  if (!baseURL) return null;
  try {
    return await postJSON(baseURL, `clinical-plans/${planId}/overrides`, edit);
  } catch (error) {
    console.warn(`Structured edit persistence unavailable, keeping local edit record: ${error.message}`);
    return null;
  }
}

export async function prepareCanvasDraft(patientId, payload = {}) {
  const baseURL = backendBaseURL();
  if (!baseURL) return null;
  try {
    return await postJSON(baseURL, `canvas/${patientId}/draft`, payload);
  } catch (error) {
    console.warn(`Canvas draft handoff unavailable, keeping local placeholder state: ${error.message}`);
    return null;
  }
}

export async function openCanvasSignHandoff(patientId, payload = {}) {
  const baseURL = backendBaseURL();
  if (!baseURL) return null;
  try {
    return await postJSON(baseURL, `canvas/${patientId}/sign-handoff`, payload);
  } catch (error) {
    console.warn(`Canvas sign handoff unavailable, keeping local placeholder state: ${error.message}`);
    return null;
  }
}

export async function requestReleasePreview(patientId, payload = {}) {
  const baseURL = backendBaseURL();
  if (!baseURL) return null;
  return postJSON(baseURL, `release/${patientId}/preview`, payload);
}

export async function requestPhysicianSign(patientId, payload = {}) {
  const baseURL = backendBaseURL();
  if (!baseURL) return null;
  return postJSON(baseURL, `release/${patientId}/sign`, payload);
}

export async function requestFinalRelease(patientId, payload = {}) {
  const baseURL = backendBaseURL();
  if (!baseURL) return null;
  return postJSON(baseURL, `release/${patientId}/release`, payload);
}

export async function getAuditEvents(patientId) {
  const baseURL = backendBaseURL();
  if (!baseURL) return null;
  const query = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : '';
  return getJSON(baseURL, `audit/events${query}`);
}

export async function getMessageThreads(patientId) {
  const baseURL = backendBaseURL();
  if (!baseURL) return null;
  try {
    return await getJSON(baseURL, `patients/${patientId}/message-threads`);
  } catch (error) {
    console.warn(`Message thread list unavailable, keeping local message state: ${error.message}`);
    return null;
  }
}

export async function createMessageThread(patientId, payload = {}) {
  const baseURL = backendBaseURL();
  if (!baseURL) return null;
  try {
    return await postJSON(baseURL, `patients/${patientId}/message-threads`, payload);
  } catch (error) {
    console.warn(`Message thread create unavailable, keeping local message state: ${error.message}`);
    return null;
  }
}

export async function sendThreadMessage(threadId, payload = {}) {
  const baseURL = backendBaseURL();
  if (!baseURL) return null;
  try {
    return await postJSON(baseURL, `message-threads/${threadId}/messages`, payload);
  } catch (error) {
    console.warn(`Message send unavailable, keeping local message state: ${error.message}`);
    return null;
  }
}

const OVERRIDE_TAXONOMY = {
  approve: {
    label: 'Approve as written',
    reasons: ['clinically_appropriate', 'patient_preference_aligned', 'benefit_risk_acceptable'],
    event: 'recommendation_approved'
  },
  defer: {
    label: 'Defer',
    reasons: ['awaiting_diagnostics', 'shared_decision_needed', 'sequencing_after_higher_priority_item'],
    event: 'recommendation_deferred'
  },
  reject: {
    label: 'Reject',
    reasons: ['not_clinically_indicated', 'contraindication_or_safety', 'insufficient_evidence_for_patient'],
    event: 'recommendation_rejected'
  },
  hold: {
    label: 'Hold for review',
    reasons: ['needs_specialist_input', 'needs_patient_clarification', 'data_quality_issue'],
    event: 'recommendation_held'
  }
};

export function getOverrideTaxonomy() {
  return OVERRIDE_TAXONOMY;
}

export function createStructuredEdit({ itemId, field = 'decision', value = null, action = 'approve', reasonCode, reason }) {
  if (!OVERRIDE_TAXONOMY[action]) {
    throw new Error('Structured overrides require an approve, defer, reject, or hold action.');
  }
  if (!reasonCode || !OVERRIDE_TAXONOMY[action].reasons.includes(reasonCode)) {
    throw new Error('Structured overrides require a taxonomy reason for the selected action.');
  }
  if (!reason || reason.trim().length < 6) {
    throw new Error('Structured overrides require a physician note before they can be audited.');
  }
  return {
    schema_version: 'structured_override.v1',
    action,
    item_id: itemId,
    target_id: itemId,
    field,
    value,
    reason_code: reasonCode,
    reason,
    details: { field, value, reason_code: reasonCode, taxonomy_label: OVERRIDE_TAXONOMY[action].label },
    audit_event_name: OVERRIDE_TAXONOMY[action].event,
    actor: 'fixture.physician.local-reviewer',
    role: 'physician',
    created_at: new Date().toISOString()
  };
}

export function createWorkflowEvent({ eventName, previousState, nextState, artifactIds, actor = 'fixture.physician.local-reviewer' }) {
  return {
    event_id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    event_name: eventName,
    actor,
    role: 'physician',
    timestamp: new Date().toISOString(),
    previous_state: previousState,
    next_state: nextState,
    artifact_ids: artifactIds
  };
}

export function applyStructuredEditsToPreview(preview, edits = []) {
  if (!edits.length) return preview;
  const visible_actions = preview.visible_actions.map((action) => {
    const fieldEdits = edits.filter((edit) => edit.item_id === action.id);
    if (!fieldEdits.length) return action;
    return fieldEdits.reduce((draftAction, edit) => {
      if (edit.field === 'action_phrase') {
        return {
          ...draftAction,
          action_phrase: edit.value,
          what_to_do: edit.value,
          edited_by_physician: true
        };
      }
      return {
        ...draftAction,
        physician_decision: edit.action,
        physician_reason_code: edit.reason_code,
        physician_override_status: edit.action === 'approve' ? 'approved_for_preview' : `${edit.action}_recorded`,
        edited_by_physician: true
      };
    }, { ...action });
  });
  return { ...preview, visible_actions };
}

export function buildDraftReleasePreview(clinicalPlan) {
  return {
    schema_version: 'release_package_draft.v1',
    package_id: `draft-${clinicalPlan.patient_id}`,
    source_plan_id: clinicalPlan.plan_id,
    source_engine_run_id: clinicalPlan.source_engine_run_id ?? clinicalPlan.source_action_map_state,
    release_state: 'release_package_draft',
    patient_visible: false,
    doctor_message: clinicalPlan.clinical_note_draft?.patient_message ?? '',
    visible_actions: clinicalPlan.recommended_next_steps ?? [],
    required_items: clinicalPlan.required_items ?? [],
    hidden_items: clinicalPlan.deferred_not_selected ?? [],
    audit_validation_result: clinicalPlan.synthesis_checks ?? [],
    canvas_linkage: {
      status: 'not_started',
      permitted_controls: ['Prepare Canvas draft', 'Open Canvas to sign']
    }
  };
}
