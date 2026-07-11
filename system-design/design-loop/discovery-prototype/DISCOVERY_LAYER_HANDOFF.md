# Discovery Layer — Handoff

**What this is:** Aleron's *non-deterministic discovery layer* (the "workaround AI") — an LLM pass that runs in parallel to the five deterministic risk models, finds high-value findings the models structurally cannot see ("in the cracks"), and lands them on the same action map. This document is for an agent picking up the work cold: understand it, run it, and integrate it with the other work streams.

Status as of 2026-06-29: **working prototype**, validated on patient AL-47M including a passed blind test. Not production. Runs are executed with the **Workflow tool** (multi-agent orchestration). The deterministic front-end (manifest + packet) is plain Python.

Operational update as of 2026-06-30: `system-design/ACTION_ENGINE_GENERALIZATION_CONTRACT.md` supersedes this handoff where map placement, scoring state, reducer rules, audit output, or independent-agent testing are concerned. The discovery layer still finds crack-space hypotheses, but the current map unit is a structured and scored candidate. Raw discovery text does not receive a map coordinate.

---

## 1. Why it exists

The deterministic engine is five siloed single-disease risk models (CVD/CKD/metabolic/cancer/neuro) plus a fixed action library. By construction it has four blind spots: (1) it reasons inside disease lanes, never combining weak signals across them; (2) it reads levels against thresholds, not patterns/velocities/contradictions; (3) it only scores findings that are *in* the library, on the modalities the silos consume; (4) it cannot reason about its own missing data. The discovery layer is the inverse of all four: open-ended, cross-lane, pattern-aware, modality-agnostic, self-reflective.

**Its job in one sentence:** generate hypotheses bound to the patient's own data, and name the single confirmatory test that would resolve each — never diagnose, never assign an audited QALY.

---

## 2. THE governing principle (do not violate)

**Aleron models for patient value, not for a payer or for defensibility.** (See `memory/model-for-patient-value.md`.) The discovery layer must obey this too. The first prototype failed because it optimized for *not being wrong* (suppression): a kill-oriented red-team, value-of-information divided by burden, and demotion on the faintest resemblance to a library finding. It produced a defensive worklist and surfaced nothing map-worthy.

The fix was to reorient every stage toward **maximizing the patient value found outside the base models**, while keeping the honesty rails (which protect the patient, not a payer). Three derived sub-principles, each load-bearing:

1. **Reclassification is a value channel.** A finding that re-prices levers *already* on the patient's map is high-value even if it adds no new drug. (Example: confirmed post-load diabetes moves metformin from prevention-grade to treatment-grade and the statin from borderline to clearly worth it.)
2. **Dedup on value, not label-adjacency.** Only drop a *true* re-find (the same finding) or something that adds no value already on the map. Sharing an organ/theme is not a re-find. (The v1 bug: MASLD was suppressed by collapsing it onto `chronic_viral_hepatitis_hcc_risk` because both touch the liver.)
3. **Demote, never delete.** A dropped candidate goes to a logged refinements bucket, recoverable. The safety net is what makes a dedup misfire survivable.

**Honesty rails (keep all):** ground every claim in the patient's actual data (cite the data keys); express value as a wide low/central/high range, never a point estimate; assign no audited QALY until a confirmatory test runs through the calibrated engine; never inflate or sell false hope; honesty means neither suppressing real value nor manufacturing it.

---

## 3. The pipeline (SIEVE-VOI)

Deterministic → one boxed LLM recall stage → deterministic. The LLM is creative in exactly one place and fenced everywhere else.

| Stage | Type | What it does |
|---|---|---|
| 0. Manifest freeze | deterministic (Python) | Project `findings.json` + `action_library.json` into the known-space the layer must NOT re-find. `build_manifest.py`. |
| 1. Record packing | deterministic (Python) | Assemble the patient's full observable record + the tests not yet run + what the engine already fires for him + the citable `valid_keys`. `build_packet.py`. |
| 2. Lensed recall | **LLM (the only non-deterministic stage)** | 6 crack-category lenses + 1 independent cross-model finder, each reading the packet + manifest, citing real data keys, allowed to abstain. |
| 3. Grounding | deterministic (JS in workflow) | Drop any candidate not citing ≥1 real `valid_keys` entry. |
| 4. Value-based dedup | deterministic (JS) | Demote true re-finds / no-new-value items; keep anything that adds a lever or re-prices an existing one. Demote-not-delete. |
| 5. Reality-then-value verify | LLM | Per candidate: first try to *refute that it is real* (artifact, benign, confound, low pretest); only if it survives, value it on the patient-value scale incl. reclassification. |
| 6. Rank + place | deterministic (JS) | Rank by expected value (confirm-probability × central). Carry survivors to a conditional, provenance-marked place on the action map. |

