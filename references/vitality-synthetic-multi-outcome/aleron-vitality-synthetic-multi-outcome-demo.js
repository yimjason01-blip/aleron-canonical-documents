const OUTCOMES = ["energy", "mood", "body", "mind", "meaning"];
const OUTCOME_LABELS = { energy: "Energy", mood: "Mood", body: "Body", mind: "Mind", meaning: "Meaning" };
const AXIS_MAX = 20;
const RUNS_URL = "./vitality_synthetic_multi_outcome_runs_v1.json";

const state = {
  bundle: null,
  run: null,
  outcomeId: "energy",
  focusedMappingId: null,
  selectedMappingId: null,
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function assertAuthority(bundle) {
  if (!bundle || bundle.artifact?.synthetic !== true || bundle.artifact?.clinical_use !== "prohibited") {
    throw new Error("Synthetic run bundle failed its authority boundary.");
  }
  if (!Array.isArray(bundle.runs) || bundle.runs.length === 0) throw new Error("Synthetic run bundle has no witness cases.");
  bundle.runs.forEach((run) => {
    if (run.artifact?.synthetic !== true || run.artifact?.synthetic_patient !== true || run.artifact?.clinical_use !== "prohibited") {
      throw new Error(`Run ${run.artifact?.id || "unknown"} failed its authority boundary.`);
    }
    if (run.workflow_state?.comparison_scope !== "within_outcome_only") throw new Error("Comparison scope drifted outside one outcome.");
    if (!Array.isArray(run.mapping_results)) throw new Error("Run mapping results are missing.");
  });
}

function currentRows() {
  return state.run.mapping_results.filter((row) => row.outcome_id === state.outcomeId);
}

function eligibleRows() {
  return currentRows().filter((row) => row.eligibility_state === "eligible");
}

function excludedRows() {
  return currentRows().filter((row) => row.eligibility_state !== "eligible");
}

function mappingById(mappingId) {
  return state.run.mapping_results.find((row) => row.mapping_id === mappingId) || null;
}

function formatPeriod(period) {
  const min = period.minimum;
  const max = period.maximum;
  const quantity = ({ value, unit }) => `${value} ${value === 1 ? unit.replace(/s$/, "") : unit}`;
  if (min.value === max.value && min.unit === max.unit) return quantity(min);
  if (min.unit === max.unit) return `${min.value} to ${max.value} ${max.unit}`;
  return `${quantity(min)} to ${quantity(max)}`;
}

function formatBaseline() {
  const quantity = state.run.patient.baseline_outcomes[state.outcomeId];
  return `${quantity.value} synthetic points of 100`;
}

function resetSelection() {
  state.selectedMappingId = null;
  const first = eligibleRows()[0];
  state.focusedMappingId = first ? first.mapping_id : null;
}

function renderScenarioControl() {
  const select = document.getElementById("scenario-select");
  select.replaceChildren(...state.bundle.runs.map((run) => {
    const option = el("option", "", run.patient.label);
    option.value = run.artifact.source_case_id;
    option.selected = run.artifact.source_case_id === state.run.artifact.source_case_id;
    return option;
  }));
  document.getElementById("scenario-description").textContent = state.run.patient.description;
  const safety = document.getElementById("safety-state");
  const clear = state.run.workflow_state.safety_gate_state === "clear";
  safety.textContent = clear ? "Safety gates clear" : "Safety exit active";
  safety.classList.toggle("positive", !clear);
}

function renderOutcomeTabs() {
  const tabs = document.getElementById("outcome-tabs");
  tabs.replaceChildren(...OUTCOMES.map((outcomeId) => {
    const count = state.run.mapping_results.filter((row) => row.outcome_id === outcomeId && row.eligibility_state === "eligible").length;
    const button = el("button", "outcome-tab");
    button.type = "button";
    button.dataset.outcome = outcomeId;
    button.setAttribute("aria-selected", String(outcomeId === state.outcomeId));
    button.append(el("strong", "", OUTCOME_LABELS[outcomeId]), el("span", "", `${count} eligible Action${count === 1 ? "" : "s"}`));
    button.addEventListener("click", () => {
      state.outcomeId = outcomeId;
      resetSelection();
      render();
    });
    return button;
  }));
}

function confidenceMarkers(value) {
  const markers = el("span", "confidence-markers");
  markers.classList.add(`confidence-${value}`);
  markers.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 3; index += 1) markers.append(el("i"));
  return markers;
}

