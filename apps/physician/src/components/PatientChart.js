function measurementRows(measurements) {
  return measurements.map((m) => `
    <tr>
      <th>${m.label}</th>
      <td>${m.value} <span>${m.units}</span></td>
      <td>${m.provenance}</td>
    </tr>
  `).join('');
}

function orderRows(orders = []) {
  if (!orders.length) return '<tr><td colspan="5">No backend diagnostic orders returned for this chart.</td></tr>';
  return orders.map((order) => `
    <tr>
      <th>${order.panel ?? order.order_type ?? order.order_id}</th>
      <td>${order.vendor ?? 'backend'}</td>
      <td>${order.status ?? order.state ?? 'unknown'}</td>
      <td>${order.updated_at ?? order.created_at ?? 'n/a'}</td>
      <td>${(order.result_refs ?? []).join(', ') || 'pending'}</td>
    </tr>
  `).join('');
}

function resultRows(results = []) {
  const observations = results.flatMap((result) => (result.observations ?? []).map((item) => ({ result, item })));
  if (!observations.length) return '<tr><td colspan="5">No normalized diagnostic result observations available.</td></tr>';
  return observations.map(({ result, item }) => `
    <tr>
      <th>${item.name ?? item.code}</th>
      <td>${item.value} <span>${item.unit ?? item.units}</span></td>
      <td>${result.vendor ?? 'backend'}</td>
      <td>${result.received_at ?? item.collected_at ?? 'n/a'}</td>
      <td>${item.source_result_id ?? result.result_id ?? 'n/a'}</td>
    </tr>
  `).join('');
}

export function PatientChart({ patientPacket, diagnosticOrders = null, diagnosticResults = null }) {
  const orders = diagnosticOrders ?? patientPacket.orders ?? [];
  const results = diagnosticResults ?? patientPacket.diagnostic_results ?? [];
  const age = patientPacket.age ? `${patientPacket.age.value} ${patientPacket.age.units}` : 'backend projection';
  const measurements = patientPacket.measurements ?? [];
  const familyHistory = patientPacket.family_history ?? [];
  const symptoms = patientPacket.symptoms ?? [];
  const node = document.createElement('section');
  node.className = 'panel chart-panel';
  node.innerHTML = `
    <div class="panel-heading">
      <p class="kicker">Patient chart</p>
      <h2>${patientPacket.display_name} · ${patientPacket.code ?? patientPacket.patient_id}</h2>
      <p>Renders patient packet facts with units and provenance. No clinical ranking occurs here.</p>
    </div>
    <div class="card-grid">
      <article class="stat-card"><span>Age</span><strong>${age}</strong></article>
      <article class="stat-card"><span>Sex</span><strong>${patientPacket.sex ?? 'backend projection'}</strong></article>
      <article class="stat-card"><span>Phenotype</span><strong>${patientPacket.phenotype ?? patientPacket.facts?.lifecycle_state ?? 'backend projection'}</strong></article>
    </div>
    <table class="data-table">
      <thead><tr><th>Clinical value</th><th>Value</th><th>Provenance</th></tr></thead>
      <tbody>${measurements.length ? measurementRows(measurements) : '<tr><td colspan="3">Patient facts are backend-projected for review without raw packet expansion.</td></tr>'}</tbody>
    </table>
    <div class="two-col">
      <article>
        <h3>Family history</h3>
        <ul>${familyHistory.map((item) => `<li>${item}</li>`).join('') || '<li>Not included in this projection.</li>'}</ul>
      </article>
      <article>
        <h3>Symptoms and wearables</h3>
        <ul>${symptoms.map((item) => `<li>${item}</li>`).join('') || '<li>Not included in this projection.</li>'}</ul>
      </article>
    </div>
    <article class="audit-box compact-box review-surface">
      <h3>Diagnostic order and result status</h3>
      <p>Backend-owned logistics and normalized result references. This surface displays status only and does not interpret results.</p>
      <table class="data-table compact-table">
        <thead><tr><th>Order</th><th>Vendor</th><th>Status</th><th>Updated</th><th>Result refs</th></tr></thead>
        <tbody>${orderRows(orders)}</tbody>
      </table>
      <table class="data-table compact-table">
        <thead><tr><th>Observation</th><th>Value</th><th>Vendor</th><th>Received</th><th>Result</th></tr></thead>
        <tbody>${resultRows(results)}</tbody>
      </table>
    </article>
  `;
  return node;
}
