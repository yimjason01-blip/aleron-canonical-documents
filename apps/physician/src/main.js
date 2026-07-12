/*
Design brief: This screen is for a physician determining whether canonical analysis is complete enough to begin case review and release. The one thing it must answer first is whether the case is review-ready and, if not, exactly which blocker prevents action. Shape carries one bounded status group, color carries only semantic status emphasis, weight carries status before detail, and position places the gate directly above Care Plan controls.
*/
import {
  createStructuredEdit,
  getActiveCase,
  getPhysicianBundle,
  persistStructuredEdit,
  requestFinalRelease,
  requestPhysicianAuthorization,
  requestReleasePreview,
  startPhysicianReview
} from './apiClient.js';
import { adaptPhysicianCase, artifactBindsCurrentLineage, buildReleasePreviewRequest, releaseIdentifier } from './dashboardAdapter.js';
import { decisionReasonOptionsHTML, renderDashboard, renderEmptyStaging, renderFatalError } from './dashboardApp.js?v=physician-dechrome-v1';

const app = document.querySelector('#app');
const state = {
  activePatientId: null,
  activeCase: null,
  activeTab: 'patient-data',
  selectedRiskId: null,
  selectedPlanItemId: null,
  queue: [],
  source: 'backend',
  reviewStarted: false,
  releasePackage: null,
  workflowStatus: null,
  workflowError: null
};

function selectedTask() {
  return state.queue.find((task) => task.patient_id === state.activePatientId) ?? null;
}

function analysisReady() {
  return state.activeCase?.analysis_status?.status === 'completed'
    && state.activeCase?.readiness?.ready_for_review === true;
}

function requireAnalysisReady() {
  if (!analysisReady()) throw new Error('Canonical analysis must be review-ready before physician review or release actions.');
}

function requireReviewStarted() {
  if (!state.reviewStarted) throw new Error('Start the current physician review before release actions.');
}

function currentReleaseLinkage(caseBundle) {
  return {
    patient_id: caseBundle?.patient_packet?.patient_id ?? caseBundle?.patient_id,
    source_plan_id: caseBundle?.clinical_plan?.plan_id,
    source_engine_run_id: caseBundle?.engine_run?.run_id,
    source_action_map_state_id: caseBundle?.action_map_state?.action_map_state_id
  };
}

function releasePackageIsCurrent(caseBundle, releasePackage) {
  if (!releasePackage || typeof releasePackage !== 'object') return false;
  const patientId = caseBundle?.patient_packet?.patient_id ?? caseBundle?.patient_id;
  return releasePackage.patient_id === patientId && artifactBindsCurrentLineage(caseBundle, releasePackage);
}

function inferReviewStarted() {
  const packetId = state.activeCase?.patient_packet?.packet_id;
  const runId = state.activeCase?.engine_run?.run_id;
  const task = selectedTask();
  const currentTask = Boolean(packetId && runId && task?.packet_id === packetId && task?.source_engine_run_id === runId);
  const lifecycleActive = ['physician_review_started', 'physician_reviewing', 'plan_editing', 'plan_authorized', 'released_to_patient'].includes(task?.lifecycle_state);
  const persistedReview = state.activeCase?.review_history?.some((review) => (
    review.packet_id === packetId
    && review.source_engine_run_id === runId
    && ['started', 'released'].includes(review.status)
  ));
  state.reviewStarted = Boolean(analysisReady() && (persistedReview || (currentTask && lifecycleActive)));
}

function adoptCase(caseBundle) {
  state.activeCase = caseBundle;
  const releasePackage = caseBundle?.release_preview ?? caseBundle?.release_package ?? null;
  state.releasePackage = releasePackageIsCurrent(caseBundle, releasePackage) ? releasePackage : null;
  const patientId = caseBundle?.patient_packet?.patient_id ?? caseBundle?.patient_id;
  if (patientId) state.activePatientId = patientId;
  inferReviewStarted();
}

async function loadCase(patientId) {
  state.workflowError = null;
  const caseBundle = await getActiveCase(patientId);
  adoptCase(caseBundle);
}

async function refreshFromBackend() {
  const bundle = await getPhysicianBundle(state.activePatientId);
  state.queue = bundle.queue ?? state.queue;
  state.source = bundle.source ?? state.source;
  if (bundle.case) adoptCase(bundle.case);
}

function setBusyStatus(message) {
  state.workflowStatus = message;
  state.workflowError = null;
  render();
}

function fail(error, fallback) {
  state.workflowError = error?.message ?? fallback;
  state.workflowStatus = null;
  render();
}

