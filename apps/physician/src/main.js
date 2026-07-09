import {
  createMessageThread,
  createWorkflowEvent,
  getPhysicianBundle,
  getActiveCase,
  getAuditEvents,
  getMessageThreads,
  openCanvasSignHandoff,
  persistStructuredEdit,
  prepareCanvasDraft,
  requestFinalRelease,
  requestPhysicianSign,
  requestReleasePreview,
  sendThreadMessage,
  startPhysicianReview
} from './apiClient.js';
import { Queue } from './components/Queue.js';
import { PatientChart } from './components/PatientChart.js';
import { EngineRunView } from './components/EngineRunView.js';
import { PlanEditor } from './components/PlanEditor.js';
import { ReleasePreview } from './components/ReleasePreview.js';
import { AuditTrail } from './components/AuditTrail.js';
import { MonitoringAlerts } from './components/MonitoringAlerts.js';
import { MessagesPanel } from './components/MessagesPanel.js';

const app = document.querySelector('#app');
const state = {
  activePatientId: null,
  queue: [],
  activeCase: null,
  edits: [],
  releasePackage: null,
  signedPatient: null,
  workflowStatus: null,
  releaseError: null,
  messageStatus: null,
  bundleSource: 'fixture',
  workflowEvents: [],
  messageThreads: [],
  messageSeamUnavailable: false,
  canvasHandoff: {
    state: 'not_started',
    draftPreparedAt: null,
    canvasOpenedAt: null
  }
};

function renderError(error) {
  app.innerHTML = `
    <main class="physician-layout">
      <section class="panel error-panel">
        <p class="kicker">Scaffold error</p>
        <h1>Fixture boundary failed.</h1>
        <p>${error.message}</p>
      </section>
    </main>
  `;
}

function workflowEvent(eventName, previousState, nextState, artifactIds) {
  state.workflowEvents = [
    ...state.workflowEvents,
    createWorkflowEvent({ eventName, previousState, nextState, artifactIds })
  ];
}

function mergePatientStatus(patient) {
  if (!patient?.patient_id) return;
  state.queue = state.queue.map((task) => task.patient_id === patient.patient_id ? {
    ...task,
    display_name: patient.name ?? patient.display_name ?? task.display_name,
    lifecycle_state: patient.lifecycle_state ?? task.lifecycle_state,
    release_state: patient.release_state ?? task.release_state,
    blocker: patient.release_state === 'released_to_patient' ? 'Plan released to patient.' : task.blocker,
    last_event_at: patient.updated_at ?? task.last_event_at
  } : task);
  if (state.activeCase?.patient_packet?.patient_id === patient.patient_id) {
    state.activeCase.patient_packet.facts = {
      ...(state.activeCase.patient_packet.facts ?? {}),
      lifecycle_state: patient.lifecycle_state ?? state.activeCase.patient_packet.facts?.lifecycle_state,
      release_state: patient.release_state ?? state.activeCase.patient_packet.facts?.release_state
    };
  }
}

