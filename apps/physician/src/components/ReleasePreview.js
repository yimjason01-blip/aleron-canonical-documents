import { applyStructuredEditsToPreview, buildDraftReleasePreview } from '../apiClient.js';

function releaseGateRows({ preview, hasBackendPreview, isSigned, isReleased, releaseError }) {
  const validationStatus = preview.audit_validation?.status ?? preview.audit_validation_result?.status ?? 'not_run_in_ui';
  const gates = [
    { name: 'Backend preview', state: hasBackendPreview ? 'pass' : 'blocked', detail: hasBackendPreview ? 'release_package.v1 draft exists' : 'request backend preview before sign' },
    { name: 'Physician sign', state: isSigned ? 'pass' : hasBackendPreview ? 'ready' : 'blocked', detail: isSigned ? 'signed_not_released recorded' : 'backend sign requires preview and Canvas authorization id' },
    { name: 'Final release', state: isReleased ? 'pass' : isSigned ? 'ready' : 'blocked', detail: isReleased ? 'patient-visible release package exists' : 'release requires signed_not_released state' },
    { name: 'Audit validation', state: validationStatus === 'pass' ? 'pass' : 'pending', detail: validationStatus }
  ];
  if (releaseError) gates.push({ name: 'Backend error', state: 'error', detail: releaseError });
  return gates.map((gate) => `
    <li class="gate-row gate-${gate.state}">
      <strong>${gate.name}</strong>
      <span>${gate.state}</span>
      <small>${gate.detail}</small>
    </li>
  `).join('');
}