**Confidence tiering / dispositions** (from the verifier): `surface_to_map` (real + adds/reprices value), `watchful_documentation` (real but low value now), `discard` (not real / no value). The patient never sees a raw discovery — only a clinician-endorsed "we want to check X," or, after confirmation, a normal lever.

---

## 4. Files in this silo

All in `system-design/design-loop/discovery-prototype/`. Touches no other files.

- `build_manifest.py` — reads the real library, emits `manifest.json` (structured: `known_finding_ids`, per-finding coverage tuple, outcomes, detectors) and `manifest_llm.txt` (compact list for the lenses).
- `build_packet.py` — emits `patient_packet.json` (AL-47M observables, `tests_not_yet_run`, `engine_already_flagged`, flattened `valid_keys`). **Edit this to change the patient.**
- `manifest.json`, `manifest_llm.txt`, `patient_packet.json` — generated artifacts (regenerate after editing the builders).
- `discovery_run_output.json` — v1 (suppression-oriented; the instructive failure).
- `discovery_run_v2_output.json` — v2 (value-oriented; the good run).
- `discovery_run_blindtest_output.json` — blind test (injected signals; passed).
- `DISCOVERY_LAYER_HANDOFF.md` — this file.

The Workflow scripts themselves are not committed here; their authoritative spec is §6 below (schemas + glue), so you can re-author them. The Workflow tool also persists each run's script under the session's `workflows/scripts/` directory.

---

## 5. The engine you must integrate with (ground truth — read before promising anything)

Source: `system-design/design-loop/cohort/generate_cohort.py`, `library/findings.json`, `library/action_library.json`, `QALY_VALUATION_FRAMEWORK.md`.

- **The unit of value is a FINDING.** Tests detect findings; actions address findings. Closed world = `findings.json` (80 findings, continuous + rare, across cvd/ckd/metabolic/cancer/neuro) + `action_library.json` (145 actions).
- **Finding schema:** `{id, domain, kind, prevalence_or_threshold, detectors:[{test_id, sensitivity}], base_catch, enables:[action_ids], note}`.
- **Action schema:** `{id, action_class, domain, finding_id, target_outcome, effect:{type: RRR|HR|RR, value}, evidence: weak|moderate|strong, burden_qaly, qaly_per_event, surrogate_flag, source, pmid, domains, bundle}`.
- **The engine computes a single scalar:** `delta = true_risk × rel_reduction(effect) × qaly_per_event − burden_qaly`, best-net action per finding, bundle-aware. `true_risk` is always **calibrated** (`true_risks()` logistic) or **sourced** (`RARE_PENETRANCE` table).
- **CRITICAL: C1/C2/C3 channels do NOT exist in the engine.** They are hand-authored in the action map's `SCORED` literal and described in `QALY_VALUATION_FRAMEWORK.md` (C1 prevention / C2 capacity-function-quality / C3 resilience; undiscounted; patient-realistic utilities; counterfactual = credit only the change; no double-count; evidence kept on a separate axis, never folded into magnitude). Do not promise "inherit C1/C2/C3 for free."
- **Consequence for discoveries:** a novel finding has no calibrated `true_risk` and no channel decomposition, so it **cannot get an honest QALY coordinate** until its confirmatory test runs and feeds the same calibrated path. That is the graduation rule.

The discovery layer consumes the engine's per-patient observable layer (intake/derived/trajectories/analytes/screens/genetics, produced by `generate_cohort.py`) plus its fired findings, and dedups against the manifest built from the library.

---

## 6. Schemas + deterministic glue (to re-author the Workflow run)