async function saveDecision(form, actionOverride = null) {
  requireAnalysisReady();
  if (!state.reviewStarted) throw new Error('Start review before recording a physician decision.');
  const data = new FormData(form);
  const action = actionOverride ?? data.get('action') ?? 'approve';
  const value = data.get('value') || null;
  const reasonCode = data.get('reason_code') || data.get(`reason_code_${action}`);
  const itemId = form.dataset.editItem || null;
  const isAdd = action === 'add_problem' || action === 'add_order';
  const edit = createStructuredEdit({
    itemId,
    field: isAdd ? 'title' : action === 'modify' ? 'action_phrase' : null,
    value,
    action,
    reasonCode,
    reason: data.get('reason')
  });
  setBusyStatus('Saving structured physician decision…');
  const persisted = await persistStructuredEdit(state.activeCase.clinical_plan.plan_id, edit);
  if (state.source === 'backend') {
    await refreshFromBackend();
  } else {
    state.activeCase.structured_overrides = [...(state.activeCase.structured_overrides ?? []), { ...edit, override_id: persisted?.override_id ?? `fixture-${Date.now()}` }];
  }
  state.workflowStatus = persisted ? 'Structured physician decision saved and case refreshed.' : 'Fixture decision recorded for this test session.';
  render();
}

function attachListeners() {
  document.querySelectorAll('[data-decision-action]').forEach((select) => select.addEventListener('change', () => {
    const reasonSelect = select.closest('form')?.querySelector('[data-decision-reason]');
    if (!reasonSelect) return;
    reasonSelect.innerHTML = decisionReasonOptionsHTML(select.value);
  }));

  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
    state.activeTab = button.dataset.tab;
    render();
  }));

  document.querySelectorAll('[data-risk-domain]').forEach((button) => button.addEventListener('click', () => {
    state.selectedRiskId = button.dataset.riskDomain;
    render();
  }));

  document.querySelectorAll('[data-plan-item]').forEach((button) => button.addEventListener('click', () => {
    state.selectedPlanItemId = button.dataset.planItem;
    render();
  }));

  document.querySelector('[data-case-selector]')?.addEventListener('change', async (event) => {
    const patientId = event.target.value;
    state.activePatientId = patientId;
    state.workflowStatus = 'Loading case artifacts…';
    render();
    try {
      await loadCase(patientId);
      state.workflowStatus = 'Chart opened. Backend workflow state was not changed.';
      state.activeTab = 'patient-data';
      state.selectedRiskId = null;
      state.selectedPlanItemId = null;
      render();
    } catch (error) {
      fail(error, 'Unable to load the selected case.');
    }
  });

  document.querySelector('[data-review-action="start"]')?.addEventListener('click', async () => {
    try {
      requireAnalysisReady();
      setBusyStatus('Starting physician review…');
      const result = await startPhysicianReview(state.activePatientId, { source: 'physician_dashboard_explicit_start' });
      state.reviewStarted = true;
      if (result) {
        await refreshFromBackend();
        state.reviewStarted = true;
      }
      state.workflowStatus = result ? 'Backend review started.' : 'Fixture review started for this test session.';
      render();
    } catch (error) {
      fail(error, 'Review start failed.');
    }
  });

  document.querySelectorAll('form[data-edit-item]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await saveDecision(form);
    } catch (error) {
      fail(error, 'Structured decision failed.');
    }
  }));

  document.querySelector('form[data-add-action]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await saveDecision(event.target, new FormData(event.target).get('action'));
    } catch (error) {
      fail(error, 'Physician action add failed.');
    }
  });

  document.querySelector('[data-release-action="request-preview"]')?.addEventListener('click', async () => {
    try {
      requireAnalysisReady();
      requireReviewStarted();
      setBusyStatus('Generating backend release preview…');
      const preview = await requestReleasePreview(state.activePatientId, buildReleasePreviewRequest(state.activeCase));
      if (preview && !releasePackageIsCurrent(state.activeCase, preview)) {
        throw new Error('Backend release preview does not match the current case artifacts.');
      }
      state.releasePackage = preview ?? {
        schema_version: 'release_package.v1',
        release_id: `fixture-preview-${state.activePatientId}`,
        ...currentReleaseLinkage(state.activeCase),
        release_state: 'release_package_draft',
        patient_visible: false
      };
      state.workflowStatus = preview ? 'Backend release preview generated.' : 'Fixture release preview generated for this test session.';
      render();
    } catch (error) {
      fail(error, 'Release preview failed.');
    }
  });

  document.querySelector('[data-release-action="authorize"]')?.addEventListener('click', async () => {
    try {
      requireAnalysisReady();
      requireReviewStarted();
      const attestation = document.querySelector('[data-physician-attestation]');
      if (!attestation?.checked) throw new Error('Physician attestation is required before authorization.');
      const releaseId = releaseIdentifier(state.releasePackage);
      if (!releaseId) throw new Error('A backend release preview is required before authorization.');
      setBusyStatus('Recording physician attestation and authorization…');
      const authorizationId = `physician-attestation:${releaseId}:${Date.now()}`;
      const authorized = await requestPhysicianAuthorization(state.activePatientId, {
        release_id: releaseId,
        signature_or_authorization_id: authorizationId,
        reason: 'Physician reviewed the case and release preview and authorized backend release.',
        signing_mode: 'physician_attestation_authorization'
      });
      if (authorized && !releasePackageIsCurrent(state.activeCase, authorized)) {
        throw new Error('Backend authorization does not match the current case artifacts.');
      }
      state.releasePackage = authorized ?? { ...state.releasePackage, release_state: 'authorized_not_released', signature_or_authorization_id: authorizationId };
      if (authorized) await refreshFromBackend();
      state.workflowStatus = authorized ? 'Staging physician attestation and authorization recorded by backend.' : 'Fixture attestation recorded for this test session.';
      render();
    } catch (error) {
      fail(error, 'Authorization failed.');
    }
  });

  document.querySelector('[data-release-action="release-backend"]')?.addEventListener('click', async () => {
    try {
      requireAnalysisReady();
      requireReviewStarted();
      if (state.releasePackage?.release_state !== 'authorized_not_released') throw new Error('Backend authorization is required before release.');
      setBusyStatus('Requesting final backend release…');
      const released = await requestFinalRelease(state.activePatientId, {
        release_id: releaseIdentifier(state.releasePackage),
        reason: 'Physician released the reviewed and authorized plan to the patient.'
      });
      const validReleasedPackage = released?.schema_version === 'release_package.v1'
        && released?.release_state === 'released_to_patient'
        && released?.patient_visible === true
        && Boolean(releaseIdentifier(released))
        && releasePackageIsCurrent(state.activeCase, released);
      if (released && !validReleasedPackage) throw new Error('Backend final release did not return a valid released package.');
      state.releasePackage = released ?? { ...state.releasePackage, release_state: 'released_to_patient', patient_visible: true };
      if (released) {
        state.activeCase.workflow_projection = {
          ...(state.activeCase.workflow_projection ?? {}),
          schema_version: state.activeCase.workflow_projection?.schema_version ?? 'physician_workflow.v1',
          lifecycle_state: 'closed',
          release_state: 'released_to_patient',
          patient_visibility: 'visible',
          next_action: { label: 'No further action', target: 'journal' },
          release: { ...(state.activeCase.workflow_projection?.release ?? {}), patient_visible: true, released_at: released.released_at ?? null }
        };
        try {
          await refreshFromBackend();
        } catch (refreshError) {
          if (refreshError?.status !== 404) throw refreshError;
        }
      }
      state.workflowStatus = released ? 'Backend released package to patient.' : 'Fixture release recorded for this test session.';
      render();
    } catch (error) {
      fail(error, 'Final release failed.');
    }
  });

  document.querySelector('[data-sign-out]')?.addEventListener('click', () => {
    window.location?.reload?.();
  });
}

