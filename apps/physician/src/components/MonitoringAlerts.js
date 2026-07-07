function alertRows(alerts = []) {
  if (!alerts.length) {
    return '<tr><td colspan="7">No backend monitoring alerts require review.</td></tr>';
  }
  return alerts.map((alert) => `
    <tr>
      <th>${alert.title ?? alert.alert_id}</th>
      <td><span class="status hazard">${alert.severity ?? 'review_required'}</span></td>
      <td>${alert.review_status ?? 'pending_physician_review'}</td>
      <td>${alert.trigger ?? alert.event_type ?? 'backend_alert'}</td>
      <td>${alert.source_action_id ?? alert.source ?? 'monitoring'}</td>
      <td>${alert.created_at ?? 'n/a'}</td>
      <td>${alert.updated_at ?? alert.reviewed_at ?? 'pending'}</td>
    </tr>
    <tr>
      <td colspan="7" class="muted-row">${alert.description ?? alert.note ?? 'No description provided.'}</td>
    </tr>
  `).join('');
}

export function MonitoringAlerts({ alerts = [] }) {
  const pendingCount = alerts.filter((alert) => (alert.review_status ?? 'pending_physician_review') === 'pending_physician_review').length;
  const highCount = alerts.filter((alert) => ['high', 'urgent', 'hazard'].includes(alert.severity)).length;
  const node = document.createElement('section');
  node.className = 'panel monitoring-panel';
  node.innerHTML = `
    <div class="panel-heading">
      <p class="kicker">Monitoring review</p>
      <h2>Review-required monitoring alerts.</h2>
      <p>Reads backend alert state after patient action progress or monitoring updates. The released patient plan is unchanged until the backend release path runs again.</p>
    </div>
    <div class="audit-metrics">
      <span><strong>${alerts.length}</strong> alerts</span>
      <span><strong>${pendingCount}</strong> pending review</span>
      <span><strong>${highCount}</strong> high severity</span>
    </div>
    <table class="data-table compact-table">
      <thead><tr><th>Alert</th><th>Severity</th><th>Review status</th><th>Trigger</th><th>Source</th><th>Created</th><th>Updated</th></tr></thead>
      <tbody>${alertRows(alerts)}</tbody>
    </table>
  `;
  return node;
}