**Lens/recall output** (`CAND_SCHEMA`, per candidate): `slug, title, organ_system(enum), etiology(enum), outcome_class(enum), one_line, cited_data[(dotted valid_keys — BARE keys)], reasoning, relation_to_known(enum: same|related_but_distinct|novel), known_finding_id(string|null), adds_new_lever(bool), new_levers[], reprices_existing(bool), levers_repriced[], confirmatory_test, pretest_plausibility(low|moderate|high)`. Plus top-level `abstained(bool)`.

**Verify output** (`VALUE_SCHEMA`): `is_real_signal(bool), refutation, confirm_probability(low|moderate|high), disposition(surface_to_map|watchful_documentation|discard), confirmatory_test, c1, c2, c3, value_low, value_central, value_high, valuation_basis, reclassification_effect, provenance_note`.

**Deterministic glue (JS in the workflow):**
- Grounding: `norm = k => String(k).split('=')[0].trim().replace(/^["']|["']$/g,'')`; keep candidate iff ≥1 normalized cited key ∈ `VALID`.
- Value-based dedup: demote iff `relation_to_known === 'same' && known_finding_id ∈ KNOWN`, OR `!adds_new_lever && !reprices_existing && known_finding_id ∈ ACTIVE`. Everything else is kept (novel lane).
- Merge by `organ_system`; union cites/levers; keep max pretest. (KNOWN BUG — see §8.)
- Rank survivors by `expected = confirmProb × value_central` (confirmProb map: low 0.3 / moderate 0.6 / high 0.85). Cap if desired.

**The 6 lenses** (generic — DO NOT add hints toward specific findings; the data must drive): cross-domain-constellation, organ-system-not-modeled, highest-value-missing-test, reclassification, pharmacogenomic-preemptive, rare-monogenic. Plus one independent whole-record finder on a different model tier (cross-model routing signal only — never used to raise a confidence grade).

---

## 7. How to run a patient

1. **Edit `build_packet.py`** to the patient's data (observables, `tests_not_yet_run`, `engine_already_flagged`). Run `python3 build_packet.py`; note the printed `valid_keys`.
2. **Run `python3 build_manifest.py`** (only needed if the library changed).
3. **Author the Workflow script** per §6. **Inline `KNOWN`, `VALID`, `ACTIVE` as literal constants in the script** (see §8 — the `args` parameter does not thread reliably). `KNOWN` = `manifest.json:known_finding_ids`; `VALID` = `patient_packet.json:valid_keys`; `ACTIVE` = the finding ids on the patient's current map.
4. **Launch with the Workflow tool.** It runs in the background and notifies on completion; the result JSON is in the task output file.
5. **Parse the output** → render on the value × evidence map (§9).

---

## 8. Known issues + workarounds (read before trusting a run)

- **`args` does not thread into the Workflow script.** Symptom: `KNOWN`/`VALID` come back empty, everything drops at grounding/dedup. **Workaround: inline the arrays as literal `const` in the script.** (The agents can still read the packet/manifest files via the `Read` tool, which masks the bug — watch the funnel counts, not just whether candidates appear.)
- **Grounding gate was too literal.** Models sometimes cite `key=value` instead of the bare key. Fixed with the `norm` function above; keep it.
- **Dedup is LLM-declared (`relation_to_known`), not yet a deterministic tuple match.** Production should dedup on the structured coverage tuple `(etiology, outcome_class, modality)` from the manifest, so adjacency can never suppress (the MASLD-vs-viral-hepatitis class of bug). The tuple is already emitted into `manifest.json`.
- **Merge-by-`organ_system` is lossy.** It can collapse two genuinely different findings sharing an organ, AND the *same datum* can drive findings in two lanes with *different* verdicts (in the blind test the nocturnal HR 38 produced a "benign vagal" read in the OSA lane and a "take it seriously" read in the cardiac-rhythm lane). **A reconciliation step is needed** so one datum yields one coherent recommendation.
- **Management-evidence grade is not emitted.** The run gives value + range + pretest/confirm-probability but not a weak/moderate/strong grade for the *intervention*. It is currently hand-assigned to build the value × evidence map. **Add an `evidence(weak|moderate|strong)` field to `VALUE_SCHEMA`.**
- **Recall is run-to-run non-deterministic.** Post-load-diabetes/OGTT surfaced in v2 but not in the blind run (the metabolic-syndrome cluster came up as "watch" instead). **Production needs ensembling + loop-until-dry**, not a single pass, before "recall complete" can be claimed.

