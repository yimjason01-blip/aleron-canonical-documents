import { createStructuredEdit, getOverrideTaxonomy } from '../apiClient.js';

function reasonOptions(reasons) {
  return reasons.map((reason) => `<option value="${reason}">${reason.replaceAll('_', ' ')}</option>`).join('');
}

function taxonomyControls(item, taxonomy) {
  const actionOptions = Object.entries(taxonomy).map(([key, config]) => `<option value="${key}">${config.label}</option>`).join('');
  const reasonGroups = Object.entries(taxonomy).map(([key, config]) => `
    <label data-reason-group="${key}" class="reason-group ${key === 'approve' ? 'is-active' : ''}">
      Reason taxonomy for ${config.label}
      <select name="reason_code_${key}">${reasonOptions(config.reasons)}</select>
    </label>
  `).join('');
  return `
    <form data-edit-item="${item.id}">
      <label>
        Decision
        <select name="action" data-override-action>
          ${actionOptions}
        </select>
      </label>
      ${reasonGroups}
      <label>
        Patient-facing action phrase, only if wording changes
        <input name="value" value="${item.what_to_do ?? item.action_phrase ?? ''}" />
      </label>
      <label>
        Physician rationale note
        <input name="reason" placeholder="Required for audit" />
      </label>
      <button type="submit">Record structured override</button>
    </form>
  `;
}

export function PlanEditor({ clinicalPlan, edits, onEdit }) {
  const taxonomy = getOverrideTaxonomy();
  const requiredRows = (clinicalPlan.required_items ?? []).map((item) => `<li>${item.label}: ${item.reason}</li>`).join('');
  const recommendedNextSteps = clinicalPlan.recommended_next_steps ?? [];
  const recommendationRows = recommendedNextSteps.map((item) => {
    const latest = [...edits].reverse().find((edit) => edit.item_id === item.id);
    return `
      <article class="plan-item">
        <div>
          <h3>${item.title ?? item.label}</h3>
          <p>${item.why_it_matters ?? item.why_now}</p>
          <small>${item.source ?? item.provenance?.source_scored_item_id ?? 'clinical_plan'} · ${item.trace_status ?? 'schema artifact'} · cites ${(item.cited_patient_keys ?? item.provenance?.patient_keys ?? []).join(', ')}</small>
          ${latest ? `<div class="decision-chip">${latest.action} · ${latest.reason_code}</div>` : '<div class="decision-chip muted-chip">No physician override recorded</div>'}
        </div>
        ${taxonomyControls(item, taxonomy)}
      </article>
    `;
  }).join('');

  const node = document.createElement('section');
  node.className = 'panel editor-panel';
  node.innerHTML = `
    <div class="panel-heading">
      <p class="kicker">Plan editor</p>
      <h2>Structured decisions, not clinical recomputation.</h2>
      <p>Approve, defer, reject, and hold decisions create backend override records with taxonomy reasons. Recommendation selection and ranking remain owned by the backend and engine artifacts.</p>
    </div>
    <div class="two-col editor-context">
      <article>
        <h3>Clinical overview</h3>
        <p>${clinicalPlan.clinical_overview}</p>
      </article>
      <article>
        <h3>Required items</h3>
        <ul>${requiredRows}</ul>
      </article>
    </div>
    <div class="plan-list">${recommendationRows}</div>
    <article class="audit-box">
      <h3>Local draft override records</h3>
      <pre>${JSON.stringify(edits, null, 2)}</pre>
    </article>
  `;

  node.querySelectorAll('[data-override-action]').forEach((select) => {
    select.addEventListener('change', () => {
      const form = select.closest?.('form') ?? select.parentElement?.parentElement;
      form?.querySelectorAll?.('[data-reason-group]')?.forEach((group) => {
        group.className = `reason-group ${group.dataset.reasonGroup === select.value ? 'is-active' : ''}`;
      });
    });
  });

  node.querySelectorAll('form[data-edit-item]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const action = data.get('action') || 'approve';
      try {
        const value = data.get('value');
        const edit = createStructuredEdit({
          itemId: form.dataset.editItem,
          field: value ? 'action_phrase' : 'decision',
          value,
          action,
          reasonCode: data.get(`reason_code_${action}`),
          reason: data.get('reason')
        });
        onEdit(edit);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  return node;
}
