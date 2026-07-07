export function AuditTrail({ auditLog = [], workflowEvents = [] }) {
  const combined = [...auditLog, ...workflowEvents];
  const releaseEvents = combined.filter((event) => ['release_preview_generated', 'plan_signed', 'plan_released', 'release_blocked'].includes(event.event_name)).length;
  const overrideEvents = combined.filter((event) => /recommendation_|structured_edit|override/.test(event.event_name)).length;
  const messageEvents = combined.filter((event) => event.event_name === 'message_sent').length;
  const events = combined.map((event) => {
    const actor = typeof event.actor === 'string' ? event.actor : event.actor?.actor_id;
    const role = event.role ?? event.actor?.role;
    const reason = event.reason ?? event.payload?.reason ?? event.metadata?.reason;
    const hash = event.payload_hash ? ` · hash ${event.payload_hash.slice(0, 12)}` : '';
    return `
      <li>
        <div>
          <strong>${event.event_name}</strong>
          <span>${event.previous_state ?? 'n/a'} to ${event.next_state ?? 'n/a'}</span>
        </div>
        <small>${event.timestamp} · ${actor ?? 'unknown actor'} · ${role ?? 'unknown role'}${hash}</small>
        ${reason ? `<em>${reason}</em>` : ''}
        <code>${(event.artifact_ids ?? event.source_artifact_ids ?? []).join(', ')}</code>
      </li>
    `;
  }).join('');

  const node = document.createElement('section');
  node.className = 'panel audit-panel';
  node.innerHTML = `
    <div class="panel-heading">
      <p class="kicker">Audit trail</p>
      <h2>Immutable boundary events.</h2>
      <p>Displays backend audit records plus local placeholder workflow events. This scaffold never mutates the fixture audit ledger.</p>
    </div>
    <div class="audit-metrics">
      <span><strong>${combined.length}</strong> total</span>
      <span><strong>${releaseEvents}</strong> release gate</span>
      <span><strong>${overrideEvents}</strong> overrides</span>
      <span><strong>${messageEvents}</strong> messages</span>
    </div>
    <ol class="audit-list">${events}</ol>
  `;
  return node;
}