function confidenceCell(value) {
  const cell = el("span", "confidence-cell");
  cell.append(el("strong", "", `${value} confidence`), confidenceMarkers(value));
  return cell;
}

function effectCell(effect) {
  const cell = el("span", "effect-value");
  cell.append(
    el("strong", "", `+${effect.point} pts`),
    el("small", "effect-range", `${effect.interval.lower} to ${effect.interval.upper} pts`),
  );
  return cell;
}

function renderMap() {
  document.getElementById("outcome-title").textContent = OUTCOME_LABELS[state.outcomeId];
  document.getElementById("baseline-value").textContent = formatBaseline();
  const eligible = eligibleRows();
  const excluded = excludedRows();
  const context = document.getElementById("map-context");
  const map = document.getElementById("action-map");
  const selectionBlocked = state.run.workflow_state.selection_state === "blocked_safety_exit";

  if (selectionBlocked) {
    context.textContent = "Elective comparison stops before effect ordering when any safety gate is positive.";
    const notice = el("div", "empty-map");
    notice.append(el("strong", "", "No elective Action map"), el("span", "", "Resolve the safety exit before considering an outcome-matched Action."));
    map.replaceChildren(notice);
  } else {
    context.textContent = `${eligible.length} of ${eligible.length + excluded.length} primary-target mappings are eligible. Rows are ordered by illustrative effect within this outcome; confidence is shown beside every estimate and is never combined into a score.`;
    map.replaceChildren(...eligible.map((row) => {
      const button = el("button", `action-row${row.mapping_id === state.focusedMappingId ? " focused" : ""}`);
      button.type = "button";
      button.dataset.mappingId = row.mapping_id;
      const name = el("span", "action-name");
      name.append(el("strong", "", row.action_title), el("span", "", `Expected response in ${formatPeriod(row.response_period)}`));
      const track = el("span", "effect-track");
      const interval = el("span", "effect-interval");
      const lower = Math.max(0, Math.min(100, row.effect.interval.lower / AXIS_MAX * 100));
      const upper = Math.max(lower, Math.min(100, row.effect.interval.upper / AXIS_MAX * 100));
      interval.style.left = `${lower}%`;
      interval.style.width = `${upper - lower}%`;
      const point = el("span", "effect-point");
      point.style.left = `${Math.max(0, Math.min(100, row.effect.point / AXIS_MAX * 100))}%`;
      track.append(interval, point);
      button.append(
        name,
        track,
        effectCell(row.effect),
        confidenceCell(row.decision_dimensions.confidence),
      );
      button.addEventListener("click", () => {
        state.focusedMappingId = row.mapping_id;
        renderMap();
        renderDetail();
      });
      return button;
    }));
  }

  const excludedSection = document.getElementById("excluded-section");
  if (excluded.length === 0) {
    excludedSection.replaceChildren();
  } else {
    const details = el("details");
    const summary = el("summary", "", `${excluded.length} excluded mapping${excluded.length === 1 ? "" : "s"}`);
    const list = el("div", "excluded-list");
    excluded.forEach((row) => {
      const item = el("div", "excluded-item");
      item.append(el("strong", "", row.action_title), el("span", "", row.exclusion_reason.replaceAll("_", " ")));
      list.append(item);
    });
    details.append(summary, list);
    excludedSection.replaceChildren(details);
  }
}

function dimension(label, value) {
  const node = el("div", "dimension");
  node.append(el("span", "", label), el("strong", "", value));
  return node;
}