function render() {
  const selected = state.activeCase;
  const selectedTask = state.queue.find((task) => task.patient_id === state.activePatientId);
  const selectedCaseIsOpen = selected?.patient_packet?.patient_id === state.activePatientId;
  app.innerHTML = '';

  const shell = document.createElement('main');
  shell.className = 'physician-layout';
  shell.innerHTML = `
    <header class="topbar">
      <div>
        <p class="kicker">Aleron MD</p>
        <h1>Physician app review workflow</h1>
        <p>Backend-mode review shell. Backend owns state. Engine owns ranking. This app renders artifacts, records structured edits, previews release, hands off Canvas signing, and asks the backend to release. Supabase is the default backend; fixture mode is explicit with <code>?fixture=1</code>.</p>
      </div>
      <div class="release-badge">
        <span>Canvas mode</span>
        <strong>Prepare draft, open Canvas to sign</strong>
      </div>
    </header>
  `;
  app.appendChild(shell);

  const grid = document.createElement('div');
  grid.className = 'workbench';
  shell.appendChild(grid);

  const queuePane = document.createElement('aside');
  queuePane.className = 'queue-column';
  queuePane.appendChild(Queue({
    queue: state.queue,
    source: state.bundleSource,
    activePatientId: state.activePatientId,
    onOpen: async (patientId) => {
      state.activePatientId = patientId;
      state.releaseError = null;
      state.workflowStatus = null;
      try {
        state.activeCase = await getActiveCase(patientId);
        state.releasePackage = state.activeCase.release_package ?? null;
        state.messageThreads = state.activeCase.message_threads ?? [];
        state.messageSeamUnavailable = state.activeCase.message_seam_unavailable === true;
        if (state.activeCase.canvas_handoff) state.canvasHandoff = state.activeCase.canvas_handoff;
      } catch (error) {
        state.workflowStatus = `Unable to load backend chart: ${error.message}`;
      }
      if (state.activeCase?.patient_packet?.patient_id === patientId) {
        const reviewPatient = await startPhysicianReview(patientId, { source: 'physician_app_open_chart' });
        mergePatientStatus(reviewPatient);
        state.workflowStatus = reviewPatient ? 'Backend review started.' : 'Review opened locally.';
        workflowEvent(
          'physician_review_started',
          selectedTask?.lifecycle_state ?? 'physician_review_pending',
          'physician_review_started',
          [patientId]
        );
      }
      render();
    }
  }));
  grid.appendChild(queuePane);

  const content = document.createElement('div');
  content.className = 'content-column';
  grid.appendChild(content);

  if (!selected || !selectedCaseIsOpen) {
    content.innerHTML = `
      <section class="panel">
        <p class="kicker">Chart unavailable</p>
        <h2>${selectedTask ? selectedTask.display_name : 'Select a queue row'} is not loaded in this fixture.</h2>
        <p>${selectedTask?.blocker ?? 'The scaffold only loads charts when backend artifacts are present.'}</p>
        <div class="release-badge inline-badge">
          <span>Conservative release</span>
          <strong>No release controls without case artifacts</strong>
        </div>
      </section>
    `;
    return;
  }

  const caseNode = document.createElement('div');
  caseNode.className = 'case-stack';
  content.appendChild(caseNode);

  caseNode.appendChild(PatientChart({
    patientPacket: selected.patient_packet,
    diagnosticOrders: selected.diagnostic_orders,
    diagnosticResults: selected.diagnostic_results
  }));
  caseNode.appendChild(EngineRunView({
    actionMapState: selected.action_map_state,
    clinicalPlan: selected.clinical_plan,
    runAudit: selected.run_audit
  }));
  caseNode.appendChild(MonitoringAlerts({ alerts: selected.monitoring_alerts ?? [] }));
  caseNode.appendChild(MessagesPanel({
    threads: state.messageThreads,
    seamUnavailable: selected.message_seam_unavailable || state.messageSeamUnavailable,
    status: state.messageStatus,
    onSendReply: async (body) => {
      const patientId = selected.patient_packet.patient_id;
      if (!body || body.trim().length < 2) {
        state.messageStatus = 'Message not sent: reply body is required.';
        render();
        return;
      }
      let thread = state.messageThreads[0];
      if (!thread) {
        thread = await createMessageThread(patientId, {
          thread_type: 'care_team',
          context: { source: 'physician_app' },
          participants: [{ role: 'physician', actor_id: 'physician:local-reviewer' }]
        });
      }
      const sent = thread?.thread_id ? await sendThreadMessage(thread.thread_id, { body, context: { source: 'physician_app_reply' } }) : null;
      const refreshed = await getMessageThreads(patientId);
      state.messageThreads = refreshed?.message_threads ?? (thread ? [{ ...thread, messages: [...(thread.messages ?? []), sent].filter(Boolean) }] : state.messageThreads);
      state.messageSeamUnavailable = !thread || !sent;
      state.messageStatus = sent ? 'Backend physician reply sent.' : 'Message seam unavailable, no backend reply recorded.';
      workflowEvent('message_sent', 'physician_reviewing', 'physician_reviewing', [sent?.message_id ?? thread?.thread_id ?? patientId]);
      render();
    }
  }));
  caseNode.appendChild(PlanEditor({
    clinicalPlan: selected.clinical_plan,
    edits: state.edits,
    onEdit: async (edit) => {
      const persisted = await persistStructuredEdit(selected.clinical_plan.plan_id, edit);
      state.edits = [...state.edits, edit];
      workflowEvent(
        edit.audit_event_name ?? 'physician_structured_override_recorded',
        'plan_editing',
        'plan_editing',
        [persisted?.override_id ?? edit.item_id]
      );
      render();
    }
  }));
  caseNode.appendChild(ReleasePreview({
    clinicalPlan: selected.clinical_plan,
    releasePackage: state.releasePackage ?? selected.release_package,
    edits: state.edits,
    canvasHandoff: state.canvasHandoff,
    signedPatient: state.signedPatient,
    workflowStatus: state.workflowStatus,
    releaseError: state.releaseError,
    onRequestPreview: async (preview) => {
      const patientId = selected.patient_packet.patient_id;
      state.releaseError = null;
      const backendPreview = await requestReleasePreview(patientId, {
        source_plan_id: selected.clinical_plan.plan_id,
        source_engine_run_id: selected.clinical_plan.source_engine_run_id,
        doctor_message: preview.doctor_message,
        visible_actions: preview.visible_actions,
        structured_edits: state.edits
      });
      state.releasePackage = backendPreview ?? {
        ...preview,
        package_id: preview.package_id ?? `fixture-preview-${patientId}`,
        schema_version: 'release_package.v1',
        patient_id: patientId,
        release_state: 'release_package_draft',
        patient_visible: false
      };
      state.workflowStatus = backendPreview ? 'Backend release preview generated.' : 'Fixture fallback preview generated locally.';
      workflowEvent('release_preview_generated', 'plan_editing', 'release_package_draft', [state.releasePackage.package_id]);
      render();
    },
    onPrepareCanvasDraft: async () => {
      const previousState = state.canvasHandoff.state;
      const backendHandoff = await prepareCanvasDraft(selected.patient_packet.patient_id, {
        source_plan_id: selected.clinical_plan.plan_id,
        release_package_id: (state.releasePackage ?? selected.release_package)?.package_id,
        order_ids: (selected.diagnostic_orders ?? []).map((order) => order.order_id).filter(Boolean)
      });
      state.canvasHandoff = backendHandoff ?? {
        ...state.canvasHandoff,
        state: 'draft_prepared',
        draftPreparedAt: new Date().toISOString()
      };
      workflowEvent('canvas_draft_prepared_placeholder', previousState, state.canvasHandoff.state, [selected.clinical_plan.plan_id]);
      render();
    },
    onOpenCanvasSign: async () => {
      const previousState = state.canvasHandoff.state;
      const backendHandoff = await openCanvasSignHandoff(selected.patient_packet.patient_id, {
        source_plan_id: selected.clinical_plan.plan_id,
        release_package_id: (state.releasePackage ?? selected.release_package)?.package_id,
        external_handle: state.canvasHandoff.external_handle
      });
      state.canvasHandoff = backendHandoff ?? {
        ...state.canvasHandoff,
        state: 'canvas_opened_for_signature',
        canvasOpenedAt: new Date().toISOString()
      };
      workflowEvent('canvas_signature_handoff_placeholder_opened', previousState, state.canvasHandoff.state, [selected.clinical_plan.plan_id]);
      render();
    },
    onSign: async (preview) => {
      const patientId = selected.patient_packet.patient_id;
      const packageId = (state.releasePackage ?? preview).package_id;
      let signed = null;
      try {
        state.releaseError = null;
        signed = await requestPhysicianSign(patientId, {
          package_id: packageId,
          signature_id: `local-canvas-signature:${packageId}`,
          reason: 'Physician reviewed release preview and recorded a local signing audit placeholder after Canvas handoff. This is not proof of Canvas legal signature completion.',
          signing_mode: 'local_placeholder_after_canvas_handoff'
        });
      } catch (error) {
        state.releaseError = error.message;
        state.workflowStatus = 'Backend sign blocked by release gate.';
        workflowEvent('release_blocked', 'release_package_draft', 'release_blocked', [packageId]);
        render();
        return;
      }
      mergePatientStatus(signed);
      state.signedPatient = signed ?? { patient_id: patientId, lifecycle_state: 'plan_signed', release_state: 'signed_not_released' };
      state.workflowStatus = signed ? 'Backend sign placeholder recorded.' : 'Fixture fallback sign placeholder recorded locally.';
      workflowEvent('plan_signed', 'release_package_draft', 'signed_not_released', [packageId]);
      render();
    },
    onRelease: async (preview) => {
      const patientId = selected.patient_packet.patient_id;
      const packageId = (state.releasePackage ?? preview).package_id;
      let released = null;
      try {
        state.releaseError = null;
        released = await requestFinalRelease(patientId, {
          package_id: packageId,
          reason: 'Physician released reviewed plan to patient.'
        });
      } catch (error) {
        state.releaseError = error.message;
        state.workflowStatus = 'Backend release blocked by release gate.';
        workflowEvent('release_blocked', 'signed_not_released', 'release_blocked', [packageId]);
        render();
        return;
      }
      state.releasePackage = released ? {
        ...released,
        patient_visible: released.patient_visible ?? released.release_state === 'released_to_patient'
      } : {
        ...(state.releasePackage ?? preview),
        schema_version: 'release_package.v1',
        patient_id: patientId,
        release_state: 'released_to_patient',
        patient_visible: true
      };
      if (released) mergePatientStatus({ patient_id: patientId, lifecycle_state: 'released_to_patient', release_state: released.release_state });
      const audit = await getAuditEvents(patientId).catch((error) => {
        console.warn(`Audit refresh unavailable after release: ${error.message}`);
        return null;
      });
      if (audit?.events) selected.audit_log = audit.events;
      const refreshedThreads = await getMessageThreads(patientId);
      if (refreshedThreads?.message_threads) {
        state.messageThreads = refreshedThreads.message_threads;
        selected.message_threads = refreshedThreads.message_threads;
      }
      state.workflowStatus = released ? 'Backend released package to patient. Released-plan message thread created.' : 'Fixture fallback release recorded locally only.';
      workflowEvent('plan_released', 'signed_not_released', 'released_to_patient', [state.releasePackage.package_id]);
      render();
    }
  }));
  caseNode.appendChild(AuditTrail({ auditLog: selected.audit_log, workflowEvents: state.workflowEvents }));
}

async function boot() {
  try {
    const bundle = await getPhysicianBundle();
    state.queue = bundle.queue;
    state.activeCase = bundle.case;
    state.bundleSource = bundle.source ?? 'fixture';
    state.releasePackage = bundle.case.release_package ?? null;
    state.messageThreads = bundle.case.message_threads ?? [];
    state.messageSeamUnavailable = bundle.case.message_seam_unavailable === true;
    state.activePatientId = bundle.case.patient_packet.patient_id;
    if (bundle.case.canvas_handoff) {
      state.canvasHandoff = bundle.case.canvas_handoff;
    }
    render();
  } catch (error) {
    renderError(error);
  }
}

boot();
