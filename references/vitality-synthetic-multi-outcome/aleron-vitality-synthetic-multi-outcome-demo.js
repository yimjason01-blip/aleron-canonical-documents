const OUTCOMES = ["energy", "mood", "body", "mind", "meaning"];
const OUTCOME_LABELS = { energy: "Energy", mood: "Mood", body: "Body", mind: "Mind", meaning: "Meaning" };
const AXIS_MAX = 20;
const CONFIDENCE_ORDER = ["very_low", "low", "moderate", "high"];
const SVG_NS = "http://www.w3.org/2000/svg";
const RUNS_URL = "vitality_synthetic_multi_outcome_runs_v1.json";

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

const svgEl = (tag, className, attrs = {}, text) => {
  const node = document.createElementNS(SVG_NS, tag);
  if (className) node.setAttribute("class", className);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
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
  state.focusedMappingId = null;
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
  for (let index = 0; index < 4; index += 1) markers.append(el("i"));
  return markers;
}

function confidenceLabel(value) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function markerLabel(index) {
  return String.fromCharCode(65 + index);
}

function focusMapping(mappingId) {
  state.focusedMappingId = mappingId;
  renderMap();
  renderDetail();
}

function renderActionGraph(rows) {
  const compact = window.matchMedia("(max-width: 640px)").matches;
  const width = compact ? 360 : 760;
  const height = compact ? 520 : 500;
  const margin = compact
    ? { top: 24, right: 18, bottom: 82, left: 48 }
    : { top: 24, right: 28, bottom: 76, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const laneWidth = plotWidth / CONFIDENCE_ORDER.length;
  const xFor = (confidence) => margin.left + (CONFIDENCE_ORDER.indexOf(confidence) + 0.5) * laneWidth;
  const yFor = (value) => margin.top + (AXIS_MAX - value) / AXIS_MAX * plotHeight;

  const wrapper = el("div", "action-graph");
  const svg = svgEl("svg", "action-graph-svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${OUTCOME_LABELS[state.outcomeId]} fixture Actions plotted by interface confidence category on the x-axis and illustrative expected change from synthetic baseline on the y-axis`,
  });

  CONFIDENCE_ORDER.forEach((confidence, laneIndex) => {
    svg.append(svgEl("rect", laneIndex % 2 === 0 ? "confidence-lane" : "confidence-lane alternate", {
      x: margin.left + laneIndex * laneWidth,
      y: margin.top,
      width: laneWidth,
      height: plotHeight,
      "aria-hidden": "true",
    }));
  });

  const effectAxis = svgEl("g", "effect-axis");
  [0, 5, 10, 15, 20].forEach((value) => {
    const y = yFor(value);
    effectAxis.append(
      svgEl("line", "graph-grid-line", { x1: margin.left, x2: width - margin.right, y1: y, y2: y }),
      svgEl("text", "graph-tick-label", { x: margin.left - 12, y: y + 4, "text-anchor": "end" }, `${value} pts`),
    );
  });
  const axisTitleX = compact ? 12 : 18;
  effectAxis.append(svgEl("text", "graph-axis-title", {
    x: axisTitleX,
    y: margin.top + plotHeight / 2,
    transform: `rotate(-90 ${axisTitleX} ${margin.top + plotHeight / 2})`,
    "text-anchor": "middle",
  }, "Illustrative expected change (outcome-local points of 100)"));
  svg.append(effectAxis);

  const confidenceAxis = svgEl("g", "confidence-axis");
  CONFIDENCE_ORDER.forEach((confidence) => {
    const x = xFor(confidence);
    confidenceAxis.append(
      svgEl("line", "confidence-guide", { x1: x, x2: x, y1: margin.top, y2: height - margin.bottom }),
      svgEl("text", "confidence-tick-label", { x, y: height - margin.bottom + 28, "text-anchor": "middle" }, confidenceLabel(confidence)),
    );
  });
  confidenceAxis.append(svgEl("text", "graph-axis-title", {
    x: margin.left + plotWidth / 2,
    y: height - 18,
    "text-anchor": "middle",
  }, "Interface confidence fixture (not evidence certainty)"));
  svg.append(confidenceAxis);

  rows.forEach((row, index) => {
    const marker = markerLabel(index);
    const tierRows = rows.filter((candidate) => candidate.decision_dimensions.confidence === row.decision_dimensions.confidence);
    const tierIndex = tierRows.findIndex((candidate) => candidate.mapping_id === row.mapping_id);
    const jitter = (tierIndex - (tierRows.length - 1) / 2) * (compact ? 16 : 28);
    const x = xFor(row.decision_dimensions.confidence) + jitter;
    const y = yFor(row.effect.point);
    const yLower = yFor(row.effect.interval.lower);
    const yUpper = yFor(row.effect.interval.upper);
    const pointClass = row.mapping_id === state.focusedMappingId ? "graph-point focused" : "graph-point";
    const group = svgEl("g", pointClass, {
      role: "button",
      tabindex: "0",
      "data-mapping-id": row.mapping_id,
      "aria-label": `${marker}. ${row.action_title}: illustrative expected change ${row.effect.point} synthetic points of 100, illustrative span ${row.effect.interval.lower} to ${row.effect.interval.upper} synthetic points of 100, ${confidenceLabel(row.decision_dimensions.confidence)} interface confidence fixture`,
    });
    group.append(
      svgEl("title", "", {}, `${row.action_title} · +${row.effect.point} synthetic points of 100 expected change · ${confidenceLabel(row.decision_dimensions.confidence)} confidence fixture`),
      svgEl("line", "effect-range-line", { x1: x, x2: x, y1: yUpper, y2: yLower }),
      svgEl("line", "effect-range-cap", { x1: x - 6, x2: x + 6, y1: yUpper, y2: yUpper }),
      svgEl("line", "effect-range-cap", { x1: x - 6, x2: x + 6, y1: yLower, y2: yLower }),
      svgEl("circle", "graph-point-dot", { cx: x, cy: y, r: compact ? 9 : 13 }),
      svgEl("text", "graph-point-number", { x, y: y + 4, "text-anchor": "middle" }, marker),
    );
    group.addEventListener("click", () => focusMapping(row.mapping_id));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        focusMapping(row.mapping_id);
      }
    });
    svg.append(group);
  });

  const key = el("div", "graph-key");
  key.append(el("p", "graph-key-note", "Letters identify Actions; they are not ranks. Display order follows illustrative expected change within this outcome only."));
  rows.forEach((row, index) => {
    const keyClass = row.mapping_id === state.focusedMappingId ? "graph-key-item focused" : "graph-key-item";
    const button = el("button", keyClass);
    button.type = "button";
    button.setAttribute("data-mapping-id", row.mapping_id);
    button.append(
      el("span", "graph-key-number", markerLabel(index)),
      el("strong", "", row.action_title),
      el("span", "effect-range", `+${row.effect.point} synthetic pts of 100 · span +${row.effect.interval.lower} to +${row.effect.interval.upper} synthetic pts of 100`),
      el("span", "graph-key-confidence", `${confidenceLabel(row.decision_dimensions.confidence)} confidence fixture`),
    );
    button.addEventListener("click", () => focusMapping(row.mapping_id));
    key.append(button);
  });
  wrapper.append(svg, key);
  return wrapper;
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
    context.textContent = "Elective comparison stops before expected-change display ordering when any safety gate is positive.";
    const notice = el("div", "empty-map");
    notice.append(el("strong", "", "No elective Action map"), el("span", "", "Resolve the safety exit before considering an outcome-matched Action."));
    map.replaceChildren(notice);
  } else {
    context.textContent = `${eligible.length} of ${eligible.length + excluded.length} primary-target mappings are eligible. The x-axis is a deterministic interface confidence fixture, not evidence certainty. The y-axis is illustrative expected change from the synthetic baseline. Whiskers are illustrative spans, not statistical intervals. Horizontal offsets only separate points inside a categorical lane.`;
    map.replaceChildren(renderActionGraph(eligible));
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
    const hasEligible = eligibleRows().length > 0;
    empty.append(
      el("h2", "", hasEligible ? "Inspect an Action" : "No eligible Action"),
      el("p", "", hasEligible
        ? "Select a mapped Action to inspect its fixture values. No Action is recommended by default."
        : "This outcome has no selectable Action in the current synthetic patient state."),
    );
    panel.replaceChildren(empty);
    return;
  }

  const heading = el("div");
  heading.append(el("p", "section-kicker", `${OUTCOME_LABELS[row.outcome_id]} · synthetic mapping`), el("h2", "", row.action_title));
  const signals = el("div", "detail-signal-pair");
  const effectSignal = el("div", "detail-signal effect-signal");
  const baseline = state.run.patient.baseline_outcomes[row.outcome_id].value;
  effectSignal.append(
    el("span", "signal-label", "Illustrative expected change"),
    el("strong", "", `+${row.effect.point} synthetic points of 100`),
    el("small", "", `Synthetic baseline ${baseline} synthetic points of 100; illustrative endpoint ${baseline + row.effect.point} synthetic points of 100. Illustrative span, not a statistical interval: ${baseline + row.effect.interval.lower} to ${baseline + row.effect.interval.upper} synthetic points of 100.`),
  );
  const confidenceSignal = el("div", "detail-signal confidence-signal");
  confidenceSignal.append(
    el("span", "signal-label", "Interface confidence fixture"),
    el("strong", "", row.decision_dimensions.confidence),
    confidenceMarkers(row.decision_dimensions.confidence),
    el("small", "", "Not evidence certainty or model confidence"),
  );
  signals.append(effectSignal, confidenceSignal);
  const secondaryHeading = el("p", "secondary-heading", "Other interface fixture dimensions");
  const secondaryNote = el("p", "secondary-note", "Display-only states, not validated patient assessments.");
  const dimensions = el("div", "dimension-grid");
  dimensions.append(
    dimension("Burden", row.decision_dimensions.burden),
    dimension("Harm", row.decision_dimensions.harm),
    dimension("Feasibility", row.feasibility_state),
    dimension("Preference", row.preference_state),
    dimension("Urgency", row.decision_dimensions.urgency),
  );
  const copy = el("dl", "detail-copy");
  copy.append(el("dt", "", "Candidate Action definition"), el("dd", "", row.dose), el("dt", "", "Candidate response period"), el("dd", "", formatPeriod(row.response_period)));
  const button = el("button", "primary-action", state.selectedMappingId === row.mapping_id ? "Selected for synthetic test" : "Select for synthetic test");
  button.type = "button";
  button.disabled = state.selectedMappingId === row.mapping_id;
  button.addEventListener("click", () => {
    if (row.outcome_id !== state.outcomeId || row.eligibility_state !== "eligible") return;
    state.selectedMappingId = row.mapping_id;
    renderDetail();
    renderReassessment();
  });
  panel.replaceChildren(heading, signals, secondaryHeading, secondaryNote, dimensions, copy, button);
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
  const thresholdValue = state.run.workflow_state.reassessment_contract.candidate_only.illustrative_reassessment_threshold.value;
  threshold.append(el("span", "", "Synthetic reassessment threshold"), el("strong", "", `${thresholdValue} synthetic ${OUTCOME_LABELS[row.outcome_id]} points of 100 · not a validated MCID`));
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