function renderDetail() {
  const panel = document.getElementById("detail-panel");
  const row = mappingById(state.focusedMappingId);
  if (!row || row.outcome_id !== state.outcomeId || row.eligibility_state !== "eligible") {
    const empty = el("div", "empty-detail");
    empty.append(el("h2", "", "No eligible Action"), el("p", "", "This outcome has no selectable Action in the current synthetic patient state."));
    panel.replaceChildren(empty);
    return;
  }

  const heading = el("div");
  heading.append(el("p", "section-kicker", `${OUTCOME_LABELS[row.outcome_id]} · synthetic mapping`), el("h2", "", row.action_title));
  const signals = el("div", "detail-signal-pair");
  const effectSignal = el("div", "detail-signal effect-signal");
  effectSignal.append(
    el("span", "signal-label", "Effect size"),
    el("strong", "", `+${row.effect.point} pts`),
    el("small", "", `Range ${row.effect.interval.lower} to ${row.effect.interval.upper} synthetic points of 100`),
  );
  const confidenceSignal = el("div", "detail-signal confidence-signal");
  confidenceSignal.append(
    el("span", "signal-label", "Confidence"),
    el("strong", "", row.decision_dimensions.confidence),
    confidenceMarkers(row.decision_dimensions.confidence),
    el("small", "", "Synthetic confidence, not evidence grade"),
  );
  signals.append(effectSignal, confidenceSignal);
  const secondaryHeading = el("p", "secondary-heading", "Other decision dimensions");
  const dimensions = el("div", "dimension-grid");
  dimensions.append(
    dimension("Burden", row.decision_dimensions.burden),
    dimension("Harm", row.decision_dimensions.harm),
    dimension("Feasibility", row.feasibility_state),
    dimension("Preference", row.preference_state),
    dimension("Urgency", row.decision_dimensions.urgency),
  );
  const copy = el("dl", "detail-copy");
  copy.append(el("dt", "", "Bounded Action"), el("dd", "", row.dose), el("dt", "", "Response period"), el("dd", "", formatPeriod(row.response_period)));
  const button = el("button", "primary-action", state.selectedMappingId === row.mapping_id ? "Selected for synthetic test" : "Select for synthetic test");
  button.type = "button";
  button.disabled = state.selectedMappingId === row.mapping_id;
  button.addEventListener("click", () => {
    if (row.outcome_id !== state.outcomeId || row.eligibility_state !== "eligible") return;
    state.selectedMappingId = row.mapping_id;
    renderDetail();
    renderReassessment();
  });
  panel.replaceChildren(heading, signals, secondaryHeading, dimensions, copy, button);
}

function renderReassessment() {
  const panel = document.getElementById("reassessment-panel");
  const row = mappingById(state.selectedMappingId);
  if (!row || row.outcome_id !== state.outcomeId || row.eligibility_state !== "eligible") {
    panel.classList.remove("active");
    const heading = el("div");
    heading.append(el("p", "section-kicker", "Reassessment"), el("h2", "", "No Action selected"));
    panel.replaceChildren(heading, el("p", "", "Choose an eligible Action to activate a synthetic, outcome-matched reassessment plan."));
    return;
  }
  panel.classList.add("active");
  const heading = el("div");
  heading.append(el("p", "section-kicker", "Active synthetic test"), el("h2", "", row.action_title));
  const facts = el("div", "reassessment-facts");
  const schedule = el("div");
  schedule.append(el("span", "", "Reassess"), el("strong", "", formatPeriod(row.response_period)));
  const threshold = el("div");
  threshold.append(el("span", "", "Meaningful change"), el("strong", "", `5 synthetic ${OUTCOME_LABELS[row.outcome_id]} points of 100`));
  facts.append(schedule, threshold);
  const reset = el("button", "reset-action", "Clear selection");
  reset.type = "button";
  reset.addEventListener("click", () => {
    state.selectedMappingId = null;
    renderDetail();
    renderReassessment();
  });
  panel.replaceChildren(heading, facts, reset);
}

function render() {
  renderScenarioControl();
  renderOutcomeTabs();
  renderMap();
  renderDetail();
  renderReassessment();
}

async function init() {
  try {
    const response = await fetch(RUNS_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Synthetic run bundle returned HTTP ${response.status}.`);
    state.bundle = await response.json();
    assertAuthority(state.bundle);
    state.run = state.bundle.runs[0];
    resetSelection();
    document.getElementById("scenario-select").addEventListener("change", (event) => {
      const next = state.bundle.runs.find((run) => run.artifact.source_case_id === event.target.value);
      if (!next) return;
      state.run = next;
      state.outcomeId = "energy";
      resetSelection();
      render();
    });
    render();
  } catch (error) {
    const fatal = document.getElementById("fatal-error");
    fatal.hidden = false;
    fatal.textContent = `Demo failed closed.\n\n${error.message}`;
    console.error(error);
  }
}

init();
