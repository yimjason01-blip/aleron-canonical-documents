const stateLabels = {
  physician_review_pending: 'Review pending',
  physician_review_started: 'Review started',
  plan_editing: 'Plan editing',
  physician_hold: 'Physician hold',
  monitoring_update_requires_review: 'Monitoring review required'
};

export function Queue({ queue, source = 'fixture', activePatientId, onOpen }) {
  const rows = queue.map((task) => `
    <button class="queue-row ${task.patient_id === activePatientId ? 'is-active' : ''}" data-open-patient="${task.patient_id}">
      <span>
        <strong>${task.display_name}</strong>
        <small>${task.code} · ${stateLabels[task.lifecycle_state] ?? task.lifecycle_state}</small>
      </span>
      <span>
        <span class="status ${task.blocker ? 'hazard' : ''}">${task.blocker ?? task.release_state}</span>
        <small>${task.last_event_at}</small>
      </span>
    </button>
  `).join('');

  const node = document.createElement('section');
  node.className = 'panel queue-panel';
  node.innerHTML = `
    <div class="panel-heading">
      <p class="kicker">Queue</p>
      <h2>Review work by lifecycle state and blocker.</h2>
      <p>Reads backend-owned queue state. Opening a chart starts review in the real app.</p>
    </div>
    <div class="queue-summary">
      <strong>${queue.length}</strong>
      <span>${source === 'backend' ? 'backend tasks' : 'fixture tasks'}</span>
    </div>
    <div class="queue-list">${rows}</div>
  `;

  node.querySelectorAll('[data-open-patient]').forEach((button) => {
    button.addEventListener('click', () => onOpen(button.dataset.openPatient));
  });

  return node;
}
