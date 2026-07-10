import { displayValue } from './dashboardAdapter.js';
import { getOverrideTaxonomy } from './apiClient.js';

const TAB_LABELS = [
  ['patient-data', 'Patient Data'],
  ['risk', 'Risk'],
  ['vitality', 'Vitality'],
  ['care-plan', 'Care Plan'],
  ['journal', 'Journal'],
  ['aleron-ai', 'Aleron AI']
];

export function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

export function renderFatalError(app, title, errorMessage) {
  app.innerHTML = `<main class="login-shell"><section class="login-card"><h1>${esc(title)}</h1><p class="error-line">${esc(errorMessage)}</p></section></main>`;
}

function stateText(value) {
  return String(value ?? 'unknown').replaceAll('_', ' ');
}

function empty(message) {
  return `<div class="empty-state">${esc(message)}</div>`;
}

function icon(name) {
  const paths = {
    'patient-data': '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>',
    risk: '<path d="M12 3.5l7 3v5.3c0 4.1-2.8 7.8-7 8.7-4.2-.9-7-4.6-7-8.7V6.5l7-3Z"/><path d="M8.5 13.2l2.2-2.2 2.1 2.1 2.8-3.8"/>',
    vitality: '<path d="M3 18l6-6 4 4 8-8"/><path d="M17 8h4v4"/>',
    'care-plan': '<path d="M4 5h16M4 12h16M4 19h10"/>',
    journal: '<rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/>',
    'aleron-ai': '<path d="M5 6.5h14a2 2 0 0 1 2 2v6.2a2 2 0 0 1-2 2H10.5L6 20v-3.3H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2Z"/>'
  };
  return `<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

function dataRows(rows) {
  return rows.map((row) => `
    <div class="data-row">
      <div><strong>${esc(row.label ?? row.key)}</strong><small>${esc(row.provenance ?? 'Provenance missing')}</small></div>
      <div class="measure">${esc(displayValue(row.value, row.units, row.state))}</div>
    </div>`).join('');
}

function contextRows(model) {
  const rows = [];
  if (model.patientData.familyHistory.length) rows.push({ label: 'Family history', value: model.patientData.familyHistory.join('; '), provenance: 'patient packet' });
  if (model.patientData.symptoms.length) rows.push({ label: 'Symptoms', value: model.patientData.symptoms.join('; '), provenance: 'patient packet' });
  return rows;
}

function patientDataView(model) {
  const groups = model.patientData.groups.map((group) => {
    const rows = group.id === 'context' ? [...group.measurements, ...contextRows(model)] : group.measurements;
    return `<section class="data-group" data-clinical-group="${esc(group.id)}"><h2>${esc(group.label)}</h2><div class="data-rows">${rows.length ? dataRows(rows) : empty('Not measured or insufficient input.')}</div></section>`;
  }).join('');
  const uncategorized = model.patientData.uncategorized.length
    ? `<section class="data-group" data-clinical-group="uncategorized"><h2>Other / Uncategorized</h2><div class="data-rows">${dataRows(model.patientData.uncategorized)}</div></section>`
    : '';
  const orders = model.patientData.orders.map((order) => `
    <div class="data-row compact">
      <div><strong>${esc(order.vendor ?? order.order_type ?? 'Order')}</strong><small>${esc(order.panel ?? order.order_id ?? 'Panel missing')}</small></div>
      <div class="status-word">${esc(stateText(order.status ?? order.state ?? 'pending'))}</div>
    </div>`).join('');
  return `
    <header class="screen-head"><h1>Patient data</h1><p>The intake packet: identity, signals, and the labs the models read from.</p></header>
    <section class="instrument-panel patient-data-panel">
      <div class="patient-line"><strong>${esc(model.patient.name)}</strong><span>${esc(model.patient.code)}</span><span>${esc(displayValue(model.patient.age, 'years'))}</span><span>${esc(model.patient.sex ?? 'Sex missing')}</span><span>${esc(model.patient.phenotype ?? 'Phenotype missing')}</span></div>
      <div class="clinical-groups">${groups}${uncategorized}</div>
    </section>
    <section class="instrument-panel"><div class="panel-head"><h2>Orders</h2><span>Backend order state</span></div>${orders || empty('No orders recorded.')}</section>`;
}

function riskView(model, state) {
  if (!model.risk.length) return `<header class="screen-head"><h1>Risk</h1><p>Backend model interpretation by disease domain.</p></header>${empty('Risk outputs unavailable. Insufficient input or model run pending.')}`;
  const selectedId = state.selectedRiskId && model.risk.some((row) => row.id === state.selectedRiskId) ? state.selectedRiskId : model.risk[0].id;
  const row = model.risk.find((candidate) => candidate.id === selectedId);
  const emittedList = (value) => Array.isArray(value) ? value : [];
  const itemText = (item) => typeof item === 'string' ? item : item?.label ?? item?.title ?? item?.name ?? item?.value ?? 'Unavailable';
  const itemDetail = (item) => typeof item === 'object' ? item?.detail ?? item?.reason ?? item?.why ?? item?.source ?? '' : '';
  const levers = emittedList(row.actionable_levers ?? row.levers ?? row.modifiable_drivers);
  const evidence = emittedList(row.patient_evidence ?? row.evidence ?? row.inputs ?? row.patient_inputs);
  const moves = emittedList(row.clinical_next_moves ?? row.next_moves);
  const variables = emittedList(row.variables ?? row.model_variables);
  const audit = emittedList(row.model_audit_trail ?? row.audit_trail ?? row.outputs);
  const interpretation = row.risk_interpretation ?? row.interpretation ?? row.summary ?? row.detail;
  const confidence = row.confidence?.display ?? row.confidence?.label ?? row.confidence ?? row.confidence_note;
  const listOrUnavailable = (items, unavailable) => items.length ? items.map((item) => `<div class="risk-fact"><strong>${esc(itemText(item))}</strong>${itemDetail(item) ? `<small>${esc(itemDetail(item))}</small>` : ''}</div>`).join('') : `<div class="truth-empty">${esc(unavailable)}</div>`;
  const variableRows = variables.length ? variables.map((variable) => {
    const geometry = variable.geometry ?? {};
    const position = Number(geometry.position_percent ?? variable.position_percent);
    const hasGeometry = Number.isFinite(position) && (variable.range || variable.axis_range || geometry.range);
    return `<div class="risk-variable"><div><strong>${esc(variable.label ?? variable.name ?? variable.id)}</strong><small>${esc(displayValue(variable.display ?? variable.value, variable.units, variable.state))}</small></div>${hasGeometry ? `<div class="variable-track" aria-label="Backend-provided variable geometry"><i style="left:${Math.max(0, Math.min(100, position))}%"></i></div>` : '<span class="truth-empty">Geometry not emitted</span>'}</div>`;
  }).join('') : '<div class="truth-empty">Variable detail not emitted by the backend.</div>';
  const auditRows = audit.length ? listOrUnavailable(audit, '') : `<div class="risk-audit-cell"><span>Model source</span><strong>${esc(row.source ?? 'Not emitted')}</strong><small>${esc(row.horizon ?? 'Horizon not emitted')}</small></div>`;
  return `
    <header class="screen-head"><h1>Risk</h1><p>Backend model interpretation by disease domain. Missing model fields remain visibly unavailable.</p></header>
    <nav class="risk-domain-nav" role="tablist" aria-label="Risk domains">${model.risk.map((domain) => `<button type="button" data-risk-domain="${esc(domain.id)}" role="tab" aria-selected="${domain.id === selectedId}" class="${domain.id === selectedId ? 'on' : ''}"><strong>${esc(domain.label ?? domain.id)}</strong><span>${esc(displayValue(domain.display ?? domain.value, domain.units, domain.state))}</span></button>`).join('')}</nav>
    <section class="risk-dossier" role="tabpanel">
      <div class="risk-hero"><div><span class="risk-eyebrow">Risk interpretation</span><h2>${esc(interpretation ?? 'Interpretation not emitted by the backend.')}</h2><p>${esc(row.route_note ?? row.model_note ?? 'No additional interpretation was emitted.')}</p></div><div class="risk-scorecard"><span class="risk-eyebrow">Current read</span><strong>${esc(displayValue(row.display ?? row.value, row.units, row.state))}</strong><small>${esc(row.horizon ?? 'Horizon not emitted')}<br>${esc(row.source ?? 'Model provenance not emitted')}</small></div></div>
      <div class="risk-meaning-grid"><section><span>Actionable levers</span>${listOrUnavailable(levers, 'Not emitted by the backend.')}</section><section><span>Patient evidence</span>${listOrUnavailable(evidence, 'Patient evidence not emitted for this domain.')}</section><section><span>Confidence</span><div class="risk-fact"><strong>${esc(confidence ?? 'Not emitted')}</strong><small>${esc(row.confidence_note ?? 'No confidence note was emitted.')}</small></div></section></div>
      <section class="risk-next"><div class="risk-section-head"><h3>Clinical next moves</h3><span>backend-emitted only</span></div>${moves.length ? moves.map((move, index) => `<div class="risk-next-row"><span>${String(index + 1).padStart(2, '0')}</span><div><strong>${esc(itemText(move))}</strong><small>${esc(itemDetail(move) || 'No rationale emitted.')}</small></div></div>`).join('') : '<div class="truth-empty">Clinical next moves not emitted by the backend.</div>'}</section>
      <section class="risk-variables"><div class="risk-section-head"><h3>Variables</h3><span>geometry appears only when supplied</span></div>${variableRows}</section>
      <section class="risk-audit"><div class="risk-section-head"><h3>Model audit trail</h3><span>kept below clinical interpretation</span></div><div class="risk-audit-grid">${auditRows}</div></section>
    </section>`;
}

function vitalityRange(row) {
  const range = row.chart_range ?? row.range ?? row.axis_range;
  const min = Number(range?.min);
  const max = Number(range?.max);
  return Number.isFinite(min) && Number.isFinite(max) && max > min ? { min, max } : null;
}

function vitalityChart(row) {
  const range = vitalityRange(row);
  const value = Number(row.value);
  if (!range || !Number.isFinite(value)) return '';
  const yFor = (input) => 82 - ((Number(input) - range.min) / (range.max - range.min)) * 60;
  const y = yFor(value);
  const bands = Array.isArray(row.bands) ? row.bands : [];
  const bandGeometry = bands.map((band) => {
    const min = Number(band.min);
    const max = Number(band.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return '';
    const top = yFor(max);
    const height = yFor(min) - top;
    return `<rect class="chart-reference" x="8" y="${top}" width="264" height="${height}"><title>${esc(band.label ?? `${band.min} to ${band.max}`)}</title></rect>`;
  }).join('');
  const bandLabels = bands.map((band) => band.label).filter(Boolean).map((label) => `<span>${esc(label)}</span>`).join('');
  return `<div class="vitality-figure"><svg class="vitality-chart" viewBox="0 0 280 108" role="img" aria-label="${esc(row.label)} backend-ranged value">
    <line class="chart-grid" x1="8" y1="82" x2="272" y2="82"/><line class="chart-grid" x1="8" y1="22" x2="272" y2="22"/>
    ${bandGeometry}<path class="chart-line" d="M12 ${y} H218"/><circle class="chart-dot" cx="218" cy="${y}" r="5"/>
    <text class="chart-label" x="8" y="100">${esc(displayValue(range.min, row.units))}</text><text class="chart-label chart-label-end" x="272" y="100">${esc(displayValue(range.max, row.units))}</text><text class="chart-value" x="226" y="${y - 8}">${esc(displayValue(row.value, row.units))}</text>
  </svg>${bandLabels ? `<div class="chart-band-labels">${bandLabels}</div>` : ''}</div>`;
}

function vitalityView(model) {
  const outcomes = model.vitality.map((row) => `
    <article class="vitality-card">
      <div class="vitality-head"><div><span class="section-label">${esc(row.label ?? row.id)}</span><strong>${esc(displayValue(row.value, row.units, row.state))}</strong></div><span>${esc(stateText(row.state ?? 'measured'))}</span></div>
      ${vitalityChart(row)}
    </article>`).join('');
  return `<header class="screen-head"><h1>Vitality</h1><p>Current patient-reported and measured outcomes from the case artifact. Geometry appears only when the backend supplies a chart range.</p></header><section class="vitality-grid">${outcomes || empty('Vitality not measured or insufficient input.')}</section>`;
}

export function decisionReasonsForAction(action, taxonomy = getOverrideTaxonomy()) {
  return Array.isArray(taxonomy[action]?.reasons) ? [...taxonomy[action].reasons] : [];
}

export function decisionReasonOptionsHTML(action, selectedReason = null, taxonomy = getOverrideTaxonomy()) {
  const reasons = decisionReasonsForAction(action, taxonomy);
  const validSelected = reasons.includes(selectedReason) ? selectedReason : reasons[0];
  return reasons.map((reason) => `<option value="${esc(reason)}" ${reason === validSelected ? 'selected' : ''}>${esc(reason.replaceAll('_', ' '))}</option>`).join('');
}

function decisionForm(action, taxonomy, disabled) {
  const selectedAction = ['approve', 'defer', 'reject', 'modify'].includes(action.physician_decision) ? action.physician_decision : 'approve';
  const options = ['approve', 'defer', 'reject', 'modify'].map((key) => `<option value="${key}" ${selectedAction === key ? 'selected' : ''}>${esc(taxonomy[key].label)}</option>`).join('');
  const reasons = decisionReasonOptionsHTML(selectedAction, action.physician_reason_code, taxonomy);
  return `<form class="decision-form" data-edit-item="${esc(action.id)}">
    <label>Decision<select name="action" data-decision-action ${disabled ? 'disabled' : ''}>${options}</select></label>
    <label>Reason<select name="reason_code" data-decision-reason ${disabled ? 'disabled' : ''}>${reasons}</select></label>
    <label>Action wording<input name="value" value="${esc(action.what_to_do ?? action.action_phrase ?? '')}" ${disabled ? 'disabled' : ''}></label>
    <label>Physician rationale<input name="reason" placeholder="Required for audit" ${disabled ? 'disabled' : ''}></label>
    <button type="submit" ${disabled ? 'disabled' : ''}>Save decision</button>
    ${action.persisted_override_id ? `<small class="persisted-decision">Persisted: ${esc(stateText(selectedAction))}</small>` : ''}
  </form>`;
}

function releaseRail(state) {
  const preview = state.releasePackage;
  const previewReady = Boolean(preview);
  const authorized = preview?.release_state === 'authorized_not_released' || preview?.release_state === 'released_to_patient';
  const released = preview?.release_state === 'released_to_patient' && preview?.patient_visible === true;
  const reviewReady = state.reviewStarted;
  return `<aside class="release-rail">
    <section class="rail-card">
      <span class="section-label">Release sequence</span>
      <ol class="release-steps">
        <li class="${reviewReady ? 'complete' : 'current'}"><b>1</b><span>Review</span><small>${reviewReady ? 'started' : 'required'}</small></li>
        <li class="${previewReady ? 'complete' : reviewReady ? 'current' : ''}"><b>2</b><span>Preview</span><small>${previewReady ? 'ready' : 'blocked'}</small></li>
        <li class="${authorized ? 'complete' : previewReady ? 'current' : ''}"><b>3</b><span>Staging physician attestation</span><small>${authorized ? 'authorized' : 'required'}</small></li>
        <li class="${released ? 'complete' : authorized ? 'current' : ''}"><b>4</b><span>Release</span><small>${released ? 'patient visible' : 'blocked'}</small></li>
      </ol>
      <button data-release-action="request-preview" ${reviewReady && !released ? '' : 'disabled'}>Generate release preview</button>
      <label class="attestation"><input type="checkbox" data-physician-attestation ${previewReady && !released ? '' : 'disabled'}> I attest that I reviewed the case and release preview.</label>
      <button class="secondary" data-release-action="authorize" ${previewReady && !authorized && !released ? '' : 'disabled'}>Authorize release</button>
      <button data-release-action="release-backend" ${authorized && !released ? '' : 'disabled'}>Release to patient</button>
      <p class="gate-note">${released ? 'Released package is patient visible.' : previewReady ? 'Preview remains patient hidden until backend release succeeds.' : 'Backend preview required before attestation.'}</p>
      ${state.workflowStatus ? `<p class="status-line">${esc(state.workflowStatus)}</p>` : ''}
      ${state.workflowError ? `<p class="error-line">${esc(state.workflowError)}</p>` : ''}
    </section>
  </aside>`;
}

function carePlanView(model, state) {
  const taxonomy = getOverrideTaxonomy();
  const items = [...model.carePlan.required.map((item) => ({ ...item, planKind: 'problem' })), ...model.carePlan.actions.map((item) => ({ ...item, planKind: item.kind === 'diagnostic' ? 'order' : 'action' }))];
  const selected = items.find((item) => item.id === state.selectedPlanItemId) ?? null;
  const selectButton = (item, index, prefix) => `<button type="button" class="plan-item ${selected?.id === item.id ? 'selected' : ''}" data-plan-item="${esc(item.id)}" aria-pressed="${selected?.id === item.id}"><span class="plan-item-number">${prefix}${String(index + 1).padStart(2, '0')}</span><span><strong>${esc(item.title ?? item.label ?? item.id)}</strong><small>${esc(item.reason ?? item.why_it_matters ?? item.why_now ?? 'Clinical rationale not emitted.')}</small><em>${esc(item.source ?? item.provenance?.source_scored_item_id ?? 'Source not emitted')}${item.persisted_override_id ? ` · persisted ${esc(stateText(item.physician_decision))}` : ''}</em></span></button>`;
  const required = model.carePlan.required.map((item, index) => selectButton({ ...item, planKind: 'problem' }, index, 'P')).join('');
  const actions = model.carePlan.actions.map((item, index) => selectButton({ ...item, planKind: item.kind === 'diagnostic' ? 'order' : 'action' }, index, '')).join('');
  const noteOrders = Array.isArray(model.carePlan.note?.orders) ? model.carePlan.note.orders.map((order) => `<div class="note-order"><strong>${esc(typeof order === 'string' ? order : order.label ?? order.name ?? order.id)}</strong><small>Backend draft order</small></div>`).join('') : '';
  const addReasons = decisionReasonOptionsHTML('add_problem', null, taxonomy);
  const selectedRail = selected ? `<section class="rail-card selected-item-rail"><span class="section-label">Selected item · ${esc(selected.planKind)}</span><h2>${esc(selected.title ?? selected.label ?? selected.id)}</h2><p>${esc(selected.reason ?? selected.why_it_matters ?? selected.why_now ?? 'Clinical rationale not emitted.')}</p><small>${esc(selected.source ?? selected.provenance?.source_scored_item_id ?? 'Source not emitted')}</small>${state.reviewStarted ? decisionForm(selected, taxonomy, false) : '<div class="truth-empty">Start review to expose structured decision controls.</div>'}</section>` : '<section class="rail-card"><span class="section-label">Contextual action rail</span><div class="truth-empty">Select a problem, order, or action for its basis and disposition.</div></section>';
  return `
    <header class="screen-head"><div><h1>Care plan</h1><p>The bounded backend draft that will move through physician review and release.</p></div><button data-review-action="start" ${state.reviewStarted ? 'disabled' : ''}>${state.reviewStarted ? 'Review started' : 'Start review'}</button></header>
    <div class="care-layout"><div>
      <section class="plan-document"><div class="document-head"><div><span class="section-label">${esc(stateText(model.carePlan.state))}</span><h2>${esc(model.carePlan.title)}</h2></div><span>${esc(model.carePlan.id ?? 'Plan id not emitted')}</span></div><div class="document-inputs">${esc(model.carePlan.overview)}</div><div class="plan-body"><span class="plan-section-label">Assessment &amp; Plan</span><section class="plan-problem-group"><h3>Problems and obligations</h3>${required || '<div class="truth-empty">No problems or required obligations emitted.</div>'}</section><section class="plan-order-group"><h3>Orders in draft note</h3>${noteOrders || '<div class="truth-empty">No draft orders emitted.</div>'}</section><section class="plan-action-group"><h3>Recommended actions</h3>${actions || '<div class="truth-empty">No recommended actions emitted.</div>'}</section></div><footer class="document-signature">${esc(model.carePlan.note?.signature_status ?? 'Unsigned')} · physician decisions remain staged until backend release.</footer></section>
      ${state.releasePackage ? `<section class="preview-document"><span class="section-label">Release preview</span><h2>${esc(state.releasePackage.doctor_message ?? 'Doctor message missing')}</h2><p>${state.releasePackage.patient_visible ? 'Patient visible' : 'Not patient visible'}</p></section>` : ''}
    </div><aside class="care-rail">${selectedRail}<section class="rail-card physician-add"><span class="section-label">Add physician problem or order</span><form data-add-action><label>Type<select name="action" data-decision-action ${state.reviewStarted ? '' : 'disabled'}><option value="add_problem">Problem</option><option value="add_order">Order intent</option></select></label><label>Item<input name="value" placeholder="Physician-authored item" ${state.reviewStarted ? '' : 'disabled'}></label><label>Reason<select name="reason_code" data-decision-reason ${state.reviewStarted ? '' : 'disabled'}>${addReasons}</select></label><label>Rationale<input name="reason" placeholder="Required for audit" ${state.reviewStarted ? '' : 'disabled'}></label><button type="submit" ${state.reviewStarted ? '' : 'disabled'}>Add to review</button></form>${model.carePlan.additions.map((item) => `<small class="persisted-decision">Persisted ${esc(stateText(item.action))}: ${esc(item.patch?.title ?? item.patch?.label ?? item.patch?.what_to_do ?? item.target?.artifact_id ?? item.target?.id ?? item.override_id)}</small>`).join('')}</section>${releaseRail(state)}</aside></div>`;
}

function journalView(model) {
  const rows = model.journal.map((event) => `
    <article class="journal-entry"><div class="timeline-node"></div><div><span>${esc(event.timestamp ?? event.timestamp_utc ?? 'Timestamp missing')}</span><h2>${esc(stateText(event.event_name))}</h2><p>${esc(stateText(event.previous_state))} → ${esc(stateText(event.next_state))}</p><small>${esc(event.actor ?? 'Actor missing')} · ${esc(event.role ?? 'Role missing')}</small></div></article>`).join('');
  return `<header class="screen-head"><h1>Journal</h1><p>Immutable backend audit events and workflow transitions.</p></header><section class="journal-list">${rows || empty('No journal events recorded.')}</section>`;
}

function aiView(model) {
  const candidates = model.ai.candidates.map((candidate) => `<article class="ai-evidence"><h2>${esc(candidate.title ?? candidate.id)}</h2><p>${esc(stateText(candidate.state ?? 'candidate state missing'))}</p><small>Mapped artifact: ${esc(candidate.mapped_scored_item ?? 'Not mapped')} · cited inputs ${candidate.cited_keys_valid === true ? 'validated' : 'not validated'}</small></article>`).join('');
  return `<header class="screen-head"><h1>Aleron AI</h1><p>Case-grounded evidence only.</p></header><section class="ai-gate"><span class="section-label">Read-only gate</span><h2>${esc(model.ai.status)}</h2><p>No prompt composer is available. This surface does not create, rank, or alter clinical actions.</p></section><section class="ai-list">${candidates || empty('Aleron AI unavailable: no case-grounded candidate artifacts.')}</section>`;
}

function activeView(model, state) {
  if (state.activeTab === 'risk') return riskView(model, state);
  if (state.activeTab === 'vitality') return vitalityView(model);
  if (state.activeTab === 'care-plan') return carePlanView(model, state);
  if (state.activeTab === 'journal') return journalView(model);
  if (state.activeTab === 'aleron-ai') return aiView(model);
  return patientDataView(model);
}

export function renderLogin(app, error = null) {
  app.innerHTML = `<main class="login-shell"><section class="login-card"><div class="brand">aleron<span>MD</span></div><span class="section-label">Physician access</span><h1>Open the clinical instrument.</h1><p>Enter the one-time bearer token issued by the clinical backend. The token stays in this browser until sign out.</p><form data-login-form><label>Bearer token<input type="password" name="token" autocomplete="off" placeholder="session.…"></label><button type="submit">Continue</button></form>${error ? `<p class="error-line">${esc(error)}</p>` : ''}</section></main>`;
}

export function renderDashboard(app, state, model) {
  const initials = model.patient.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '--';
  const options = state.queue.map((task) => `<option value="${esc(task.patient_id)}" ${task.patient_id === state.activePatientId ? 'selected' : ''}>${esc(task.display_name ?? task.patient_id)}</option>`).join('');
  const nav = TAB_LABELS.map(([id, label]) => `<button data-tab="${id}" class="nav-item ${state.activeTab === id ? 'on' : ''}" aria-selected="${state.activeTab === id}">${icon(id)}${label}</button>`).join('');
  app.innerHTML = `<main class="dashboard-shell">
    <aside class="sidebar" aria-label="Dashboard sections"><div class="brand">aleron<span>MD</span></div><div class="case-picker"><div class="avatar">${esc(initials)}</div><div><select data-case-selector aria-label="Patient case">${options}</select><small>${esc(model.patient.code)} · ${esc(displayValue(model.patient.age, 'years'))}</small></div></div><div class="rule"></div><nav role="tablist" aria-label="Dashboard sections">${nav}</nav></aside>
    <section class="main-pane"><div class="runtime-source" aria-label="Runtime source">${state.source === 'fixture' ? 'FIXTURE MODE · synthetic data' : 'STAGING · authenticated'} · ${esc(model.schemaVersion)} <button data-sign-out>${state.source === 'fixture' ? 'Reload' : 'Sign out'}</button></div>${activeView(model, state)}</section>
  </main>`;
}
