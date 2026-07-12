/* ================================================================
   Aleron MD · copy audit · the string provenance test (law C / T7)
   ----------------------------------------------------------------
   Production surfaces have no anonymous strings: every rendered
   string is a spec'd constant, a variable fed from the data model,
   or sanctioned AI content wearing provenance chrome. This tool
   makes the copy deck reviewable and flags the tells of filler.

   A vocabulary lint cannot decide provenance (clinical language
   collides with slop language: "comprehensive exam" is a real E/M
   term). So: `tells()` flags candidates, a human or agent judges
   them against the provenance classes, and `inventory()` extracts
   the full rendered copy deck so review covers every string, not
   just the flagged ones.

   Use from DevTools console or preview eval:
     AleronCopyAudit.inventory()            every rendered string, by container
     AleronCopyAudit.tells()                flagged strings with reasons
     AleronCopyAudit.tells({waive:[...]})   waive exact strings or /regex/
   ================================================================ */
(function () {
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1 };

  function visible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (SKIP[el.tagName]) return false;
    var cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  function selPath(el) {
    var parts = [];
    while (el && el.nodeType === 1 && parts.length < 4) {
      var c = String(el.className || '').trim().split(/\s+/)[0];
      parts.unshift(el.tagName.toLowerCase() + (c ? '.' + c : ''));
      el = el.parentElement;
    }
    return parts.join(' > ');
  }

  function collect(root) {
    var out = [];
    var walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      var t = n.textContent.replace(/\s+/g, ' ').trim();
      if (t.length < 3) continue;
      if (!visible(n.parentElement)) continue;
      out.push({ sel: selPath(n.parentElement), text: t });
    }
    return out;
  }

  /* The tells. Each is a candidate flag, not a verdict; provenance decides. */
  var TELLS = [
    ['self-narration', /\b(this|the) (view|screen|section|panel|chart|map|dashboard|page|table|tool) (shows|displays|provides|lets|allows|gives|helps|is designed)\b/i],
    ['coaching', /^(use (this|the)|read the|keep the|think of|start by|simply |feel free|remember to)\b/i],
    ['hedge-preamble', /\b(note that|it'?s important to|in order to|keep in mind)\b/i],
    ['ai-vocab', /\b(delve|seamless(ly)?|leverage|holistic|comprehensive overview|cutting[- ]edge|state[- ]of[- ]the[- ]art|unlock(ing)? (your|the)|elevate your|empower(ing|s)?)\b/i],
    ['placeholder', /\b(lorem ipsum|tbd|to be determined|insert [a-z]+ here|placeholder text|sample text|your [a-z]+ here)\b/i],
    ['em-dash', /—/],
    ['bracket-stub', /\[(placeholder|todo|insert|name|value|text)[^\]]*\]/i]
  ];

  function tells(opts) {
    opts = opts || {};
    var waive = (opts.waive || []).map(function (w) {
      return w instanceof RegExp ? w : new RegExp('^' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
    });
    var flagged = [];
    collect(opts.root).forEach(function (row) {
      if (waive.some(function (w) { return w.test(row.text); })) return;
      var hits = TELLS.filter(function (t) { return t[1].test(row.text); }).map(function (t) { return t[0]; });
      /* essay heuristic: long prose in caption-position containers only */
      if (/(caption|hint|help|note|desc|sdef|foot|label)\b/i.test(row.sel) && row.text.length > 260) hits.push('essay-in-caption');
      if (hits.length) flagged.push({ sel: row.sel, flags: hits.join(' · '), text: row.text.slice(0, 140) });
    });
    if (typeof console.table === 'function') console.table(flagged);
    return flagged;
  }

  function inventory(root) {
    var rows = collect(root);
    if (typeof console.table === 'function') console.table(rows.map(function (r) { return { sel: r.sel, text: r.text.slice(0, 120) }; }));
    return rows;
  }

  window.AleronCopyAudit = { inventory: inventory, tells: tells, TELLS: TELLS };
  console.log('AleronCopyAudit ready · T7: every string is a spec constant, a data variable, or chromed AI content');
})();