function render() {
  if (!state.activeCase) {
    renderEmptyStaging(app);
    document.querySelector('[data-refresh-empty]')?.addEventListener('click', () => window.location?.reload?.());
    return;
  }
  try {
    const model = adaptPhysicianCase(state.activeCase);
    state.selectedTask = selectedTask();
    renderDashboard(app, state, model);
    attachListeners();
  } catch (error) {
    renderFatalError(app, 'Case unavailable.', error.message);
  }
}

function requestedPatientId() {
  if (typeof window === 'undefined') return null;
  const value = new URL(window.location.href).searchParams.get('patient_id')?.trim();
  return value || null;
}

async function boot() {
  try {
    const deepLinkPatientId = requestedPatientId();
    const bundle = await getPhysicianBundle(deepLinkPatientId);
    state.queue = bundle.queue ?? [];
    state.source = bundle.source ?? 'backend';
    state.apiBaseUrl = (await import('./runtimeConfig.js')).PHYSICIAN_RUNTIME_CONFIG.apiBaseUrl;
    adoptCase(bundle.case);
    state.activePatientId = deepLinkPatientId
      ?? bundle.case?.patient_packet?.patient_id
      ?? bundle.case?.patient_id
      ?? state.queue[0]?.patient_id
      ?? null;
    if (deepLinkPatientId && state.activePatientId !== deepLinkPatientId) {
      await loadCase(deepLinkPatientId);
    }
    inferReviewStarted();
    render();
  } catch (error) {
    const accessFailure = state.source !== 'fixture' && /401|403|authorization|session/i.test(error.message);
    renderFatalError(
      app,
      accessFailure ? 'Direct staging access unavailable.' : 'Dashboard unavailable.',
      error.message,
    );
  }
}

boot();
