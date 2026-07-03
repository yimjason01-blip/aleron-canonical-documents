#!/usr/bin/env python3
"""
Validate the patient-value v2 action library.

This is the executable guardrail for the AI/action-map boundary. The v2 overlay
may contain legacy action overlays, newly promoted action candidates, diagnostic
gates, genetics-required items, and bundle valuations. It must not allow a fluent
AI candidate to become a scored map item unless the candidate resolves to a typed,
valued library record.

Run:
  python3 validate_action_library_v2.py
  python3 validate_action_library_v2.py --candidates path/to/candidates.json
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_V2 = os.path.join(HERE, "action_library_v2.json")
DEFAULT_V1 = os.path.join(HERE, "action_library.json")
DEFAULT_FINDINGS = os.path.join(HERE, "findings.json")

BANDS = ("low", "central", "high")
CHANNELS = ("c1_prevention", "c2_capacity", "c3_resilience")
SOURCE_BASIS_TYPES = {
    "RCT",
    "RCT_meta_analysis",
    "cohort",
    "meta_analysis",
    "Mendelian_randomization",
    "guideline",
    "model_output",
    "internal_method",
    "internal_model",
    "Aleron_judgment",
}
REVIEW_STATUSES = {
    "reviewed",
    "provisional_judgment",
    "internal_method",
    "needs_source_upgrade",
}
EVIDENCE_LEVELS = {"low", "medium", "high"}
EVIDENCE_CAPS = {
    "Aleron_judgment_primary_cap",
    "surrogate_only_cap",
    "broad_screening_insufficient_cap",
    "population_mismatch_cap",
    "diagnostic_downstream_uncertain_cap",
    "needs_source_upgrade_primary_cap",
    "model_translated_value_cap",
}
ACTION_EVIDENCE_COMPONENTS = {
    "study_design",
    "endpoint_directness",
    "population_match",
    "intervention_match",
    "magnitude_precision",
    "harm_characterization",
}
DIAGNOSTIC_EVIDENCE_COMPONENTS = {
    "test_validity",
    "reclassification_yield",
    "downstream_action_value",
    "population_match",
    "management_threshold",
    "burden_harms_known",
}


def load_json(path):
    with open(path) as f:
        return json.load(f)


def central(spec):
    if isinstance(spec, (int, float)):
        return float(spec)
    if isinstance(spec, dict) and isinstance(spec.get("central"), (int, float)):
        return float(spec["central"])
    return None


def numeric_band(spec, label, errors, *, probability=False, nonnegative=True):
    if not isinstance(spec, dict):
        errors.append("%s must be a low/central/high object" % label)
        return
    missing = [band for band in BANDS if not isinstance(spec.get(band), (int, float))]
    if missing:
        errors.append("%s missing numeric bands: %s" % (label, ", ".join(missing)))
        return
    values = [float(spec[band]) for band in BANDS]
    if nonnegative and any(value < 0 for value in values):
        errors.append("%s has negative value" % label)
    if probability and any(value < 0 or value > 1 for value in values):
        errors.append("%s probability must be between 0 and 1" % label)
    if values != sorted(values):
        errors.append("%s bands must be monotonic low <= central <= high" % label)


def validate_channel(spec, label, errors, channel_name):
    """Validate one C1/C2/C3 channel.

    A C1 channel may use the D2 curve-shift schema (projection=survival_curve_shift
    plus a per_event derivation object) instead of a bare low/central/high scalar —
    the bare per-event scalar is exactly what D2 retired (trace F1). Any other channel,
    and any C1 channel without that projection, still requires numeric bands.
    See QALY_METHOD_DECISIONS.md D2/D8.
    """
    if (channel_name == "c1_prevention" and isinstance(spec, dict)
            and spec.get("projection") == "survival_curve_shift"):
        per_event = spec.get("per_event")
        if not isinstance(per_event, dict):
            errors.append("%s curve-shift channel missing per_event derivation object" % label)
            return
        for key in ("event_age", "fatal_fraction", "blended_per_event_qaly"):
            if not isinstance(per_event.get(key), (int, float)):
                errors.append("%s per_event missing numeric %s" % (label, key))
        band = per_event.get("band")
        if not (isinstance(band, list) and len(band) == 2
                and all(isinstance(x, (int, float)) for x in band)):
            errors.append("%s per_event missing [low, high] band" % label)
        return
    numeric_band(spec, label, errors)


def has_structured_gate(applies_when):
    if not isinstance(applies_when, dict):
        return False
    for key in ("all_findings", "any_findings", "trigger_findings", "criteria"):
        values = applies_when.get(key)
        if isinstance(values, list) and values:
            return True
    return False


def _has_citation_or_internal_link(trace):
    citation = trace.get("citation")
    if isinstance(citation, dict) and any(citation.get(k) for k in ("pmid", "doi", "url", "guideline_url", "internal_doc")):
        return True
    return bool(trace.get("internal_doc"))


def validate_evidence_trace(item, label, required_parameters, errors):
    traces = item.get("evidence_trace")
    if not isinstance(traces, list) or not traces:
        errors.append("%s missing evidence_trace" % label)
        return
    seen = set()
    for idx, trace in enumerate(traces):
        if not isinstance(trace, dict):
            errors.append("%s evidence_trace[%d] must be an object" % (label, idx))
            continue
        parameter = trace.get("parameter")
        if not parameter:
            errors.append("%s evidence_trace[%d] missing parameter" % (label, idx))
        else:
            seen.add(parameter)
        supports = trace.get("supports")
        if not isinstance(supports, list) or not supports:
            errors.append("%s evidence_trace[%d] missing non-empty supports" % (label, idx))
        basis_type = trace.get("basis_type")
        if basis_type not in SOURCE_BASIS_TYPES:
            errors.append("%s evidence_trace[%d] has invalid basis_type %s" % (label, idx, basis_type))
        review_status = trace.get("review_status")
        if review_status not in REVIEW_STATUSES:
            errors.append("%s evidence_trace[%d] has invalid review_status %s" % (label, idx, review_status))
        if not trace.get("transformation"):
            errors.append("%s evidence_trace[%d] missing transformation" % (label, idx))
        if not trace.get("limitations"):
            errors.append("%s evidence_trace[%d] missing limitations" % (label, idx))
        if basis_type == "Aleron_judgment":
            if not trace.get("rationale"):
                errors.append("%s evidence_trace[%d] Aleron_judgment missing rationale" % (label, idx))
        elif basis_type in ("internal_method", "internal_model", "model_output"):
            if not _has_citation_or_internal_link(trace):
                errors.append("%s evidence_trace[%d] %s missing internal_doc/citation" % (label, idx, basis_type))
        else:
            if not _has_citation_or_internal_link(trace):
                errors.append("%s evidence_trace[%d] sourced basis missing PMID/DOI/URL" % (label, idx))
    missing = sorted(set(required_parameters) - seen)
    if missing:
        errors.append("%s evidence_trace missing parameter traces: %s" % (label, ", ".join(missing)))


def level_for_score(score):
    if score >= 0.70:
        return "high"
    if score >= 0.40:
        return "medium"
    return "low"


def validate_evidence_axis(item, label, component_names, errors):
    axis = item.get("evidence_axis")
    if not isinstance(axis, dict):
        errors.append("%s missing evidence_axis" % label)
        return
    score = axis.get("score")
    if not isinstance(score, (int, float)) or score < 0 or score > 1:
        errors.append("%s evidence_axis.score must be numeric between 0 and 1" % label)
        return
    level = axis.get("level")
    if level not in EVIDENCE_LEVELS:
        errors.append("%s evidence_axis.level must be low, medium, or high" % label)
    elif level != level_for_score(float(score)):
        errors.append("%s evidence_axis.level %s does not match score %.3f" % (label, level, score))
    expected_label = {"low": "Low evidence", "medium": "Medium evidence", "high": "High evidence"}.get(level)
    if expected_label and axis.get("display_label") != expected_label:
        errors.append("%s evidence_axis.display_label must be %s" % (label, expected_label))
    if not axis.get("basis_summary"):
        errors.append("%s evidence_axis missing basis_summary" % label)
    components = axis.get("component_scores")
    if not isinstance(components, dict):
        errors.append("%s evidence_axis.component_scores must be an object" % label)
    else:
        missing_components = sorted(component_names - set(components))
        extra_components = sorted(set(components) - component_names)
        if missing_components:
            errors.append("%s evidence_axis missing component scores: %s" % (label, ", ".join(missing_components)))
        if extra_components:
            errors.append("%s evidence_axis has unknown component scores: %s" % (label, ", ".join(extra_components)))
        for key, value in components.items():
            if not isinstance(value, (int, float)) or value < 0 or value > 1:
                errors.append("%s evidence_axis.component_scores.%s must be numeric between 0 and 1" % (label, key))
        total = sum(float(v) for v in components.values() if isinstance(v, (int, float)))
        if abs(total - float(score)) > 0.011:
            errors.append("%s evidence_axis.score %.3f does not equal component score total %.3f" % (label, score, total))
    caps = axis.get("caps_applied")
    if not isinstance(caps, list):
        errors.append("%s evidence_axis.caps_applied must be a list" % label)
        caps = []
    unknown_caps = sorted(set(caps) - EVIDENCE_CAPS)
    if unknown_caps:
        errors.append("%s evidence_axis has unknown caps: %s" % (label, ", ".join(unknown_caps)))
    trace_params = {trace.get("parameter") for trace in item.get("evidence_trace", []) if isinstance(trace, dict)}
    primary_params = axis.get("primary_trace_parameters")
    if not isinstance(primary_params, list) or not primary_params:
        errors.append("%s evidence_axis.primary_trace_parameters must be a non-empty list" % label)
    else:
        missing = sorted(set(primary_params) - trace_params)
        if missing:
            errors.append("%s evidence_axis primary_trace_parameters missing from evidence_trace: %s" % (label, ", ".join(missing)))
    primary_traces = [trace for trace in item.get("evidence_trace", []) if isinstance(trace, dict) and trace.get("parameter") in set(primary_params or [])]
    if level == "high":
        if any(trace.get("basis_type") == "Aleron_judgment" for trace in primary_traces):
            errors.append("%s evidence_axis cannot be high with Aleron_judgment primary trace" % label)
        if any(trace.get("review_status") == "needs_source_upgrade" for trace in primary_traces):
            errors.append("%s evidence_axis cannot be high with needs_source_upgrade primary trace" % label)
    if "Aleron_judgment_primary_cap" in caps and level != "low":
        errors.append("%s Aleron_judgment_primary_cap requires low evidence level" % label)
    if "broad_screening_insufficient_cap" in caps and level != "low":
        errors.append("%s broad_screening_insufficient_cap requires low evidence level" % label)
    medium_caps = {"surrogate_only_cap", "population_mismatch_cap", "diagnostic_downstream_uncertain_cap", "needs_source_upgrade_primary_cap", "model_translated_value_cap"}
    if level == "high" and set(caps).intersection(medium_caps):
        errors.append("%s evidence_axis high level conflicts with cap(s): %s" % (label, ", ".join(sorted(set(caps).intersection(medium_caps)))))


def required_action_trace_parameters(action):
    params = ["burden_qaly"]
    channels = action.get("channels") or {}
    for channel in CHANNELS:
        spec = channels.get(channel)
        c = central(spec)
        if channel == "c1_prevention" and isinstance(spec, dict) and spec.get("projection"):
            params.append("channels.%s" % channel)
        elif c is not None and c != 0:
            params.append("channels.%s" % channel)
    return params


def required_diagnostic_trace_parameters(_diagnostic):
    return [
        "reclassification_probability",
        "qaly_if_reclassified",
        "test_burden",
        "evidence_grade",
    ]


def validate_bundle(bundle, legacy_action_ids, finding_ids, errors):
    bid = bundle.get("id", "<missing>")
    if not bid:
        errors.append("bundle missing id")
        return
    for key in ("valuation_kind", "status", "source_actions", "applies_when", "channels",
                "burden_qaly", "net_qaly_if_achieved", "finding_allocation",
                "overlap_rules"):
        if key not in bundle:
            errors.append("bundle %s missing %s" % (bid, key))
    if not has_structured_gate(bundle.get("applies_when")):
        errors.append("bundle %s lacks structured applies_when gate" % bid)
    if bundle.get("display_role") != "opportunity_pool_not_atomic_recommendation":
        errors.append("bundle %s must declare display_role=opportunity_pool_not_atomic_recommendation" % bid)
    if not bundle.get("reducer_rule"):
        errors.append("bundle %s missing reducer_rule" % bid)
    for aid in bundle.get("source_actions") or []:
        if aid not in legacy_action_ids:
            errors.append("bundle %s references unknown source action %s" % (bid, aid))
    for fid in (bundle.get("finding_allocation") or {}):
        if fid not in finding_ids:
            errors.append("bundle %s allocates to unknown finding %s" % (bid, fid))
    channels = bundle.get("channels") or {}
    for channel in CHANNELS:
        numeric_band(channels.get(channel), "bundle %s %s" % (bid, channel), errors)
    numeric_band(bundle.get("burden_qaly"), "bundle %s burden_qaly" % bid, errors)
    numeric_band(bundle.get("net_qaly_if_achieved"), "bundle %s net_qaly_if_achieved" % bid, errors)
    check_net_math(bundle, "bundle %s" % bid, errors)
    validate_evidence_trace(bundle, "bundle %s" % bid, required_action_trace_parameters(bundle), errors)
    validate_evidence_axis(bundle, "bundle %s" % bid, ACTION_EVIDENCE_COMPONENTS, errors)


def check_net_math(item, label, errors):
    net = item.get("net_qaly_if_achieved")
    if not isinstance(net, dict) or not all(isinstance(net.get(band), (int, float)) for band in BANDS):
        return
    channels = item.get("channels") or {}
    burden = item.get("burden_qaly") or {}
    if not all(isinstance((channels.get(ch) or {}).get(band), (int, float))
               for ch in CHANNELS for band in BANDS):
        return
    if not all(isinstance(burden.get(band), (int, float)) for band in BANDS):
        return
    for band in BANDS:
        calc = sum(channels[ch][band] for ch in CHANNELS) - burden[band]
        if abs(calc - net[band]) > 1e-9:
            errors.append("%s net_qaly_if_achieved.%s %.6f does not equal channels minus burden %.6f"
                          % (label, band, net[band], calc))


def validate_action(action, required_fields, legacy_action_ids, errors):
    aid = action.get("id", "<missing>")
    if not aid:
        errors.append("action missing id")
        return
    for key in required_fields:
        if key not in action:
            errors.append("action %s missing %s" % (aid, key))
    if action.get("valuation_kind") != "direct_patient_qaly_action":
        errors.append("action %s has unexpected valuation_kind %s" % (aid, action.get("valuation_kind")))
    if not action.get("status"):
        errors.append("action %s missing status" % aid)
    if not has_structured_gate(action.get("applies_when")):
        errors.append("action %s lacks structured applies_when gate" % aid)
    if aid not in legacy_action_ids and not action.get("status", "").startswith(("prototype_", "required_")):
        errors.append("v2-only action %s must declare prototype or required status" % aid)
    channels = action.get("channels") or {}
    for channel in CHANNELS:
        validate_channel(channels.get(channel), "action %s %s" % (aid, channel), errors, channel)
    numeric_band(action.get("burden_qaly"), "action %s burden_qaly" % aid, errors)
    net = action.get("net_qaly_if_achieved")
    if isinstance(net, dict) and all(band in net for band in BANDS):
        numeric_band(net, "action %s net_qaly_if_achieved" % aid, errors)
        check_net_math(action, "action %s" % aid, errors)
    elif isinstance(net, dict) and net.get("calculation"):
        if not action.get("cohort_projection"):
            errors.append("action %s formula net_qaly_if_achieved requires cohort_projection" % aid)
    else:
        errors.append("action %s net_qaly_if_achieved must be numeric bands or a calculation" % aid)
    if not action.get("uncertainty_basis"):
        errors.append("action %s missing uncertainty_basis" % aid)
    if not action.get("overlap_rules"):
        errors.append("action %s missing overlap_rules" % aid)
    validate_evidence_trace(action, "action %s" % aid, required_action_trace_parameters(action), errors)
    validate_evidence_axis(action, "action %s" % aid, ACTION_EVIDENCE_COMPONENTS, errors)


def validate_diagnostic(diagnostic, required_fields, errors):
    did = diagnostic.get("id", "<missing>")
    if not did:
        errors.append("diagnostic missing id")
        return
    for key in required_fields:
        if key not in diagnostic:
            errors.append("diagnostic %s missing %s" % (did, key))
    numeric_band(diagnostic.get("reclassification_probability"),
                 "diagnostic %s reclassification_probability" % did,
                 errors,
                 probability=True)
    numeric_band(diagnostic.get("qaly_if_reclassified"),
                 "diagnostic %s qaly_if_reclassified" % did,
                 errors)
    numeric_band(diagnostic.get("test_burden"),
                 "diagnostic %s test_burden" % did,
                 errors)
    expected = diagnostic.get("expected_voi_internal")
    if central(expected) is None:
        errors.append("diagnostic %s expected_voi_internal missing central" % did)
    else:
        p = central(diagnostic.get("reclassification_probability"))
        qaly = central(diagnostic.get("qaly_if_reclassified"))
        burden = central(diagnostic.get("test_burden"))
        if None not in (p, qaly, burden):
            calc = p * qaly - burden
            if abs(calc - central(expected)) > 1e-9:
                errors.append("diagnostic %s expected_voi_internal %.6f does not equal p_reclass*qaly_if_reclassified-burden %.6f"
                              % (did, central(expected), calc))
    eligibility = diagnostic.get("eligibility")
    if not isinstance(eligibility, dict):
        errors.append("diagnostic %s eligibility must be an object" % did)
        return
    for key in ("required_patient_fields", "trigger_findings", "do_not_score_when"):
        values = eligibility.get(key)
        if not isinstance(values, list) or not values:
            errors.append("diagnostic %s eligibility.%s must be a non-empty list" % (did, key))
    validate_evidence_trace(diagnostic, "diagnostic %s" % did, required_diagnostic_trace_parameters(diagnostic), errors)
    validate_evidence_axis(diagnostic, "diagnostic %s" % did, DIAGNOSTIC_EVIDENCE_COMPONENTS, errors)


def extract_candidate_match(candidate):
    matches = []
    for key in ("library_match_id", "valuation_id", "action_id", "diagnostic_id", "test_id"):
        if candidate.get(key):
            matches.append(candidate[key])
    proposed = candidate.get("proposed_item")
    if isinstance(proposed, dict):
        for key in ("library_match_id", "valuation_id", "id", "test_id"):
            if proposed.get(key):
                matches.append(proposed[key])
    return [str(match) for match in matches if match]


def candidate_status_requires_scoring(candidate):
    status = str(candidate.get("status", ""))
    if status in ("scored_candidate", "map_item", "final_recommendation", "recommended"):
        return True
    admission = candidate.get("admission")
    if isinstance(admission, dict) and admission.get("eligible_for_scoring"):
        return True
    if candidate.get("promoted_to_map"):
        return True
    return False


def validate_candidates(candidate_doc, scored_ids, scored_test_ids):
    errors = []
    candidates = candidate_doc.get("candidates") if isinstance(candidate_doc, dict) else candidate_doc
    if not isinstance(candidates, list):
        return ["candidate file must be a list or an object with candidates"]
    scored_space = set(scored_ids) | set(scored_test_ids)
    for idx, candidate in enumerate(candidates):
        if not isinstance(candidate, dict):
            errors.append("candidate %d must be an object" % idx)
            continue
        matches = extract_candidate_match(candidate)
        new_required = bool((candidate.get("proposed_item") or {}).get("new_library_item_required"))
        if candidate_status_requires_scoring(candidate):
            if new_required:
                errors.append("candidate %s requires a new library item and cannot be promoted as scored"
                              % candidate.get("id", idx))
            if not any(match in scored_space for match in matches):
                errors.append("candidate %s is promoted/scorable but has no scored library match"
                              % candidate.get("id", idx))
    return errors


def validate_v2_overlay(v2_doc, legacy_actions_doc=None, findings_doc=None, candidate_doc=None):
    errors = []
    legacy_action_ids = set()
    finding_ids = set()
    if legacy_actions_doc:
        legacy_action_ids = {a.get("id") for a in legacy_actions_doc.get("actions", [])}
    if findings_doc:
        finding_ids = {f.get("id") for f in findings_doc.get("findings", [])}

    required_actions = v2_doc.get("required_direct_action_fields") or []
    required_diagnostics = v2_doc.get("required_diagnostic_fields") or []
    for key in ("id", "valuation_kind", "applies_when", "channels", "burden_qaly",
                "net_qaly_if_achieved", "uncertainty_basis", "overlap_rules"):
        if key not in required_actions:
            errors.append("required_direct_action_fields must include %s" % key)
    for key in ("id", "test_id", "reclassification_probability", "qaly_if_reclassified",
                "expected_voi_internal", "dominant_reclassification_path",
                "downstream_decisions_changed", "test_burden", "evidence_grade", "eligibility"):
        if key not in required_diagnostics:
            errors.append("required_diagnostic_fields must include %s" % key)

    ids_seen = {}
    for section in ("bundle_valuations", "action_valuations", "diagnostic_valuations"):
        for item in v2_doc.get(section, []):
            item_id = item.get("id")
            if not item_id:
                continue
            if item_id in ids_seen:
                errors.append("duplicate id %s appears in %s and %s" % (item_id, ids_seen[item_id], section))
            ids_seen[item_id] = section

    for bundle in v2_doc.get("bundle_valuations", []):
        validate_bundle(bundle, legacy_action_ids, finding_ids, errors)
    for action in v2_doc.get("action_valuations", []):
        validate_action(action, required_actions, legacy_action_ids, errors)
    for diagnostic in v2_doc.get("diagnostic_valuations", []):
        validate_diagnostic(diagnostic, required_diagnostics, errors)

    scored_ids = set(ids_seen.keys())
    scored_test_ids = {d.get("test_id") for d in v2_doc.get("diagnostic_valuations", []) if d.get("test_id")}
    if candidate_doc is not None:
        errors.extend(validate_candidates(candidate_doc, scored_ids, scored_test_ids))
    return errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--v2", default=DEFAULT_V2)
    parser.add_argument("--legacy-actions", default=DEFAULT_V1)
    parser.add_argument("--findings", default=DEFAULT_FINDINGS)
    parser.add_argument("--candidates")
    args = parser.parse_args()

    v2_doc = load_json(args.v2)
    legacy_actions_doc = load_json(args.legacy_actions) if args.legacy_actions else None
    findings_doc = load_json(args.findings) if args.findings else None
    candidate_doc = load_json(args.candidates) if args.candidates else None

    errors = validate_v2_overlay(v2_doc, legacy_actions_doc, findings_doc, candidate_doc)
    print("=" * 64)
    print("ALERON action library v2 validation")
    print("=" * 64)
    print("bundle valuations:     %d" % len(v2_doc.get("bundle_valuations", [])))
    print("action valuations:     %d" % len(v2_doc.get("action_valuations", [])))
    print("diagnostic valuations: %d" % len(v2_doc.get("diagnostic_valuations", [])))
    if candidate_doc is not None:
        candidates = candidate_doc.get("candidates") if isinstance(candidate_doc, dict) else candidate_doc
        print("candidate records:     %d" % (len(candidates) if isinstance(candidates, list) else 0))
    print()
    if errors:
        print("VALIDATION FAILED:")
        for error in errors:
            print("  - " + error)
        sys.exit(1)
    print("ALL ACTION LIBRARY V2 ASSERTIONS PASS.")


if __name__ == "__main__":
    main()
