import { RISK_DOMAINS } from './riskActionLibrary.js?v=risk-domain-action-space-v2';

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const PLOT_L = 240;
const PLOT_R = 660;
const ROW_H = 44;
const ROW_0 = 50;

// benefit% = (1 - HR/RR/adjusted RR) x 100; CI flips to [1-upper, 1-lower].
// RRR records are already percent reductions.
function benefit(action) {
  if (action.measure === 'RRR') {
    return { b: action.estimate, lo: action.lower, hi: action.upper };
  }
  return {
    b: (1 - action.estimate) * 100,
    lo: (1 - action.upper) * 100,
    hi: (1 - action.lower) * 100,
  };
}

function fmtEffect(action) {
  const m = action.measure === 'ADJUSTED_RR' ? 'adjusted RR' : action.measure;
  if (action.measure === 'RRR') return `RRR ${action.estimate}% [${action.lower}, ${action.upper}]`;
  return `${m} ${action.estimate} [${action.lower}, ${action.upper}]`;
}

function niceDomain(loB, hiB) {
  const dmin = loB >= 0 ? 0 : Math.floor((loB - 4) / 5) * 5;
  const dmax = Math.ceil((hiB + 4) / 5) * 5;
  const span = dmax - dmin;
  let step = 25;
  for (const candidate of [5, 10, 20, 25]) {
    if (span / candidate <= 6) { step = candidate; break; }
  }
  const ticks = [];
  for (let t = dmin; t <= dmax; t += step) ticks.push(t);
  if (!ticks.includes(0) && dmin < 0 && dmax > 0) ticks.push(0);
  return { dmin, dmax, ticks: ticks.sort((a, b) => a - b) };
}

function laneSvg(domain, laneDef, selectedSlug) {
  const vals = laneDef.actions.map(benefit);
  const loB = Math.min(...vals.map((v) => v.lo));
  const hiB = Math.max(...vals.map((v) => v.hi));
  const { dmin, dmax, ticks } = niceDomain(loB, hiB);
  const xOf = (v) => PLOT_L + ((v - dmin) / (dmax - dmin)) * (PLOT_R - PLOT_L);
  const n = laneDef.actions.length;
  const axisY = ROW_0 + n * ROW_H + 24;
  const height = axisY + 72;
  const parts = [];
  parts.push(`<svg viewBox="0 0 720 ${height}" role="img" aria-label="${esc(`${domain.title} actions, ${laneDef.label} lane, forest plot. X axis: relative benefit percent, scale ${dmin} to ${dmax}. Right column: ARR V1 matrix confidence.`)}">`);
  for (const t of ticks) {
    const cls = t === 0 ? 'rs-zero' : 'rs-grid';
    parts.push(`<line class="${cls}" x1="${xOf(t).toFixed(1)}" y1="24" x2="${xOf(t).toFixed(1)}" y2="${axisY}"></line>`);
  }
  parts.push(`<line class="rs-axis" x1="${PLOT_L}" y1="${axisY}" x2="${PLOT_R}" y2="${axisY}"></line>`);
  for (const t of ticks) {
    parts.push(`<text class="rs-tick" x="${xOf(t).toFixed(1)}" y="${axisY + 20}">${t}</text>`);
  }
  parts.push(`<text class="rs-axis-title" x="450" y="${axisY + 56}">Relative benefit (%)</text>`);
  parts.push('<text class="rs-col-head" x="712" y="22">Matrix confidence</text>');
  laneDef.actions.forEach((action, i) => {
    const { b, lo, hi } = benefit(action);
    const cy = ROW_0 + i * ROW_H;
    const crosses = lo < 0 ? ', interval crosses null' : '';
    const pressed = action.slug === selectedSlug;
    parts.push(`<g class="rs-mark" data-rs-action="${esc(action.slug)}" role="button" tabindex="0" aria-pressed="${pressed}" aria-label="${esc(`${action.key} ${action.name}, ${fmtEffect(action)}, matrix confidence ${action.confidence.toLowerCase()}${crosses}`)}">`);
    parts.push(`<text class="rs-name" x="8" y="${cy + 4}">${esc(`${action.key} · ${action.name}`)}</text>`);
    parts.push(`<line class="rs-whisker" x1="${xOf(lo).toFixed(1)}" y1="${cy}" x2="${xOf(hi).toFixed(1)}" y2="${cy}"></line>`);
    parts.push(`<line class="rs-cap" x1="${xOf(lo).toFixed(1)}" y1="${cy - 5}" x2="${xOf(lo).toFixed(1)}" y2="${cy + 5}"></line>`);
    parts.push(`<line class="rs-cap" x1="${xOf(hi).toFixed(1)}" y1="${cy - 5}" x2="${xOf(hi).toFixed(1)}" y2="${cy + 5}"></line>`);
    parts.push(`<circle cx="${xOf(b).toFixed(1)}" cy="${cy}" r="6"></circle>`);
    parts.push(`<text class="rs-conf" x="712" y="${cy + 4}">${esc(action.confidence)}</text>`);
    parts.push('</g>');
  });
  parts.push('</svg>');
  return parts.join('');
}

