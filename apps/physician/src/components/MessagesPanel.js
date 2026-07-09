function messageRows(threads = []) {
  if (!threads.length) return '<li>No backend message threads yet. Send a physician reply to create the care-team thread when the backend seam is available.</li>';
  return threads.map((thread) => `
    <li>
      <strong>${thread.thread_type ?? 'care_team'} · ${thread.thread_id}</strong>
      <span>${(thread.messages ?? []).length} messages</span>
      <small>${thread.context?.action_id ? `Action ${thread.context.action_id}` : thread.context?.release_id ? `Release ${thread.context.release_id}` : thread.created_at ?? 'created by backend'}</small>
      <ul class="message-list">
        ${(thread.messages ?? []).map((message) => `
          <li><b>${message.sender_role ?? message.sender?.role ?? 'unknown'}</b>: ${message.body}</li>
        `).join('')}
      </ul>
    </li>
  `).join('');
}

export function MessagesPanel({ threads = [], seamUnavailable = false, status, onSendReply }) {
  const node = document.createElement('section');
  node.className = 'panel messages-panel';
  node.innerHTML = `
    <div class="panel-heading">
      <p class="kicker">Messages</p>
      <h2>Physician reply seam.</h2>
      <p>Uses backend message-thread endpoints when available. The app does not route, triage, or synthesize clinical replies locally.</p>
    </div>
    ${seamUnavailable ? '<p class="error-line">Backend message seam unavailable for this environment.</p>' : ''}
    <ol class="thread-list">${messageRows(threads)}</ol>
    <form data-message-reply>
      <label>
        Physician reply
        <input name="body" placeholder="Reply through backend message seam" />
      </label>
      <button type="submit">Send physician reply</button>
    </form>
    ${status ? `<p class="status-line">${status}</p>` : ''}
  `;
  node.querySelector('[data-message-reply]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    onSendReply?.(data.get('body'));
  });
  return node;
}
