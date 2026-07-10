/*
Design brief: This screen is for physicians scanning backend-owned case artifacts and moving a reviewed care plan through disposition and release. The one thing it must answer first is what requires physician action before this patient can advance. Shape carries artifact type and control affordance, color carries hazard or workflow focus, weight carries clinical hierarchy, and position carries the review sequence from chart to release.
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
import { clearBearerToken, requiresLogin, saveBearerToken } from './auth.js';
import { adaptPhysicianCase, buildReleasePreviewRequest, releaseIdentifier } from './dashboardAdapter.js';
import { decisionReasonOptionsHTML, renderDashboard, renderFatalError, renderLogin } from './dashboardApp.js';

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

function inferReviewStarted() {
  const lifecycle = selectedTask()?.lifecycle_state;
  const persistedReview = state.activeCase?.review_history?.some((review) => review.status === 'started' || review.status === 'released');
  state.reviewStarted = Boolean(persistedReview || ['physician_review_started', 'physician_reviewing', 'plan_editing', 'plan_authorized', 'released_to_patient'].includes(lifecycle));
}

function adoptCase(caseBundle) {
  state.activeCase = caseBundle;
  state.releasePackage = caseBundle?.release_preview ?? caseBundle?.release_package ?? state.releasePackage;
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
      if (!state.reviewStarted) throw new Error('Start review before generating a release preview.');
      setBusyStatus('Generating backend release preview…');
      const preview = await requestReleasePreview(state.activePatientId, buildReleasePreviewRequest(state.activeCase));
      state.releasePackage = preview ?? {
        schema_version: 'release_package.v1',
        release_id: `fixture-preview-${state.activePatientId}`,
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
      if (state.releasePackage?.release_state !== 'authorized_not_released') throw new Error('Backend authorization is required before release.');
      setBusyStatus('Requesting final backend release…');
      const released = await requestFinalRelease(state.activePatientId, {
        release_id: releaseIdentifier(state.releasePackage),
        reason: 'Physician released the reviewed and authorized plan to the patient.'
      });
      const validReleasedPackage = released?.schema_version === 'release_package.v1'
        && released?.release_state === 'released_to_patient'
        && released?.patient_visible === true
        && Boolean(releaseIdentifier(released));
      if (released && !validReleasedPackage) throw new Error('Backend final release did not return a valid released package.');
      state.releasePackage = released ?? { ...state.releasePackage, release_state: 'released_to_patient', patient_visible: true };
      if (released) {
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
    if (state.source !== 'fixture') clearBearerToken();
    window.location?.reload?.();
  });
}

function render() {
  if (!state.activeCase) return;
  try {
    const model = adaptPhysicianCase(state.activeCase);
    state.selectedTask = selectedTask();
    renderDashboard(app, state, model);
    attachListeners();
  } catch (error) {
    renderFatalError(app, 'Case unavailable.', error.message);
  }
}

function attachLogin() {
  document.querySelector('form[data-login-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      saveBearerToken(new FormData(event.target).get('token'));
      await boot();
    } catch (error) {
      renderLogin(app, error.message);
      attachLogin();
    }
  });
}

async function boot() {
  if (requiresLogin()) {
    renderLogin(app);
    attachLogin();
    return;
  }
  try {
    const bundle = await getPhysicianBundle();
    state.queue = bundle.queue ?? [];
    state.source = bundle.source ?? 'backend';
    adoptCase(bundle.case);
    state.activePatientId = bundle.case?.patient_packet?.patient_id ?? bundle.case?.patient_id ?? state.queue[0]?.patient_id ?? null;
    inferReviewStarted();
    render();
  } catch (error) {
    if (state.source !== 'fixture' && /401|403|invalid session|login required/i.test(error.message)) {
      clearBearerToken();
      renderLogin(app, error.message);
      attachLogin();
      return;
    }
    renderFatalError(app, 'Dashboard unavailable.', error.message);
  }
}

boot();