function findAction(domain, slug) {
  for (const lane of domain.lanes) {
    const found = lane.actions.find((a) => a.slug === slug);
    if (found) return { action: found, lane };
  }
  return null;
}

function normalizedActionId(value) {
  return String(value ?? '').trim().toLowerCase().replaceAll('-', '_');
}

function riskArrCoordinates(model) {
  return Array.isArray(model?.actionMap?.riskArrCoordinates)
    ? model.actionMap.riskArrCoordinates
    : [];
}

function coordinateForAction(model, action) {
  const slug = normalizedActionId(action?.slug);
  return riskArrCoordinates(model).find((coordinate) =>
    normalizedActionId(coordinate?.native_action_id) === slug
  ) ?? null;
}

function asFinite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function percent(value, digits = 1) {
  const number = asFinite(value);
  return number === null ? null : `${Number((number * 100).toFixed(digits))}%`;
}

function modelRowsWithBaseline(domain, coordinate) {
  if (!coordinate || coordinate.coordinate_status !== 'materialized') return domain.modelRows;
  const baseline = percent(coordinate.baseline?.probability);
  if (!baseline) return domain.modelRows;
  const horizon = asFinite(coordinate.baseline?.horizon_years);
  const display = horizon === null ? baseline : `${baseline} at ${Number(horizon)} years`;
  return domain.modelRows.map(([key, value]) =>
    key === 'Baseline risk' ? [key, display] : [key, value]
  );
}

function runtimeModelRows(model, domain) {
  const runtimeIds = new Set(domain.runtimeIds ?? [domain.modelId]);
  const emitted = (model?.risk ?? []).find((row) => runtimeIds.has(row.id));
  if (!emitted) return [];
  const rawValue = emitted.display ?? emitted.value;
  const state = emitted.state ?? emitted.calculation_state;
  const units = emitted.units ? ` ${emitted.units}` : '';
  const output = rawValue !== undefined && rawValue !== null
    ? `${rawValue}${units}`
    : state ? String(state).replaceAll('_', ' ') : 'Not emitted';
  return [
    ['Backend output', output],
    ['Runtime model', emitted.model_version ?? 'Not emitted'],
    ['Runtime note', emitted.route_note ?? emitted.model_note ?? emitted.note ?? 'Not emitted'],
  ];
}

