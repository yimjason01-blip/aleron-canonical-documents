/* ================================================================
   Aleron MD · air audit · the numeric squint test (laws A2 / T2)
   ----------------------------------------------------------------
   A2: space between groups is at least twice the space within them,
   at every altitude. T2's required numeric form: measured on the
   RENDERED page (source cannot pass this test), text-to-text air
   between over within reads 2.0 or better.

   Use from DevTools console or preview eval:
     1. Paste this file (or fetch+eval it), then:
     2. AleronAirAudit.measure({name, groupSel, rowSel})   one relationship
        AleronAirAudit.run([...pairs])                     several, tabled
        AleronAirAudit.chart()                             physician chart presets

   groupSel selects the group containers (one element per group; if
   the markup has no group elements, that is itself the A2 finding:
   chunking must survive data to DOM to style).
   rowSel selects the leaf rows inside a group (scoped per group).
   Air is measured content-box to content-box, so padding-carried
   air counts and border-box adjacency does not hide it.
   ================================================================ */
(function () {
  function contentBox(el) {
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return { top: r.top + parseFloat(cs.paddingTop), bottom: r.bottom - parseFloat(cs.paddingBottom) };
  }
  function visible(el) { return !!el.offsetParent || getComputedStyle(el).position === 'fixed'; }
  function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function round(v) { return v == null ? null : Math.round(v * 10) / 10; }

  /* For table rows, measure via the first cell (rows tile; cells carry the padding). */
  function probe(el) { return el.tagName === 'TR' ? (el.querySelector('th,td') || el) : el; }

  function measure(spec) {
    var groups = [].slice.call(document.querySelectorAll(spec.groupSel)).filter(visible);
    if (!groups.length) return { name: spec.name, error: 'no groups match ' + spec.groupSel };
    var withinGaps = [], betweenGaps = [];
    groups.forEach(function (g) {
      var rows = spec.rowSel ? [].slice.call(g.querySelectorAll(spec.rowSel)).filter(visible)
                             : [].slice.call(g.children).filter(visible);
      for (var i = 0; i < rows.length - 1; i++) {
        withinGaps.push(contentBox(probe(rows[i + 1])).top - contentBox(probe(rows[i])).bottom);
      }
    });
    for (var i = 0; i < groups.length - 1; i++) {
      betweenGaps.push(contentBox(groups[i + 1]).top - contentBox(groups[i]).bottom);
    }
    var w = avg(withinGaps), b = avg(betweenGaps);
    return {
      name: spec.name,
      groups: groups.length,
      within: round(w),
      between: round(b),
      ratio: (w && b != null) ? Math.round((b / w) * 100) / 100 : null,
      pass: (w && b != null) ? (b / w >= 2.0) : null
    };
  }

  function run(specs) {
    var rows = specs.map(measure);
    if (typeof console.table === 'function') console.table(rows);
    return rows;
  }

  /* Presets for the physician per-patient chart
     (system-design/diagrams/aleron-actionmap-al47m-ds.html).
     Click the relevant nav section before running each; run() skips
     hidden panes with an error row rather than measuring zeros. */
  var CHART = [
    { name: 'patient data · groups vs rows', groupSel: '.pd-list .pd-group', rowSel: '.pd-rows > *' },
    { name: 'risk · panel tiers vs driver rows', groupSel: '.risk-panel.on > *', rowSel: '.risk-var-table tr' },
    { name: 'care plan · problems vs orders', groupSel: '.ap-prob', rowSel: '.ap-orow' },
    { name: 'journal · note sections vs order rows', groupSel: '.jr-note .jr-sec', rowSel: '.jr-orders tr' }
  ];

  /* risk tiers are siblings of one panel, not repeating groups: measure
     the boundaries between the panel's visible children directly. */
  function riskTiers() {
    var panel = document.querySelector('.risk-panel.on') || document.querySelector('.risk-panel');
    if (!panel) return { name: 'risk tiers', error: 'no .risk-panel' };
    var vis = [].slice.call(panel.children).filter(visible), gaps = [];
    for (var i = 0; i < vis.length - 1; i++) gaps.push(round(contentBox(vis[i + 1]).top - contentBox(vis[i]).bottom));
    return { name: 'risk · tier boundaries (each must be ≥ 2× leaf row air)', boundaries: gaps };
  }

  function chart() {
    var out = run([CHART[0], CHART[2], CHART[3]]);
    out.push(riskTiers());
    return out;
  }

  window.AleronAirAudit = { measure: measure, run: run, chart: chart, presetsChart: CHART };
  console.log('AleronAirAudit ready · A2/T2 numeric squint test · pass = between/within ≥ 2.0');
})();