export function ReleasePreview({
  clinicalPlan,
  releasePackage,
  edits = [],
  canvasHandoff,
  signedPatient,
  workflowStatus,
  releaseError,
  onRequestPreview,
  onPrepareCanvasDraft,
  onOpenCanvasSign,
  onSign,
  onRelease
}) {
  const preview = applyStructuredEditsToPreview(releasePackage ?? buildDraftReleasePreview(clinicalPlan), edits);
  const actions = preview.visible_actions.map((action) => `
    <li>
      <strong>${action.title ?? action.label}</strong>
      <span>${action.what_to_do ?? action.value_summary ?? action.action_phrase ?? 'Visible after signed release package.'}</span>
      ${action.physician_decision ? `<small>${action.physician_decision} · ${action.physician_reason_code}</small>` : ''}
      ${action.edited_by_physician ? '<small>Physician structured override recorded</small>' : ''}
    </li>
  `).join('');
  const handoffState = canvasHandoff?.state ?? preview.canvas_linkage?.status ?? 'not_started';
  const draftPreparedAt = canvasHandoff?.draftPreparedAt ?? canvasHandoff?.prepared_at ?? 'Not prepared';
  const canvasOpenedAt = canvasHandoff?.canvasOpenedAt ?? canvasHandoff?.opened_at ?? 'Not opened';
  const externalHandle = canvasHandoff?.external_handle ?? 'No external handle';
  const handoffStatus = canvasHandoff?.handoff_status ?? preview.canvas_linkage?.handoff_status ?? {};
  const noteDraftStatus = handoffStatus.note_draft ?? 'not_started';
  const noteSignatureStatus = handoffStatus.note_signature ?? 'native_canvas_signature_required_not_observed';
  const orderHandoffStatus = handoffStatus.orders ?? 'local_order_intent_only_not_sent_by_canvas_adapter';
  const handoffOrderIds = Array.isArray(handoffStatus.order_ids) && handoffStatus.order_ids.length ? handoffStatus.order_ids.join(', ') : 'No linked order ids';
  const signingMetadata = preview.signing_audit_metadata ?? {};
  const legalSignatureStatus = signingMetadata.legal_signature_complete === true ? 'complete' : 'not proven by local pilot';
  const hasBackendPreview = preview.schema_version === 'release_package.v1' || preview.release_state === 'release_package_draft';
  const isSigned = signedPatient?.release_state === 'signed_not_released' || signedPatient?.lifecycle_state === 'plan_signed';
  const patientVisible = preview.patient_visible === true || preview.release_state === 'released_to_patient';
  const isReleased = preview.release_state === 'released_to_patient' && patientVisible;
  const canSign = hasBackendPreview && !isReleased;
  const canRelease = isSigned && !isReleased;

  const node = document.createElement('section');
  node.className = 'panel release-panel';
  node.innerHTML = `
    <div class="panel-heading">
      <p class="kicker">Release workflow</p>
      <h2>${isReleased ? 'Released package' : 'Draft release package'}.</h2>
      <p>Patient-visible plan content is previewed from a release package shape only. Raw action map artifacts stay physician-only.</p>
    </div>
    <article class="release-card">
      <div class="release-state">
        <span>${preview.release_state}</span>
        <strong>${patientVisible ? 'Patient visible' : 'Not patient visible'}</strong>
      </div>
      <h3>Release gates from backend state</h3>
      <ol class="gate-list">${releaseGateRows({ preview, hasBackendPreview, isSigned, isReleased, releaseError })}</ol>
      <h3>Doctor message</h3>
      <p>${preview.doctor_message}</p>
      <h3>Visible actions</h3>
      <ul>${actions}</ul>
      <h3>Canvas-safe note and order handoff status</h3>
      <dl class="handoff-list">
        <div><dt>Canvas handoff</dt><dd>${handoffState}</dd></div>
        <div><dt>External reference</dt><dd>${externalHandle}</dd></div>
        <div><dt>Draft prepared</dt><dd>${draftPreparedAt}</dd></div>
        <div><dt>Canvas opened</dt><dd>${canvasOpenedAt}</dd></div>
        <div><dt>Note draft</dt><dd>${noteDraftStatus}</dd></div>
        <div><dt>Note signature</dt><dd>${noteSignatureStatus}</dd></div>
        <div><dt>Order handoff</dt><dd>${orderHandoffStatus}</dd></div>
        <div><dt>Linked order ids</dt><dd>${handoffOrderIds}</dd></div>
        <div><dt>Legal signature</dt><dd>${legalSignatureStatus}</dd></div>
      </dl>
      <div class="canvas-actions">
        <button type="button" data-release-action="request-preview">Request backend preview</button>
        <button type="button" class="secondary" data-release-action="prepare-canvas-draft">Prepare Canvas draft</button>
        <button type="button" class="secondary" data-release-action="open-canvas-sign">Open Canvas to sign</button>
        <button type="button" class="secondary" data-release-action="record-sign" ${canSign ? '' : 'disabled'}>Record physician sign placeholder</button>
        <button type="button" data-release-action="release-backend" ${canRelease ? '' : 'disabled'}>Release through backend</button>
      </div>
      <p class="fine-print">Canvas remains a handoff only. The local sign button records an Aleron audit placeholder after physician review, not a proven Canvas legal e-signature. Real signing still needs Canvas actor attribution, writeback, signature, and order-send evidence.</p>
      ${workflowStatus ? `<p class="status-line">${workflowStatus}</p>` : ''}
      ${releaseError ? `<p class="error-line">${releaseError}</p>` : ''}
    </article>
  `;
  node.querySelector('[data-release-action="request-preview"]')?.addEventListener('click', () => onRequestPreview?.(preview));
  node.querySelector('[data-release-action="prepare-canvas-draft"]')?.addEventListener('click', () => onPrepareCanvasDraft?.(preview));
  node.querySelector('[data-release-action="open-canvas-sign"]')?.addEventListener('click', () => onOpenCanvasSign?.(preview));
  node.querySelector('[data-release-action="record-sign"]')?.addEventListener('click', () => onSign?.(preview));
  node.querySelector('[data-release-action="release-backend"]')?.addEventListener('click', () => onRelease?.(preview));
  return node;
}
