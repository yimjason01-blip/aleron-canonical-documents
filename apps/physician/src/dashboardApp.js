import { displayValue } from './dashboardAdapter.js?v=physician-action-space-v2';
import { formatTrendLine } from './wearableSummary.js?v=physician-action-space-v2';
import { getOverrideTaxonomy } from './apiClient.js';
import { recommendationTraceHTML, releasePreviewHTML } from './clinicalTrace.js';

const TAB_LABELS = [
  ['patient-data', 'Patient Data'],
  ['risk', 'Models'],
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

/** Soft-humanize snake_case event names for journal (keep clinical tokens readable). */
function humanizeEventName(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Event missing';
  if (!raw.includes('_') && /[A-Z]/.test(raw)) return raw;
  return raw
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAi\b/g, 'AI')
    .replace(/\bId\b/g, 'ID')
    .replace(/\bCkd\b/g, 'CKD')
    .replace(/\bKfre\b/g, 'KFRE');
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

function provenanceText(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Provenance missing';
  if (/synthetic_representative_fixture|synthetic representative/i.test(raw)) return 'Synthetic representative packet';
  if (/patient packet/i.test(raw)) return raw;
  return raw.replaceAll('_', ' ');
}

function sparklineSvg(values) {
  const nums = (values || []).map(Number).filter((n) => Number.isFinite(n));
  if (nums.length < 2) return '';
  const w = 88;
  const h = 22;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pts = nums.map((v, i) => {
    const x = (i / (nums.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="wearable-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${pts}"/></svg>`;
}

function dataRows(rows, { wearables = false } = {}) {
  return rows.map((row) => {
    const measure = esc(displayValue(row.value, row.units, row.state ?? row.status));
    if (!wearables) {
      return `
    <div class="data-row">
      <div><strong>${esc(row.label ?? row.key)}</strong><small class="provenance">${esc(provenanceText(row.provenance))}</small></div>
      <div class="measure">${measure}</div>
    </div>`;
    }
    const state = row.trend_state || 'snapshot_only';
    const trend = row.trend_line ? `<small class="trend-line trend-${esc(state)}">${esc(row.trend_line)}</small>` : '';
    const spark = sparklineSvg(row.sparkline);
    return `
    <div class="data-row wearable-row" data-trend-state="${esc(state)}">
      <div>
        <strong>${esc(row.label ?? row.key)}</strong>
        <small class="provenance">${esc(provenanceText(row.provenance))}</small>
        ${trend}
      </div>
      <div class="measure wearable-measure">
        ${spark}
        <span>${measure}</span>
      </div>
    </div>`;
  }).join('');
}

function contextItem(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return String(value ?? '');
  if (value.gene) return [value.gene, value.variant ?? value.genotype, value.classification, value.zygosity].filter(Boolean).join(' · ');
  if (value.condition || value.relation) {
    const onset = value.onset_age == null ? null : `onset ${value.onset_age}`;
    return [value.condition, value.relation, onset].filter(Boolean).join(' · ');
  }
  return value.label ?? value.title ?? value.name ?? value.value ?? JSON.stringify(value);
}

function contextRows(model) {
  const rows = [];
  if (model.patientData.familyHistory.length) rows.push({ label: 'Family history', value: model.patientData.familyHistory.map(contextItem).join('; '), provenance: 'patient packet' });
  if (model.patientData.symptoms.length) rows.push({ label: 'Symptoms', value: model.patientData.symptoms.map(contextItem).join('; '), provenance: 'patient packet' });
  if (model.patientData.genetics?.length) rows.push({ label: 'Genetics', value: model.patientData.genetics.map(contextItem).join('; '), provenance: 'patient packet · synthetic representative' });
  return rows;
}

function patientDataView(model) {
  // Density: omit empty clinical groups rather than rendering placeholder shelves.
  const instrumentNote = model.patientData.instrumentNote
    ? `<p class="wearable-instrument-note">${esc(model.patientData.instrumentNote)}</p>`
    : '';
  const coverage = model.patientData.wearableSummary?.coverage;
  const coverageLine = coverage
    ? `<p class="wearable-coverage">Coverage · nights ${esc(coverage.nights_28d ?? '—')} · step days ${esc(coverage.days_steps_28d ?? '—')}${coverage.last_sync_at ? ` · last sync ${esc(String(coverage.last_sync_at).slice(0, 16))}` : ''}</p>`
    : '';
  const groups = model.patientData.groups.map((group) => {
    const rows = group.id === 'context' ? [...group.measurements, ...contextRows(model)] : group.measurements;
    if (!rows.length) return '';
    const extra = group.id === 'wearables' ? `${instrumentNote}${coverageLine}` : '';
    return `<section class="data-group" data-clinical-group="${esc(group.id)}"><h2>${esc(group.label)}</h2>${extra}<div class="data-rows">${dataRows(rows, { wearables: group.id === 'wearables' })}</div></section>`;
  }).join('');
  const uncategorized = model.patientData.uncategorized.length
    ? `<section class="data-group" data-clinical-group="uncategorized"><h2>Other / Uncategorized</h2><div class="data-rows">${dataRows(model.patientData.uncategorized)}</div></section>`
    : '';
  const filledGroups = groups + uncategorized;
  const orders = model.patientData.orders.map((order) => `
    <div class="data-row compact">
      <div><strong>${esc(order.vendor ?? order.order_type ?? 'Order')}</strong><small class="provenance">${esc(stateText(order.panel ?? order.order_id ?? 'Panel missing'))}</small></div>
      <div class="status-word status-baseline">${esc(stateText(order.status ?? order.state ?? 'pending'))}</div>
    </div>`).join('');
  const summary = model.patientData.summary;
  const summaryHtml = summary ? `<section class="input-summary"><span class="section-label">Input readiness</span><div class="summary-grid"><div><span>Completeness</span><strong>${esc(summary.completeness ?? 'Not emitted')}</strong></div><div><span>Recency</span><strong>${esc(summary.recency ?? 'Not emitted')}</strong></div><div><span>Provenance</span><strong>${esc(summary.provenance ?? 'Not emitted')}</strong></div><div><span>Missingness</span><strong>${esc(summary.missingness ?? 'None emitted')}</strong></div></div>${Array.isArray(summary.abnormal_findings) && summary.abnormal_findings.length ? `<p><strong>Abnormal findings</strong> ${esc(summary.abnormal_findings.join(' · '))}</p>` : ''}</section>` : `<section class="input-summary integrity-error"><strong>Input readiness summary not emitted by backend.</strong></section>`;
  return `
    <header class="screen-head"><div><h1>Patient data</h1><p>Identity, signals, and the labs the models read from — governed by packet schema and wearable history requirements.</p></div></header>
    ${summaryHtml}
    <section class="instrument-panel patient-data-panel">
      <div class="patient-line"><strong>${esc(model.patient.name)}</strong>${model.patient.code && model.patient.code !== 'Code missing' ? `<span>${esc(model.patient.code)}</span>` : ''}<span>${esc(displayValue(model.patient.age, 'years'))}</span><span>${esc(model.patient.sex ?? 'Sex missing')}</span>${model.patient.phenotype ? `<span>${esc(model.patient.phenotype)}</span>` : ''}</div>
      <div class="clinical-groups">${filledGroups || empty('Not measured or insufficient input.')}</div>
    </section>
    <section class="instrument-panel"><div class="panel-head"><h2>Orders</h2><span>Backend order state</span></div>${orders || empty('No lab orders on this synthetic case')}</section>`;
}

function riskView(model, state) {
  if (!model.risk.length) return `<header class="screen-head"><div><h1>Risk</h1><p>Model interpretation by disease domain.</p></div></header>${empty('Risk outputs unavailable. Insufficient input or model run pending.')}`;
  const selectedId = state.selectedRiskId && model.risk.some((row) => row.id === state.selectedRiskId) ? state.selectedRiskId : model.risk[0].id;
  const row = model.risk.find((candidate) => candidate.id === selectedId);
  const domainShort = {
    prevent_base_representative: 'Cardiovascular',
    metabolic_qdiabetes_representative: 'Metabolic',
    kidney_ckd_representative: 'Kidney',
    neuro_cogdrisk_representative: 'Neuro',
    cancer_site_engines_representative: 'Cancer',
  };
  const domainTitle = (domain) => domainShort[domain.id] ?? domain.label ?? domain.id;
  const emittedList = (value) => Array.isArray(value) ? value : [];
  const itemText = (item) => typeof item === 'string' ? item : item?.label ?? item?.title ?? item?.name ?? item?.value ?? 'Unavailable';
  const itemDetail = (item) => typeof item === 'object' ? item?.detail ?? item?.reason ?? item?.why ?? item?.source ?? (item?.value !== undefined ? displayValue(item.value, item.units, item.state) : '') : '';
  const levers = emittedList(row.actionable_levers ?? row.levers ?? row.modifiable_drivers);
  const evidence = emittedList(row.patient_evidence ?? row.evidence ?? row.inputs ?? row.patient_inputs);
  const moves = emittedList(row.clinical_next_moves ?? row.next_moves);
  const variables = emittedList(row.variables ?? row.model_variables);
  const audit = emittedList(row.model_audit_trail ?? row.audit_trail ?? row.outputs);
  const interpretation = row.risk_interpretation ?? row.interpretation ?? row.summary ?? row.detail;
  const confidence = row.confidence?.display ?? row.confidence?.label ?? row.confidence ?? row.confidence_note;
  const riskDisplayFor = (domain) => displayValue(
    domain.display ?? domain.value,
    domain.units,
    domain.state ?? domain.calculation_state,
    { modelNote: domain.model_note ?? domain.route_note }
  );
  const listOrUnavailable = (items, unavailable) => items.length ? items.map((item) => `<div class="risk-fact"><strong>${esc(itemText(item))}</strong>${itemDetail(item) ? `<small>${esc(itemDetail(item))}</small>` : ''}</div>`).join('') : `<div class="truth-empty">${esc(unavailable)}</div>`;
  const variableRows = variables.length ? variables.map((variable) => {
    const geometry = variable.geometry ?? {};
    const position = Number(geometry.position_percent ?? variable.position_percent);
    const hasGeometry = Number.isFinite(position) && (variable.range || variable.axis_range || geometry.range);
    return `<div class="risk-variable"><div><strong>${esc(variable.label ?? variable.name ?? variable.id)}</strong><small>${esc(displayValue(variable.display ?? variable.value, variable.units, variable.state))}</small></div>${hasGeometry ? `<div class="variable-track" style="--pos:${Math.max(0, Math.min(100, position))}%" aria-label="Backend-provided variable geometry"><i></i></div>` : ''}</div>`;
  }).join('') : '<div class="truth-empty">Variable detail not emitted by the backend.</div>';
  const auditRows = audit.length ? listOrUnavailable(audit, '') : `<div class="risk-audit-cell"><span>Model source</span><strong>${esc(row.source ?? 'Not emitted')}</strong><small>${esc(row.horizon ?? 'Horizon not emitted')}</small></div>`;
  return `
    <header class="screen-head"><div><h1>Risk</h1><p>Model interpretation by disease domain. Missing fields stay visible.</p></div></header>
    <nav class="risk-domain-nav" role="tablist" aria-label="Risk domains">${model.risk.map((domain) => {
      const modelFamily = String(domain.model_version ?? domain.label ?? '').match(/PREVENT|FINDRISC|KFRE|CAIDE|cancer/i)?.[0] ?? '';
      return `<button type="button" data-risk-domain="${esc(domain.id)}" role="tab" aria-selected="${domain.id === selectedId}" class="${domain.id === selectedId ? 'on' : ''}"><span class="risk-domain-copy"><strong>${esc(domainTitle(domain))}</strong>${modelFamily ? `<small>${esc(modelFamily)}</small>` : ''}</span><span>${esc(riskDisplayFor(domain))}</span></button>`;
    }).join('')}</nav>
    <section class="risk-dossier" role="tabpanel">
      <div class="risk-hero"><div><span class="risk-eyebrow">Risk interpretation · ${esc(domainTitle(row))}</span><h2>${esc(interpretation ?? 'Interpretation not emitted by the backend.')}</h2><p>${esc(row.route_note ?? row.model_note ?? 'No additional interpretation was emitted.')}</p><small class="model-version-line">${esc(row.model_version ?? 'Model version not emitted')} · ${esc(row.label ?? row.id)}${row.canonical ? ` · <a class="truth-inline" href="${esc(row.canonical.href || '#')}" target="_blank" rel="noopener noreferrer">${esc(row.canonical.label)}</a> <code class="truth-path">${esc(row.canonical.repoPath)}</code>` : ''}</small></div><div class="risk-scorecard"><span class="risk-eyebrow">Current read</span><strong>${esc(riskDisplayFor(row))}</strong><small>${esc(row.horizon ?? 'Horizon not emitted')}<br>${esc(row.source ?? 'Model provenance not emitted')}</small></div></div>
      ${(() => {
        const meaningBits = [];
        if (levers.length) meaningBits.push(`<section><span>Actionable levers</span>${listOrUnavailable(levers, '')}</section>`);
        if (evidence.length) meaningBits.push(`<section><span>Patient evidence</span>${listOrUnavailable(evidence, '')}</section>`);
        if (confidence) meaningBits.push(`<section><span>Confidence</span><div class="risk-fact"><strong>${esc(confidence)}</strong><small>${esc(row.confidence?.note ?? row.confidence_note ?? '')}</small></div></section>`);
        return meaningBits.length ? `<div class="risk-meaning-grid">${meaningBits.join('')}</div>` : '';
      })()}
      ${moves.length ? `<section class="risk-next"><div class="risk-section-head"><h3>Clinical next moves</h3></div>${moves.map((move, index) => `<div class="risk-next-row"><span>${String(index + 1).padStart(2, '0')}</span><div><strong>${esc(itemText(move))}</strong><small>${esc(itemDetail(move) || '')}</small></div></div>`).join('')}</section>` : ''}
      ${variables.length ? `<section class="risk-variables"><div class="risk-section-head"><h3>Variables</h3></div>${variableRows}</section>` : ''}
      <section class="risk-audit"><div class="risk-section-head"><h3>Model audit trail</h3></div><div class="risk-audit-grid">${auditRows}</div></section>
    </section>`;
}

const ACTION_SPACE_EVIDENCE = [
  ['unverified', 'Unverified'],
  ['see_library', 'Library pending'],
  ['moderate', 'Moderate'],
  ['strong', 'Strong'],
  ['missing', 'Unverified'],
];

function actionSpaceCategory(item) {
  if (item.kind === 'diagnostic') return { id: 'diagnostics', label: 'Diagnostics' };
  if (item.kind !== 'action') return null;
  const explicit = String(item.category ?? '').trim();
  return explicit ? { id: `category:${explicit.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, label: explicit } : { id: 'actions', label: 'Actions' };
}

function actionSpaceValue(value) {
  if (!Number.isFinite(value)) return 'Not plottable';
  return `${Number(value.toFixed(4))} QALY`;
}

function actionSpaceView(model, state) {
  const records = model.actionMap.items ?? [];
  const plottable = records.filter((item) => item.plottable);
  const groups = [];
  for (const item of plottable) {
    const group = actionSpaceCategory(item);
    if (group && !groups.some((entry) => entry.id === group.id)) groups.push(group);
  }
  const filters = [{ id: 'all', label: 'All' }, ...groups.sort((left, right) => (left.id === 'diagnostics' ? -1 : right.id === 'diagnostics' ? 1 : 0))];
  const activeFilter = filters.some((filter) => filter.id === state.actionSpaceFilter) ? state.actionSpaceFilter : 'all';
  const visible = plottable.filter((item) => activeFilter === 'all' || actionSpaceCategory(item)?.id === activeFilter);
  const selectedId = visible.some((item) => item.id === state.selectedActionSpaceItemId) ? state.selectedActionSpaceItemId : null;
  const evidenceIndex = (item) => item.evidenceCategory === 'missing' ? 0 : Math.max(0, ACTION_SPACE_EVIDENCE.slice(0, 4).findIndex(([id]) => id === item.evidenceCategory));
  const values = visible.map((item) => item.expectedValueQaly);
  const min = Math.min(0, ...values);
  const max = Math.max(0.01, ...values);
  const span = max - min || 1;
  const laneCounts = new Map();
  const xFor = (item) => {
    const lane = evidenceIndex(item);
    const order = laneCounts.get(lane) ?? 0;
    laneCounts.set(lane, order + 1);
    const spread = order === 0 ? 0 : Math.ceil(order / 2) * 14 * (order % 2 ? 1 : -1);
    return 90 + lane * 170 + spread;
  };
  const yFor = (item) => 300 - ((item.expectedValueQaly - min) / span) * 240;
  const marks = visible.map((item) => {
    const x = xFor(item);
    const y = yFor(item);
    const selected = item.id === selectedId;
    const shape = item.kind === 'diagnostic'
      ? `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="1"/>`
      : `<circle cx="${x}" cy="${y}" r="7"/>`;
    return `<g data-action-space-mark="${esc(item.id)}" role="button" tabindex="0" aria-label="${esc(`${item.label ?? item.id}, ${actionSpaceValue(item.expectedValueQaly)}`)}" aria-pressed="${selected}" data-mark-kind="${esc(item.kind)}" class="action-space-mark ${selected ? 'selected ' : ''}${esc(item.disposition ?? 'staged')}" transform="translate(0 0)">${shape}${selected ? `<circle class="selection-ring" cx="${x}" cy="${y}" r="13"/>` : ''}<title>${esc(item.label ?? item.id)} · ${esc(actionSpaceValue(item.expectedValueQaly))}</title></g>`;
  }).join('');
  const labels = ACTION_SPACE_EVIDENCE.slice(0, 4).map(([, label], index) => `<text x="${90 + index * 170}" y="334" text-anchor="middle">${esc(label)}</text>`).join('');
  const ledger = visible.map((item) => `<button type="button" data-action-space-item="${esc(item.id)}" aria-pressed="${item.id === selectedId}" class="action-space-ledger-row ${item.id === selectedId ? 'selected' : ''}"><span class="mark-key ${esc(item.kind)}" aria-hidden="true"></span><span><strong>${esc(item.label ?? item.id)}</strong><small>${esc(item.source ?? 'Source not emitted')} · ${esc(item.decisionLogic ?? 'Decision logic not emitted')}</small></span><span><strong>${esc(actionSpaceValue(item.expectedValueQaly))}</strong><small>${esc(item.evidenceCategory === 'see_library' ? 'library pending' : item.evidenceCategory)}</small></span></button>`).join('');
  const adjacent = (title, items, kind) => `<section class="action-space-adjacent" data-action-space-${kind}><h3>${title}</h3>${items.length ? items.map((item) => `<div data-adjacent-item="${esc(item.id)}"><strong>${esc(item.label ?? item.id)}</strong><small>${esc(item.reason ?? item.source ?? item.id)}</small></div>`).join('') : empty(`No ${title.toLowerCase()} emitted.`)}</section>`;
  const nonPlottable = records.filter((item) => !item.plottable);
  return `<header class="screen-head"><div><h1>Action Space</h1><p>Expected patient value by categorical evidence state. Actions plot expected net value; diagnostics plot probability of reclassification multiplied by QALY if reclassified.</p></div></header>
    <div class="action-space-boundary">Technically rendered does not mean clinically promoted. Values remain staged pending clinical promotion.</div>
    <nav class="action-space-filters" aria-label="Action Space categories">${filters.map((filter) => `<button type="button" data-action-space-filter="${esc(filter.id)}" aria-pressed="${filter.id === activeFilter}" class="${filter.id === activeFilter ? 'on' : ''}">${esc(filter.label)} <span>${filter.id === 'all' ? plottable.length : plottable.filter((item) => actionSpaceCategory(item)?.id === filter.id).length}</span></button>`).join('')}</nav>
    <section class="action-space-layout"><div class="action-space-map"><div class="panel-head"><h2>Categorical action map</h2><span>Expected QALY</span></div><svg viewBox="0 0 720 360" role="img" aria-label="Expected QALY by categorical evidence"><line x1="58" y1="300" x2="690" y2="300"/><text x="20" y="28">Expected QALY ↑</text>${labels}${marks}${visible.length ? '' : '<text x="360" y="180" text-anchor="middle">No plotted items for this filter</text>'}</svg></div><div class="action-space-ledger"><div class="panel-head"><h2>Evidence ledger</h2><span>${visible.length} plotted</span></div>${ledger || empty('No plotted items for this filter.')}</div></section>
    <section class="action-space-audit"><h2>Adjacent audit</h2>${adjacent('Non-plottable records', nonPlottable, 'nonplottable')}${adjacent('Required obligations', model.actionMap.required ?? [], 'required')}${adjacent('Excluded items', model.actionMap.excluded ?? [], 'excluded')}</section>`;
}

function modelsView(model, state) {
  const pane = state.selectedModelPane === 'action-space' ? 'action-space' : 'models';
  return `<nav class="model-pane-nav" role="tablist" aria-label="Models views"><button type="button" data-model-pane="models" role="tab" aria-selected="${pane === 'models'}" class="${pane === 'models' ? 'on' : ''}">Models</button><button type="button" data-model-pane="action-space" role="tab" aria-selected="${pane === 'action-space'}" class="${pane === 'action-space' ? 'on' : ''}">Action Space</button></nav>${pane === 'action-space' ? actionSpaceView(model, state) : riskView(model, state)}`;
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

const DEVICE_INSTRUMENT_ORDER = [
  ['resting_hr', 'Resting heart rate (RHR)', 'bpm'],
  ['hrv_rmssd', 'HRV (rMSSD)', 'ms'],
  ['hrv_sdnn', 'HRV (SDNN)', 'ms'],
  ['sleep_duration', 'Sleep duration', 'h'],
  ['steps', 'Steps', 'count'],
  ['active_minutes', 'Active minutes', 'min'],
  ['vo2max', 'VO₂ max', 'mL/kg/min'],
];

/**
 * Subordinate corroborator panel for Vitality tab when wearables density is met.
 * Not a score — felt baseline still required to unblock vitality protocol scoring.
 */
function deviceInstrumentsPanel(model) {
  const summary = model.patientData?.wearableSummary;
  if (!summary?.windows) return '';
  const lines = [];
  for (const [metric, label, unit] of DEVICE_INSTRUMENT_ORDER) {
    const entry = summary.windows[metric];
    if (!entry) continue;
    const densityMet = entry.density_met === true
      || entry['7d']?.density_met === true
      || entry['30d']?.density_met === true;
    if (!densityMet) continue;
    const window = entry['7d']?.density_met ? entry['7d'] : (entry['30d'] || entry['7d']);
    const formatted = formatTrendLine(window, unit);
    lines.push({ metric, label, text: formatted.text, state: formatted.state });
  }
  if (!lines.length) return '';
  const rows = lines.map((line) => `
    <div class="device-instrument-row" data-metric="${esc(line.metric)}" data-trend-state="${esc(line.state)}">
      <strong>${esc(line.label)}</strong>
      <span class="trend-line trend-${esc(line.state)}">${esc(line.text)}</span>
    </div>`).join('');
  return `
    <section class="instrument-panel device-instruments-panel" data-device-instruments>
      <div class="panel-head">
        <h2>Device instruments (corroborators)</h2>
        <span>7d / 30d trends · not a score</span>
      </div>
      <div class="device-instruments-body">
        <p class="wearable-instrument-note">Felt baseline still required. Device instruments corroborate recovery and sleep; they do not unblock the vitality score.</p>
        <div class="device-instrument-list">${rows}</div>
      </div>
    </section>`;
}

function vitalityView(model) {
  const outcomes = model.vitality.map((row) => {
    const missing = Array.isArray(row.missing_inputs) && row.missing_inputs.length
      ? `<p class="vitality-missing"><strong>Inputs still required:</strong> ${row.missing_inputs.map((item) => esc(String(item).replaceAll('_', ' '))).join(', ')}</p>`
      : '';
    const note = row.model_note ? `<p class="vitality-note">${esc(row.model_note)}</p>` : '';
    const version = row.model_version ? `<small>Model ${esc(row.model_version)}</small>` : '';
    return `
    <article class="vitality-card">
      <div class="vitality-head"><div><span class="section-label">${esc(row.label ?? row.id)}</span><strong>${esc(displayValue(row.value, row.units, row.state))}</strong>${row.units ? `<small class="vitality-unit">${esc(String(row.units).replaceAll('_',' '))}</small>` : ''}</div><span>${esc(stateText(row.state ?? 'measured'))}</span></div>
      ${vitalityChart(row)}${note}${missing}${version}
    </article>`;
  }).join('');
  const instruments = deviceInstrumentsPanel(model);
  return `<header class="screen-head"><div><h1>Vitality</h1><p>Within-person protocol state, not a composite score. Safety and dominant gates triage only with required subjective inputs.</p></div></header><section class="vitality-grid">${outcomes || empty('Vitality not measured or insufficient input.')}</section>${instruments}`;
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

function releaseRail(model, state) {
  const workflow = model.workflow;
  const preview = state.releasePackage ?? workflow.releasePackage;
  const released = workflow.released;
  const authorized = !released && workflow.releaseState === 'authorized_not_released';
  const previewReady = !released && workflow.release.preview_ready === true && Boolean(preview);
  const reviewReady = model.analysis.readyForReview && state.reviewStarted;
  const trustBlocked = workflow.release.authorizationBlocked;
  if (released) return `<aside class="release-rail"><section class="rail-card release-closure"><span class="section-label">Release complete</span><h2>Released to patient</h2><p>Patient visible · read only</p><small>${esc(workflow.release.released_at ?? preview?.released_at ?? 'Release timestamp not emitted')}</small><details class="released-preview"><summary>View exact released preview</summary>${releasePreviewHTML(preview)}</details>${state.workflowStatus ? `<p class="status-line">${esc(state.workflowStatus)}</p>` : ''}</section></aside>`;
  const blockerText = trustBlocked ? `Authorization blocked: ${workflow.release.trustBlockers.join(', ')} not emitted.` : '';
  return `<aside class="release-rail"><section class="rail-card">
    <span class="section-label">Preview · attest · release</span>
    <h2>${trustBlocked ? 'Authorization blocked' : 'Release evidence'}</h2>
    ${blockerText ? `<p class="integrity-error">${esc(blockerText)}</p>` : ''}
    ${releasePreviewHTML(preview)}
    <ol class="release-steps"><li class="${reviewReady ? 'complete' : 'current'}"><b>1</b><span>Review</span><small>${reviewReady ? 'started' : 'required'}</small></li><li class="${previewReady ? 'complete' : ''}"><b>2</b><span>Exact preview</span><small>${previewReady ? 'ready' : 'not ready'}</small></li><li class="${authorized ? 'complete' : ''}"><b>3</b><span>Attest</span><small>${authorized ? 'authorized' : 'pending'}</small></li><li><b>4</b><span>Release</span><small>pending</small></li></ol>
    <button data-release-action="request-preview" ${reviewReady ? '' : 'disabled'}>Generate release preview</button>
    <label class="attestation"><input type="checkbox" data-physician-attestation ${reviewReady && previewReady && !trustBlocked ? '' : 'disabled'}> I attest that I reviewed this exact preview and gating evidence.</label>
    <button class="secondary" data-release-action="authorize" ${reviewReady && previewReady && !authorized && !trustBlocked ? '' : 'disabled'}>Authorize release</button>
    <button data-release-action="release-backend" ${reviewReady && authorized && !trustBlocked ? '' : 'disabled'}>Release to patient</button>
    ${state.workflowStatus ? `<p class="status-line">${esc(state.workflowStatus)}</p>` : ''}${state.workflowError ? `<p class="error-line">${esc(state.workflowError)}</p>` : ''}
  </section></aside>`;
}

function modelVersionSummary(model) {
  const versions = model.analysis?.modelVersions ?? { risk: {}, vitality: {} };
  const risk = Object.entries(versions.risk ?? {}).map(([id, version]) => `${id}: ${version}`);
  const vitality = Object.entries(versions.vitality ?? {}).map(([id, version]) => `${id}: ${version}`);
  const lines = [...risk, ...vitality];
  if (!lines.length) return '<small class="model-version-line">Model versions not emitted</small>';
  return `<small class="model-version-line" data-model-versions>${esc(lines.join(' · '))}</small>`;
}

function isCaseReleased(model) {
  return model.workflow?.released === true;
}

function analysisGate(model, state) {
  const analysis = model.analysis;
  const ready = analysis.readyForReview;
  const released = isCaseReleased(model, state);
  // When released, don't surface the false "review not started" story.
  const visibleBlockers = (released
    ? analysis.blockerCodes.filter((code) => !/review_not_started|already_released/i.test(String(code)))
    : analysis.blockerCodes
  ).map(stateText);
  const details = [...visibleBlockers, ...analysis.errors.map(stateText), ...analysis.warnings.map(stateText)];
  const headline = released ? 'Released · read only' : ready ? 'Review ready' : 'Review blocked';
  const body = released
    ? 'This case was released to the patient. Structured decisions are closed; review content remains visible for audit.'
    : ready
    ? 'Canonical analysis is complete enough to begin physician review.'
    : (details.join(' · ') || 'readiness not ready');
  return `<section class="rail-card" data-analysis-gate>
    <span class="section-label">Canonical analysis · ${esc(stateText(analysis.status))}</span>
    <h2>${esc(headline)}</h2>
    <p class="${ready || released ? 'status-line' : 'boundary-banner signal-hazard'}">${esc(body)}</p>
    ${modelVersionSummary(model)}
    <button data-review-action="start" ${ready && !state.reviewStarted && !released ? '' : 'disabled'}>${released ? 'Released · read only' : state.reviewStarted && ready ? 'Review started' : 'Start review'}</button>
  </section>`;
}


function carePlanSource(item) {
  const source = item.source
    ?? item.provenance?.source
    ?? item.provenance?.source_scored_item_id
    ?? item.provenance_summary
    ?? null;
  if (!source) return 'Source not emitted';
  return typeof source === 'string' ? source : String(source.source ?? source);
}

function carePlanView(model, state) {
  const taxonomy = getOverrideTaxonomy();
  const items = [...model.carePlan.required.map((item) => ({ ...item, planKind: 'problem' })), ...model.carePlan.actions.map((item) => ({ ...item, planKind: item.kind === 'diagnostic' ? 'order' : 'action' }))];
  const selected = items.find((item) => item.id === state.selectedPlanItemId) ?? null;
  const selectButton = (item, index, prefix) => `<button type="button" class="plan-item ${selected?.id === item.id ? 'selected' : ''}" data-plan-item="${esc(item.id)}" aria-pressed="${selected?.id === item.id}"><span class="plan-item-number">${prefix}${String(index + 1).padStart(2, '0')}</span><span><strong>${esc(item.title ?? item.label ?? item.id)}</strong><small>${esc(item.reason ?? item.why_it_matters ?? item.why_now ?? 'Clinical rationale not emitted.')}</small><em>${esc(carePlanSource(item))}${item.persisted_override_id ? ` · persisted ${esc(stateText(item.physician_decision))}` : ''}</em></span></button>`;
  const required = model.carePlan.required.map((item, index) => selectButton({ ...item, planKind: 'problem' }, index, 'P')).join('');
  const actions = model.carePlan.actions.map((item, index) => selectButton({ ...item, planKind: item.kind === 'diagnostic' ? 'order' : 'action' }, index, '')).join('');
  const noteOrders = Array.isArray(model.carePlan.note?.orders) ? model.carePlan.note.orders.map((order) => `<div class="note-order"><strong>${esc(typeof order === 'string' ? order : order.label ?? order.name ?? order.id)}</strong><small>Backend draft order</small></div>`).join('') : '';
  const addReasons = decisionReasonOptionsHTML('add_problem', null, taxonomy);
  const caseReleased = isCaseReleased(model, state);
  const reviewActive = model.analysis.readyForReview && state.reviewStarted && !caseReleased;
  const selectedRail = selected ? `<section class="rail-card selected-item-rail"><span class="section-label">Selected item · ${esc(selected.planKind)}</span><h2>${esc(selected.title ?? selected.label ?? selected.id)}</h2><p>${esc(selected.reason ?? selected.why_it_matters ?? selected.why_now ?? 'Clinical rationale not emitted.')}</p><small>${esc(carePlanSource(selected))}</small>${reviewActive ? decisionForm(selected, taxonomy, false) : '<div class="truth-empty">Start review to expose structured decision controls.</div>'}</section>${recommendationTraceHTML(model, selected)}` : recommendationTraceHTML(model, null);
  return `
    <header class="screen-head"><div><h1>Care plan</h1><p>Library-derived obligations from the deterministic engine — not freeform generative clinical text.</p></div></header>
    ${analysisGate(model, state)}
    <div class="care-layout"><div>
      <section class="plan-document"><div class="document-head"><div><span class="section-label">${esc(caseReleased ? 'released · read only' : stateText(model.carePlan.state))}</span><h2>${esc(model.carePlan.title)}</h2></div><span>${esc(model.carePlan.id ?? 'Plan id not emitted')}</span></div><div class="document-inputs">${esc(model.carePlan.overview)}</div><div class="plan-body"><span class="plan-section-label">Assessment &amp; Plan</span><section class="plan-problem-group"><h3>Problems and obligations</h3>${required || '<div class="truth-empty">No problems or required obligations emitted.</div>'}</section><section class="plan-order-group"><h3>Orders in draft note</h3>${noteOrders || '<div class="truth-empty">No draft orders emitted.</div>'}</section><section class="plan-action-group"><h3>Recommended actions</h3>${actions || '<div class="truth-empty">No recommended actions emitted.</div>'}</section></div><footer class="document-signature">${caseReleased ? 'Released to patient · patient visible · read only' : `${esc(model.carePlan.note?.signature_status ?? 'Unsigned')} · physician decisions remain staged until backend release.`}</footer></section>
    </div><aside class="care-rail">${selectedRail}<section class="rail-card physician-add"><span class="section-label">Add physician problem or order</span><form data-add-action><label>Type<select name="action" data-decision-action ${reviewActive ? '' : 'disabled'}><option value="add_problem">Problem</option><option value="add_order">Order intent</option></select></label><label>Item<input name="value" placeholder="Physician-authored item" ${reviewActive ? '' : 'disabled'}></label><label>Reason<select name="reason_code" data-decision-reason ${reviewActive ? '' : 'disabled'}>${addReasons}</select></label><label>Rationale<input name="reason" placeholder="Required for audit" ${reviewActive ? '' : 'disabled'}></label><button type="submit" ${reviewActive ? '' : 'disabled'}>Add to review</button></form>${model.carePlan.additions.map((item) => `<small class="persisted-decision">Persisted ${esc(stateText(item.action))}: ${esc(item.patch?.title ?? item.patch?.label ?? item.patch?.what_to_do ?? item.target?.artifact_id ?? item.target?.id ?? item.override_id)}</small>`).join('')}</section>${releaseRail(model, state)}</aside></div>`;
}

function journalActor(event) {
  const actor = event?.actor;
  if (typeof actor === 'string' && actor.trim()) return actor;
  if (actor && typeof actor === 'object') {
    return actor.actor_id ?? actor.id ?? actor.role ?? event.actor_id ?? event.actor_type ?? 'Actor missing';
  }
  return event?.actor_id ?? event?.actor_type ?? 'Actor missing';
}

function journalRole(event) {
  if (typeof event?.role === 'string' && event.role.trim()) return event.role;
  const actor = event?.actor;
  if (actor && typeof actor === 'object' && actor.role) return actor.role;
  return event?.actor_type ?? 'Role missing';
}

function journalView(model) {
  const integrity = model.workflow.auditIntegrity;
  const integrityErrors = Array.isArray(integrity?.errors) ? integrity.errors : [];
  const rows = model.journal.map((event) => {
    const timestamp = event.timestamp ?? event.timestamp_utc ?? event.created_at;
    const before = event.previous_state ?? event.state_before;
    const after = event.next_state ?? event.state_after;
    const eventId = event.event_id ?? event.id;
    const valid = timestamp && before && after && eventId && before !== 'unknown' && after !== 'unknown';
    if (!valid) return `<article class="journal-entry integrity-error"><div class="timeline-node"></div><div><span>Audit integrity error</span><h2>${esc(humanizeEventName(event.event_name ?? event.event_type ?? event.event))}</h2><p>Required chronology fields are missing.</p><small>${esc(eventId ?? 'Event ID missing')}</small></div></article>`;
    return `<article class="journal-entry"><div class="timeline-node"></div><div><span>${esc(timestamp)}</span><h2>${esc(humanizeEventName(event.event_name ?? event.event_type ?? event.event))}</h2><p>${esc(stateText(before))} → ${esc(stateText(after))}</p><small>${esc(journalActor(event))} · ${esc(journalRole(event))} · ${esc(eventId)}</small></div></article>`;
  }).join('');
  const banner = integrity?.status === 'pass' ? '' : `<section class="audit-integrity integrity-error"><h2>Audit integrity error</h2><p>${esc(integrityErrors.join(' · ') || 'Backend audit integrity status was not emitted.')}</p></section>`;
  return `<header class="screen-head"><div><h1>Journal</h1><p>Backend audit events and workflow transitions.</p></div></header>${banner}<section class="journal-list">${rows || empty('No journal events recorded.')}</section>`;
}

function aiView(model) {
  const candidates = model.ai.candidates.map((candidate) => `<article class="ai-evidence"><h2>${esc(candidate.title ?? candidate.id)}</h2><p>${esc(stateText(candidate.state ?? 'candidate state missing'))}</p><small>Mapped artifact: ${esc(candidate.mapped_scored_item ?? 'Not mapped')} · cited inputs ${candidate.cited_keys_valid === true ? 'validated' : 'not validated'}</small></article>`).join('');
  return `<header class="screen-head"><div><h1>Aleron AI</h1><p>Case-grounded evidence only.</p></div></header><section class="ai-gate"><span class="section-label">Read-only gate</span><h2>${esc(model.ai.status)}</h2><p>Read-only evidence surface. No prompt composer.</p></section><section class="ai-list">${candidates || empty('No AI candidates for this release gate (read-only)')}</section>`;
}

function activeView(model, state) {
  if (state.activeTab === 'risk') return modelsView(model, state);
  if (state.activeTab === 'vitality') return vitalityView(model);
  if (state.activeTab === 'care-plan') return carePlanView(model, state);
  if (state.activeTab === 'journal') return journalView(model);
  if (state.activeTab === 'aleron-ai') return aiView(model);
  return patientDataView(model);
}

export function queueOptionLabel(task) {
  const name = String(task?.display_name ?? '').trim();
  const patientId = String(task?.patient_id ?? '').trim();
  const shortId = patientId ? patientId.replace(/^member_/, '').slice(0, 8) : '';
  const lifecycle = String(task?.lifecycle_state ?? '').trim().replaceAll('_', ' ');
  const when = String(task?.last_event_at ?? '').trim();
  const day = when ? when.slice(0, 10) : '';
  const base = name || patientId || 'Unknown patient';
  // Email-only display names collide when the same address has multiple member rows.
  const parts = [base];
  if (shortId) parts.push(shortId);
  if (lifecycle) parts.push(lifecycle);
  if (day) parts.push(day);
  return parts.join(' · ');
}

function patientInitials(name) {
  const raw = String(name ?? '').trim();
  if (!raw) return '--';
  if (raw.includes('@')) {
    const local = raw.split('@')[0] || raw;
    return local.slice(0, 2).toUpperCase();
  }
  return raw.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '--';
}

export function renderEmptyStaging(app) {
  app.innerHTML = `<main class="login-shell"><section class="login-card empty-staging-card"><div class="brand">aleron<span>MD</span></div><span class="section-label">STAGING · NONCLINICAL</span><h1>No patient cases yet.</h1><p>Complete mobile onboarding to create the first staging case. It will appear here automatically when its packet and analysis are ready for physician review.</p><button type="button" data-refresh-empty>Refresh cases</button></section></main>`;
}

export function renderDashboard(app, state, model) {
  const initials = patientInitials(model.patient.name);
  const options = state.queue.map((task) => `<option value="${esc(task.patient_id)}" ${task.patient_id === state.activePatientId ? 'selected' : ''}>${esc(queueOptionLabel(task))}</option>`).join('');
  const nav = TAB_LABELS.map(([id, label]) => `<button data-tab="${id}" class="nav-item ${state.activeTab === id ? 'on' : ''}" aria-selected="${state.activeTab === id}">${icon(id)}${label}</button>`).join('');
  app.innerHTML = `<main class="dashboard-shell">
    <aside class="sidebar" aria-label="Dashboard sections"><div class="brand">aleron<span>MD</span></div><div class="case-picker"><div class="avatar">${esc(initials)}</div><div><select data-case-selector aria-label="Patient case">${options}</select><small>${model.patient.code ? `${esc(model.patient.code)} · ` : ''}${esc(displayValue(model.patient.age, 'years'))}</small></div></div><div class="rule"></div><nav role="tablist" aria-label="Dashboard sections">${nav}</nav></aside>
    <section class="main-pane">${activeView(model, state)}</section>
  </main>`;
}