function arrCard(selected, coordinate) {
  const key = `${selected.action.key} · ${selected.action.name} · ${selected.lane.label}`;
  if (!coordinate || coordinate.coordinate_status !== 'materialized') {
    const reason = coordinate?.blocked_reason === 'MISSING_TECHNIQUE_BINDING'
      ? 'No governed technique binding'
      : 'Compatible baseline risk not emitted for this patient';
    return `
        <section class="panel rs-arr" aria-label="Patient-conditioned benefit">
          <div class="rs-arr-key">${esc(key)}</div>
          <strong class="rs-arr-blocked-head">Absolute benefit not estimable for this patient</strong>
          <p class="rs-arr-blocked-note">${esc(reason)}. The relative effect stays in the plot below; no ARR or NNT is shown.</p>
        </section>`;
  }
  const baseline = percent(coordinate.baseline?.probability);
  const horizon = asFinite(coordinate.baseline?.horizon_years);
  const horizonText = horizon === null ? '' : ` over ${Number(horizon)} years`;
  const horizonAt = horizon === null ? '' : ` at ${Number(horizon)} years`;
  const arr = asFinite(coordinate.patient_coordinate?.arr);
  const nnt = asFinite(coordinate.patient_coordinate?.nnt);
  const scenarios = Array.isArray(coordinate.interval_scenarios) ? coordinate.interval_scenarios : [];
  const arrValues = scenarios.map((s) => asFinite(s?.arr)).filter((v) => v !== null);
  const nntValues = scenarios.map((s) => asFinite(s?.nnt)).filter((v) => v !== null);
  if (arr === null || baseline === null) {
    return `
        <section class="panel rs-arr" aria-label="Patient-conditioned benefit">
          <div class="rs-arr-key">${esc(key)}</div>
          <strong class="rs-arr-blocked-head">Absolute benefit not estimable for this patient</strong>
          <p class="rs-arr-blocked-note">The materialized coordinate is incomplete; no ARR or NNT is shown.</p>
        </section>`;
  }
  const arrPp = Number((arr * 100).toFixed(1));
  const arrRange = arrValues.length
    ? ` [${Number((Math.min(...arrValues) * 100).toFixed(1))}–${Number((Math.max(...arrValues) * 100).toFixed(1))}]`
    : '';
  const nntRange = nntValues.length
    ? `${Math.round(Math.min(...nntValues))}–${Math.round(Math.max(...nntValues))} across the interval`
    : '';
  const benefitPct = Number(benefit(selected.action).b.toFixed(1));
  const confidence = String(coordinate.matrix_confidence ?? selected.action.confidence ?? '').toUpperCase();
  const transport = typeof coordinate.transport_disclosure === 'string' && coordinate.transport_disclosure
    ? ` · ${coordinate.transport_disclosure}`
    : '';
  return `
        <section class="panel rs-arr" aria-label="Patient-conditioned benefit">
          <div class="rs-arr-main">
            <div class="rs-arr-key">${esc(key)}</div>
            <div class="rs-arr-answer"><span class="rs-arr-hero">${arrPp} fewer events</span><span class="rs-arr-per">per 100 patients${esc(horizonText)}</span></div>
            <div class="rs-arr-chain">${esc(baseline)} baseline${esc(horizonAt)} × ${esc(fmtEffect(selected.action))} (${benefitPct}% relative benefit) → ARR ${arrPp} percentage points${esc(arrRange)}</div>
          </div>
          <div class="rs-arr-side">
            <div class="rs-arr-nnt"><span class="rs-arr-nnt-value">${nnt === null ? 'NNT not emitted' : `NNT ${Math.round(nnt)}`}</span><span class="rs-arr-nnt-range">${esc(nntRange)}</span></div>
            <div class="rs-arr-conf">${esc(confidence.charAt(0) + confidence.slice(1).toLowerCase())} ARR translation confidence${esc(transport)}</div>
          </div>
        </section>`;
}

