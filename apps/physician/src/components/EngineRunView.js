function rows(items = [], getMeta) {
  return items.map((item) => `
    <tr>
      <th>${item.label ?? item.title}</th>
      <td>${item.kind ?? item.type ?? 'required'}</td>
      <td>${getMeta(item)}</td>
      <td>${item.trace_status ?? item.source ?? item.provenance?.library_id ?? item.provenance?.source_scored_item_id ?? 'schema artifact'}</td>
    </tr>
  `).join('');
}

function valueFrame(item) {
  if (item.patient_value?.display_qaly !== undefined) {
    return `${item.patient_value.display_qaly} ${item.patient_value.unit ?? item.patient_value.units ?? ''}`;
  }
  if (item.patient_value_qaly?.value !== undefined) {
    return `${item.patient_value_qaly.value} ${item.patient_value_qaly.units ?? ''}`;
  }
  if (item.p_reclass || item.qaly_if_reclassified) {
    return `${item.p_reclass?.value ?? 'n/a'} ${item.p_reclass?.units ?? ''}; ${item.qaly_if_reclassified?.value ?? 'n/a'} ${item.qaly_if_reclassified?.units ?? ''}`;
  }
  return item.reason ?? 'n/a';
}

export function EngineRunView({ actionMapState, clinicalPlan, runAudit }) {
  const riskOutputs = actionMapState.risk_outputs ?? actionMapState.model_outputs?.risk_domains ?? [];
  const scoredItems = actionMapState.scored_items ?? [
    ...(actionMapState.optional_actions ?? []),
    ...(actionMapState.diagnostics ?? [])
  ];
  const aiCandidates = actionMapState.ai_candidates ?? actionMapState.ai_candidate_funnel ?? [];
  const requiredItems = actionMapState.required_items ?? [];
  const excludedItems = actionMapState.excluded_items ?? [];
  const vitalityOutputs = actionMapState.vitality_outputs ?? actionMapState.model_outputs?.vitality?.outcomes ?? [];
  const riskCards = riskOutputs.map((risk) => `
    <article class="stat-card">
      <span>${risk.label ?? risk.id}</span>
      <strong>${risk.display}</strong>
      <small>${[risk.horizon, risk.source].filter(Boolean).join(' · ')}</small>
    </article>
  `).join('');

  const node = document.createElement('section');
  node.className = 'panel engine-panel';
  node.innerHTML = `
    <div class="panel-heading">
      <p class="kicker">Engine artifacts</p>
      <h2>Render-only action map and clinical plan.</h2>
      <p>The UI consumes emitted artifacts. It does not promote AI candidates, select recommendations, or recompute values.</p>
    </div>
    <div class="artifact-strip">
      <code>${actionMapState.schema_version}</code>
      <code>${clinicalPlan.schema_version}</code>
      <code>${runAudit.schema_version}</code>
      <code>${actionMapState.run_id}</code>
    </div>
    <div class="card-grid">${riskCards}</div>
    <div class="card-grid small-card-grid">
      ${vitalityOutputs.map((item) => `<article class="stat-card"><span>${item.label}</span><strong>${item.value}</strong><small>${item.units}</small></article>`).join('')}
    </div>
    <table class="data-table">
      <thead><tr><th>Action map item</th><th>Kind</th><th>Value frame</th><th>Trace</th></tr></thead>
      <tbody>
        ${rows(actionMapState.required_items, (item) => item.reason)}
        ${rows(scoredItems, valueFrame)}
      </tbody>
    </table>
    <div class="two-col">
      <article>
        <h3>Required care gaps</h3>
        <ul>${requiredItems.map((item) => `<li>${item.label}: ${item.reason}</li>`).join('')}</ul>
        <h3>Excluded artifacts</h3>
        <ul>${excludedItems.map((item) => `<li>${item.label}: ${item.reason}</li>`).join('')}</ul>
      </article>
      <article>
        <h3>AI candidate funnel</h3>
        <ul>${aiCandidates.map((c) => `<li>${c.title ?? c.id}: ${c.state}${c.mapped_scored_item ? `, mapped to ${c.mapped_scored_item}` : ''}</li>`).join('')}</ul>
        <h3>Run audit</h3>
        <ul>${runAudit.checks.map((check) => `<li>${check.id ?? check.check_id}: ${check.status ?? (check.pass ? 'pass' : 'fail')}</li>`).join('')}</ul>
      </article>
    </div>
  `;
  return node;
}