---

## 9. Integration with the other work streams

**a) The action map (`system-design/diagrams/aleron-actionmap-al47m.html`).** Discovered findings render on the SAME value × evidence plane as the audited `SCORED` levers — Y = patient-value QALY (may be quality-of-life, prevention, or pure value-of-information), X = evidence that acting helps (weak/moderate/strong) — but as **dashed/unconfirmed dots with a low–high range bar** (value is conditional on the confirmatory test). They cluster in the upper-middle "confirm → get evidence" zone by construction. The confirmatory test is the arrow that moves a dashed dot: confirm positive → it solidifies into an audited lever at its calibrated value; confirm negative → it demotes out. Provenance must be visually distinct so a discovery is never falsely equivalent to an audited lever.

**b) The QALY valuation framework (`QALY_VALUATION_FRAMEWORK.md`).** The verifier values discoveries with the framework's conventions (undiscounted, patient-realistic utilities, counterfactual, C1/C2/C3, no double-count, evidence on a separate axis). Keep them consistent; when the framework changes, the verifier prompt must change with it.

**c) The 5 risk models + action library (`generate_cohort.py`, `findings.json`, `action_library.json`).** Two contracts: (i) the discovery layer **dedups against** them (the manifest); (ii) the **learning loop** graduates recurring, independently-confirmed discoveries *into* `findings.json` / `action_library.json` so the engine stops re-discovering them and the crack-space shrinks. Promotion must be independent (different model family + human sign-off + verified PMID) and reversible.

**d) The genetic must-do channel (`memory/genetic-mustdo-channel.md`).** Boundary: **high-penetrance ACMG-SF P/LP findings → must-do channel** (deterministic, bypasses the QALY map). **Moderate-penetrance / off-panel / VUS-reclassification → discovery layer.** The blind test's ATM heterozygous variant is the canonical discovery-layer case (moderate penetrance, the engine maps it to `finding_id: null`). Do not double-handle: if a variant is in the must-do dataset, the discovery layer should dedup it out.

**e) The vitality model (`memory/vitality-phenotype-model.md`).** The felt-experience/QoL register. Discovery-layer C2 (capacity/function/quality) value overlaps with vitality; coordinate so a QoL gain is counted once.

---

## 10. What the runs proved (evidence the design works)

- **v2 (value-oriented)** surfaced 4 map-worthy discoveries the base models miss, the top two ranking as the patient's #2/#3 disease levers behind only fitness: post-load diabetes via OGTT (central +0.85 QALY) and MASLD with possible fibrosis (+0.70) — both delivering value largely through reclassification. 0 wrongly demoted.
- **Blind test** (injected nocturnal SpO₂ dips, nocturnal HR 38, and a heterozygous ATM variant into the data only, no prompt hints): the layer independently raised a cardiac-rhythm finding (correctly reasoning "not athletic bradycardia — daytime HR 76, VO₂max 10–15th pct"; recommended ECG → Holter with simultaneous oximetry) and flagged ATM as a moderate-penetrance cancer/radiosensitivity finding (with the cross-finding insight that radiosensitivity should steer his pending CAC/CCTA to radiation-sparing imaging). Honesty held: iron-overload discarded (no supporting datum), CAC demoted as a true re-find, 0 dropped on grounding.

---

## 11. Recommended next work (priority order)

1. Add the `evidence` grade to `VALUE_SCHEMA` so the value × evidence map generates end-to-end (no hand-grading).
2. Replace LLM-declared dedup with deterministic coverage-tuple set-membership.
3. Add the reconciliation step (one datum → one recommendation across lanes).
4. Add ensembling + loop-until-dry for recall completeness; track per-category positive-predictive-value over time (outcome-feedback calibration — the only thing that catches coherent-but-wrong findings).
5. Build the learning-loop promotion path into `findings.json` / `action_library.json` (independent + reversible).
6. Wire the discovered-tier overlay into the live action map renderer.

Memory pointers: `memory/discovery-layer.md` (state + principle), `memory/model-for-patient-value.md` (the governing principle), `memory/action-map-real-qaly.md` (the map it lands on).