export function riskSpaceView(model, state) {
  const selectedDomainId = state.selectedRiskDomain
    ?? RISK_DOMAINS.find((d) => d.modelId === state.selectedRiskId)?.id;
  const domain = RISK_DOMAINS.find((d) => d.id === selectedDomainId) ?? RISK_DOMAINS[0];
  const selected = findAction(domain, state.selectedRiskAction) ?? { action: domain.lanes[0].actions[0], lane: domain.lanes[0] };
  const selectedCoordinate = coordinateForAction(model, selected.action);
  const domainCoordinate = selectedCoordinate ?? riskArrCoordinates(model).find((coordinate) =>
    coordinate?.coordinate_status === 'materialized' &&
    domain.lanes.some((lane) => lane.actions.some((action) =>
      normalizedActionId(action.slug) === normalizedActionId(coordinate?.native_action_id)
    ))
  ) ?? null;
  const hasMaterializedCoordinate = riskArrCoordinates(model).some((coordinate) => coordinate?.coordinate_status === 'materialized');

  const tabs = RISK_DOMAINS.map((d) => `<button type="button" id="risk-domain-tab-${esc(d.id)}" data-rs-domain="${esc(d.id)}" data-risk-domain="${esc(d.modelId)}" role="tab" aria-controls="risk-domain-panel" aria-selected="${d.id === domain.id}" tabindex="${d.id === domain.id ? '0' : '-1'}" class="rs-tab${d.id === domain.id ? ' on' : ''}">${esc(d.title)}<span class="rs-tab-count">${d.ready} / ${d.total} ready</span></button>`).join('');

  const modelRows = [...modelRowsWithBaseline(domain, domainCoordinate), ...runtimeModelRows(model, domain)]
    .map(([k, v]) => `<li><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></li>`).join('');

  const lanes = domain.lanes.map((laneDef) => `
    <div class="rs-lane">
      <div class="rs-lane-label"><strong>${esc(laneDef.label)}</strong><p>${esc(laneDef.blurb)}</p></div>
      <div class="rs-plot">${laneSvg(domain, laneDef, selected.action.slug)}</div>
    </div>`).join('');

  const tray = domain.tray.length ? `
    <section class="panel rs-tray"><div class="panel-head"><h3>Outside this plot</h3></div>
      <ul class="rs-model-list">${domain.tray.map(([name, reason, confidence]) => `<li><span class="k">${esc(name)}</span><span class="v">${esc(`${reason}${confidence ? ` Matrix confidence ${confidence}.` : ''}`)}</span></li>`).join('')}</ul>
    </section>` : '';

  const ledger = domain.lanes.flatMap((laneDef) => laneDef.actions.map((action) => `
    <div class="rs-ledger-row${action.slug === selected.action.slug ? ' selected' : ''}" data-rs-ledger="${esc(action.slug)}">
      <div class="rs-key">${esc(action.key)}</div>
      <div><div class="rs-action-name">${esc(action.name)}</div><div class="rs-action-detail">${esc(laneDef.label)}</div></div>
      <div class="rs-effect">${esc(fmtEffect(action))}</div>
      <div class="rs-confidence">Confidence · ${esc(action.confidence.charAt(0) + action.confidence.slice(1).toLowerCase())}</div>
    </div>`)).join('');

  return `
    <header class="screen-head"><div><h1>Risk</h1><p>${hasMaterializedCoordinate ? 'Patient-conditioned baseline risk and absolute risk reduction are emitted where endpoint-compatible.' : 'Native relative effects by disease domain. Baseline risk not yet emitted; absolute risk reduction appears when it is.'}</p></div></header>
    <nav class="rs-tabs" role="tablist" aria-label="Risk domains">${tabs}</nav>
    <div class="rs-workspace" id="risk-domain-panel" role="tabpanel" aria-labelledby="risk-domain-tab-${esc(domain.id)}">
      <section class="rs-main">
        <div class="rs-domain-intro"><h2>${esc(domain.title)}</h2><span>${domain.ready} production ready</span></div>
        <section class="panel rs-model"><div class="panel-head"><h3>Risk model state</h3></div>
          <div class="rs-model-block"><h4>${esc(domain.modelHead)}</h4><ul class="rs-model-list">${modelRows}</ul></div>
        </section>
        ${arrCard(selected, selectedCoordinate)}
        <section class="panel rs-space">
          <div class="panel-head"><h3>Action Space</h3><span>Dot: source estimate · whisker: 95% interval · right tag: ARR V1 matrix confidence</span></div>
          ${lanes}
          <p class="rs-axis-note">Relative benefit = (1 minus HR or RR) x 100. Position is comparable only within its endpoint lane. Matrix confidence grades ARR translation confidence per the ARR V1 classification matrix, not trial evidence quality.</p>
        </section>
        ${tray}
        <section class="panel rs-ledger"><div class="panel-head"><h3>Selected actions</h3><span>Native effect and confidence shown as independent fields</span></div>
          ${ledger}
        </section>
      </section>
    </div>`;
}
