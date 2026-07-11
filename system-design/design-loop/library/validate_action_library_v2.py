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
    "burden_calibration_pending_cap",
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


def band_tuple(spec):
    if isinstance(spec, (int, float)):
        value = float(spec)
        return (value, value, value)
    if isinstance(spec, dict) and all(isinstance(spec.get(band), (int, float)) for band in BANDS):
        return tuple(float(spec[band]) for band in BANDS)
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
    medium_caps = {
        "surrogate_only_cap",
        "population_mismatch_cap",
        "diagnostic_downstream_uncertain_cap",
        "needs_source_upgrade_primary_cap",
        "model_translated_value_cap",
        "burden_calibration_pending_cap",
    }
    if level == "high" and set(caps).intersection(medium_caps):
        errors.append("%s evidence_axis high level conflicts with cap(s): %s" % (label, ", ".join(sorted(set(caps).intersection(medium_caps)))))


def required_action_trace_parameters(action):
    params = ["burden_qaly"]
    derivation_inputs = action.get("derivation_inputs") or {}
    method = derivation_inputs.get("method")
    baseline_trace = "risk_domain" if derivation_inputs.get("risk_domain") else "baseline_event_risk"
    if method == "event_or_curve_shift_action":
        if str(derivation_inputs.get("effect_type", "RRR")).upper() == "ARR":
            params.append("effect.absolute_risk_reduction")
        elif "relative_risk_reduction" in derivation_inputs:
            params.extend(["effect.relative_risk_reduction", baseline_trace])
        else:
            params.extend(["effect.relative_risk", baseline_trace])
        params.append("event_value_qaly")
    elif method == "harm_aware_event_action":
        if str(derivation_inputs.get("effect_type", "RRR")).upper() == "ARR":
            params.append("effect.absolute_risk_reduction")
        elif "relative_risk_reduction" in derivation_inputs:
            params.extend(["effect.relative_risk_reduction", baseline_trace])
        else:
            params.extend(["effect.relative_risk", baseline_trace])
        params.extend(["event_value_qaly", "harm_objects", "burden_schedule"])
    elif method == "procedure_device_action":
        params.extend([
            "procedure_eligibility",
            "baseline_risk.endpoint_risks",
            "effect_model",
            "endpoint_values",
            "harm_objects",
            "burden_schedule",
        ])
    channels = action.get("channels") or {}
    for channel in CHANNELS:
        spec = channels.get(channel)
        c = central(spec)
        if channel == "c1_prevention" and isinstance(spec, dict) and spec.get("projection"):
            params.append("channels.%s" % channel)
        elif c is not None and c != 0:
            params.append("channels.%s" % channel)
    return params


def validate_procedure_device_action(action, label, errors):
    derivation_inputs = action.get("derivation_inputs") or {}
    if action.get("runner_method") != "procedure_device_action":
        errors.append("%s runner_method must match procedure_device_action" % label)
    for key in ("procedure_family", "effect_model", "eligibility_gate", "baseline_risk",
                "endpoint_values", "harm_objects", "burden_schedule"):
        if key not in derivation_inputs:
            errors.append("%s procedure_device_action missing %s" % (label, key))
    effect_model = derivation_inputs.get("effect_model") or {}
    effect_type = effect_model.get("type")
    if effect_type not in {
        "relative_event_reduction",
        "absolute_event_reduction",
        "utility_time_in_state",
        "survival_curve_shift",
        "counterfactual_curve_comparison",
    }:
        errors.append("%s procedure effect_model.type unsupported: %s" % (label, effect_type))
    applies_to = effect_model.get("effect_applies_to") or []
    if effect_type in {"relative_event_reduction", "absolute_event_reduction"} and not applies_to:
        errors.append("%s procedure effect_model.effect_applies_to must be non-empty" % label)
    if effect_type == "relative_event_reduction":
        numeric_band(effect_model.get("relative_risk_reduction"), "%s effect_model.relative_risk_reduction" % label, errors, probability=True)
    baseline = (derivation_inputs.get("baseline_risk") or {}).get("endpoint_risks") or {}
    endpoint_values = derivation_inputs.get("endpoint_values") or {}
    for endpoint_id in applies_to:
        if effect_type == "relative_event_reduction":
            numeric_band(baseline.get(endpoint_id), "%s baseline_risk.endpoint_risks.%s" % (label, endpoint_id), errors, probability=True)
        if effect_type == "absolute_event_reduction":
            arr = effect_model.get("absolute_risk_reduction")
            numeric_band(arr.get(endpoint_id) if isinstance(arr, dict) else arr, "%s effect_model.absolute_risk_reduction.%s" % (label, endpoint_id), errors, probability=True)
        endpoint = endpoint_values.get(endpoint_id) or {}
        numeric_band(endpoint.get("event_value_qaly"), "%s endpoint_values.%s.event_value_qaly" % (label, endpoint_id), errors)
    gate = derivation_inputs.get("eligibility_gate") or {}
    if not isinstance(gate.get("required_findings"), list) or not gate.get("required_findings"):
        errors.append("%s procedure eligibility_gate.required_findings must be non-empty" % label)
    if not isinstance(gate.get("thresholds"), list):
        errors.append("%s procedure eligibility_gate.thresholds must be a list" % label)
    for idx, harm in enumerate(derivation_inputs.get("harm_objects") or []):
        if not isinstance(harm, dict):
            errors.append("%s harm_objects[%d] must be an object" % (label, idx))
            continue
        if not harm.get("id"):
            errors.append("%s harm_objects[%d] missing id" % (label, idx))
        numeric_band(harm.get("probability"), "%s harm_objects[%s].probability" % (label, harm.get("id", idx)), errors, probability=True)
        numeric_band(harm.get("value_qaly_loss"), "%s harm_objects[%s].value_qaly_loss" % (label, harm.get("id", idx)), errors)
        if not harm.get("evidence_trace_parameter"):
            errors.append("%s harm_objects[%s] missing evidence_trace_parameter" % (label, harm.get("id", idx)))
    for idx, burden in enumerate(derivation_inputs.get("burden_schedule") or []):
        if not isinstance(burden, dict):
            errors.append("%s burden_schedule[%d] must be an object" % (label, idx))
            continue
        if burden.get("cadence") not in {"one_time", "per_year", "per_cycle", "replacement_interval", "surveillance_interval", "course"}:
            errors.append("%s burden_schedule[%s].cadence unsupported" % (label, burden.get("id", idx)))
        numeric_band(burden.get("duration_years"), "%s burden_schedule[%s].duration_years" % (label, burden.get("id", idx)), errors)
        numeric_band(burden.get("value_qaly_loss"), "%s burden_schedule[%s].value_qaly_loss" % (label, burden.get("id", idx)), errors)
        if burden.get("cadence") in {"per_cycle", "replacement_interval", "surveillance_interval"}:
            interval = burden.get("interval_years")
            if not isinstance(interval, (int, float)) or interval <= 0:
                errors.append("%s burden_schedule[%s] requires positive interval_years" % (label, burden.get("id", idx)))
        if not burden.get("evidence_trace_parameter"):
            errors.append("%s burden_schedule[%s] missing evidence_trace_parameter" % (label, burden.get("id", idx)))
    if not isinstance(action.get("overlap_group"), str) or not action.get("overlap_group"):
        errors.append("%s fully_derived_v2 missing overlap_group" % label)


def validate_event_or_curve_shift_net_shape(action, label, errors):
    """Require event-action net value to be explicitly runner-owned.

    Some fully-derived event actions keep `net_qaly_if_achieved` as a formula
    object because per-year burden is integrated by the action engine over the
    declared evidence horizon. This guard prevents a fully-derived event row from
    silently reverting to an unowned free-text or legacy asserted net scalar.
    """
    net = action.get("net_qaly_if_achieved")
    if isinstance(net, dict) and all(isinstance(net.get(band), (int, float)) for band in BANDS):
        return
    calculation = net.get("calculation") if isinstance(net, dict) else None
    if not isinstance(calculation, str) or "runner_computed" not in calculation or "burden_qaly" not in calculation:
        errors.append("%s event action net_qaly_if_achieved must be runner_computed and burden-explicit" % label)


def validate_event_or_curve_shift_runner_math(action, label, errors):
    """Verify displayed C1 bands mirror the event runner inputs.

    This enforces the acceptance gate that map-visible C1 values are computed
    from derivation_inputs, not hand-authored beside them.
    """
    derivation_inputs = action.get("derivation_inputs") or {}
    effect_type = str(derivation_inputs.get("effect_type", "RRR")).upper()
    event_value = band_tuple(derivation_inputs.get("event_value_qaly"))
    c1_spec = (action.get("channels") or {}).get("c1_prevention")
    if not isinstance(c1_spec, dict) or c1_spec.get("projection") != "event_or_curve_shift_action":
        errors.append("%s channels.c1_prevention projection must be event_or_curve_shift_action" % label)
    displayed_c1 = band_tuple(c1_spec)
    if event_value is None or displayed_c1 is None:
        return
    if effect_type == "ARR":
        prevented_events = band_tuple(derivation_inputs.get("absolute_risk_reduction"))
    else:
        baseline = band_tuple(derivation_inputs.get("baseline_event_risk"))
        if baseline is None and derivation_inputs.get("risk_domain"):
            # Runtime patient packets resolve risk_domain; static validation can
            # enforce the schema hook but cannot recompute displayed C1.
            return
        if "relative_risk_reduction" in derivation_inputs:
            rrr = band_tuple(derivation_inputs.get("relative_risk_reduction"))
        elif effect_type in {"RR", "HR"}:
            effect = band_tuple(derivation_inputs.get("effect_value"))
            rrr = tuple(1.0 - value for value in effect) if effect is not None else None
        else:
            rrr = None
        prevented_events = tuple(baseline[i] * rrr[i] for i in range(3)) if baseline is not None and rrr is not None else None
    if prevented_events is None:
        return
    for idx, band in enumerate(BANDS):
        calc = prevented_events[idx] * event_value[idx]
        if abs(calc - displayed_c1[idx]) > 0.00051:
            errors.append(
                "%s channels.c1_prevention.%s %.6f does not match event runner %.6f"
                % (label, band, displayed_c1[idx], calc)
            )


def validate_event_or_curve_shift_zero_secondary_channels(action, label, errors):
    """Keep the current event adapter honest about channels it does not score.

    The shared event_or_curve_shift_action scorer emits C1 only, with C2 and C3
    set to zero. Fully-derived rows using that method must not carry hand-authored
    nonzero secondary channels until the runner schema computes them directly.
    """
    channels = action.get("channels") or {}
    for channel in ("c2_capacity", "c3_resilience"):
        values = band_tuple(channels.get(channel))
        if values is None:
            continue
        if any(abs(value) > 1e-12 for value in values):
            errors.append(
                "%s %s must be zero for event_or_curve_shift_action until the runner computes secondary channels"
                % (label, channel)
            )


def validate_event_effect_binding(derivation_inputs, label, errors):
    """Reject ambiguous event-action effect and baseline bindings.

    The shared runner can score ARR directly, or can convert exactly one RR/HR
    effect source into an RRR. Fully-derived rows should not carry both a source
    RR/HR and a derived RRR because the validator could otherwise pass one while
    reviewers read the other.
    """
    effect_type = str(derivation_inputs.get("effect_type", "RRR")).upper()
    has_baseline = "baseline_event_risk" in derivation_inputs
    has_risk_domain = "risk_domain" in derivation_inputs
    has_rrr = "relative_risk_reduction" in derivation_inputs
    has_effect_value = "effect_value" in derivation_inputs

    if effect_type == "ARR":
        if "absolute_risk_reduction" not in derivation_inputs:
            errors.append("%s ARR event action missing absolute_risk_reduction" % label)
        if has_rrr or has_effect_value:
            errors.append("%s ARR event action must not also bind relative effect values" % label)
        return

    if has_baseline == has_risk_domain:
        errors.append("%s event action must bind exactly one of baseline_event_risk or risk_domain" % label)
    if effect_type == "RRR":
        if not has_rrr:
            errors.append("%s RRR event action missing relative_risk_reduction" % label)
        if has_effect_value:
            errors.append("%s RRR event action must not also bind effect_value" % label)
    elif effect_type in {"RR", "HR"}:
        if has_rrr == has_effect_value:
            errors.append("%s RR/HR event action must bind exactly one of relative_risk_reduction or effect_value" % label)


def event_action_basis_keys(derivation_inputs):
    """Audit-basis keys required by the event-action runner schema.

    ARR records do not need a baseline risk basis because the risk delta is
    already absolute. RR/HR/RRR records must bind either a static baseline event
    risk or a patient-packet risk domain before they can be runner-owned.
    """
    effect_type = str(derivation_inputs.get("effect_type", "RRR")).upper()
    if effect_type == "ARR":
        return ["absolute_risk_reduction", "event_value_qaly", "sustained_horizon_years"]
    baseline_basis_key = "risk_domain" if derivation_inputs.get("risk_domain") else "baseline_event_risk"
    effect_basis_key = "relative_risk_reduction" if "relative_risk_reduction" in derivation_inputs else "effect_value"
    return [baseline_basis_key, effect_basis_key, "event_value_qaly", "sustained_horizon_years"]


def validate_harm_aware_event_net_shape(action, label, errors):
    """Require harm-aware event net value to be explicitly runner-owned.

    The harm-aware runner subtracts explicit harm objects and action burden from
    the C1 benefit. A fully-derived row must not expose a hand-authored net scalar
    or a calculation string that omits either debit.
    """
    net = action.get("net_qaly_if_achieved")
    if isinstance(net, dict) and all(isinstance(net.get(band), (int, float)) for band in BANDS):
        return
    calculation = net.get("calculation") if isinstance(net, dict) else None
    required_terms = ("runner_computed", "harm_qaly_loss", "action_burden_qaly")
    if not isinstance(calculation, str) or any(term not in calculation for term in required_terms):
        errors.append(
            "%s harm-aware event net_qaly_if_achieved must be runner_computed with harm_qaly_loss and action_burden_qaly"
            % label
        )


def validate_harm_aware_secondary_channels_runner_math(action, label, errors):
    """Verify displayed C2/C3 channels are runner-owned for harm-aware events.

    The harm-aware event runner can emit direct_c2_capacity and
    direct_c3_resilience, but those values must come from derivation_inputs. If a
    row omits those inputs, the displayed secondary channel must be an honest
    zero rather than a hand-authored add-on.
    """
    derivation_inputs = action.get("derivation_inputs") or {}
    channels = action.get("channels") or {}
    expected_by_channel = {
        "c2_capacity": band_tuple(derivation_inputs.get("direct_c2_capacity", 0.0)),
        "c3_resilience": band_tuple(derivation_inputs.get("direct_c3_resilience", 0.0)),
    }
    for channel, expected in expected_by_channel.items():
        if expected is None:
            errors.append("%s derivation_inputs.%s must be a low/central/high band or scalar" % (label, channel))
            continue
        displayed = band_tuple(channels.get(channel))
        if displayed is None:
            errors.append("%s %s must be a low/central/high band" % (label, channel))
            continue
        for idx, band in enumerate(BANDS):
            if abs(displayed[idx] - expected[idx]) > 0.00051:
                errors.append(
                    "%s %s.%s %.6f does not match harm-aware runner %.6f"
                    % (label, channel, band, displayed[idx], expected[idx])
                )


def validate_harm_objects_and_burden_schedule(action, label, errors):
    derivation_inputs = action.get("derivation_inputs") or {}
    harms = derivation_inputs.get("harm_objects")
    if not isinstance(harms, list) or not harms:
        errors.append("%s harm_aware_event_action requires non-empty harm_objects" % label)
    for idx, harm in enumerate(harms or []):
        if not isinstance(harm, dict):
            errors.append("%s harm_objects[%d] must be an object" % (label, idx))
            continue
        if not harm.get("id"):
            errors.append("%s harm_objects[%d] missing id" % (label, idx))
        numeric_band(harm.get("probability"), "%s harm_objects[%s].probability" % (label, harm.get("id", idx)), errors, probability=True)
        numeric_band(harm.get("value_qaly_loss"), "%s harm_objects[%s].value_qaly_loss" % (label, harm.get("id", idx)), errors)
        trace_parameter = harm.get("evidence_trace_parameter")
        if not trace_parameter:
            errors.append("%s harm_objects[%s] missing evidence_trace_parameter" % (label, harm.get("id", idx)))
        elif not str(trace_parameter).startswith("harm_objects."):
            errors.append(
                "%s harm_objects[%s].evidence_trace_parameter must use harm_objects.* namespace"
                % (label, harm.get("id", idx))
            )
    schedule = derivation_inputs.get("burden_schedule")
    if not isinstance(schedule, list) or not schedule:
        errors.append("%s harm_aware_event_action requires non-empty burden_schedule" % label)
    for idx, burden in enumerate(schedule or []):
        if not isinstance(burden, dict):
            errors.append("%s burden_schedule[%d] must be an object" % (label, idx))
            continue
        if burden.get("cadence") not in {"one_time", "per_year", "per_cycle", "replacement_interval", "surveillance_interval", "course"}:
            errors.append("%s burden_schedule[%s].cadence unsupported" % (label, burden.get("id", idx)))
        numeric_band(burden.get("duration_years"), "%s burden_schedule[%s].duration_years" % (label, burden.get("id", idx)), errors)
        numeric_band(burden.get("value_qaly_loss"), "%s burden_schedule[%s].value_qaly_loss" % (label, burden.get("id", idx)), errors)
        if burden.get("cadence") in {"per_cycle", "replacement_interval", "surveillance_interval"}:
            interval = burden.get("interval_years")
            if not isinstance(interval, (int, float)) or interval <= 0:
                errors.append("%s burden_schedule[%s] requires positive interval_years" % (label, burden.get("id", idx)))
        trace_parameter = burden.get("evidence_trace_parameter")
        if not trace_parameter:
            errors.append("%s burden_schedule[%s] missing evidence_trace_parameter" % (label, burden.get("id", idx)))
        elif not str(trace_parameter).startswith("burden_schedule."):
            errors.append(
                "%s burden_schedule[%s].evidence_trace_parameter must use burden_schedule.* namespace"
                % (label, burden.get("id", idx))
            )


def validate_fully_derived_event_action(action, label, errors):
    if action.get("status") != "fully_derived_v2":
        return
    for key in ("source_action_ids", "trace_status", "runner_method", "derivation_inputs"):
        if key not in action:
            errors.append("%s fully_derived_v2 missing %s" % (label, key))
    if action.get("trace_status") != "runner_computed":
        errors.append("%s fully_derived_v2 requires trace_status=runner_computed" % label)
    derivation_inputs = action.get("derivation_inputs") or {}
    if derivation_inputs.get("method") == "event_or_curve_shift_action":
        if action.get("runner_method") != "event_or_curve_shift_action":
            errors.append("%s runner_method must match event_or_curve_shift_action" % label)
        effect_type = str(derivation_inputs.get("effect_type", "RRR")).upper()
        if effect_type not in {"RR", "HR", "RRR", "ARR"}:
            errors.append("%s derivation_inputs.effect_type must be RR, HR, RRR, or ARR" % label)
        validate_event_effect_binding(derivation_inputs, label, errors)
        numeric_band(
            derivation_inputs.get("event_value_qaly"),
            "%s derivation_inputs.event_value_qaly" % label,
            errors,
        )
        if effect_type == "ARR":
            numeric_band(
                derivation_inputs.get("absolute_risk_reduction"),
                "%s derivation_inputs.absolute_risk_reduction" % label,
                errors,
                probability=True,
            )
        else:
            if derivation_inputs.get("risk_domain"):
                if not isinstance(derivation_inputs.get("risk_domain"), str):
                    errors.append("%s derivation_inputs.risk_domain must be a string" % label)
            else:
                numeric_band(
                    derivation_inputs.get("baseline_event_risk"),
                    "%s derivation_inputs.baseline_event_risk" % label,
                    errors,
                    probability=True,
                )
            if "relative_risk_reduction" in derivation_inputs:
                numeric_band(
                    derivation_inputs.get("relative_risk_reduction"),
                    "%s derivation_inputs.relative_risk_reduction" % label,
                    errors,
                    probability=True,
                )
            elif effect_type in {"RR", "HR"}:
                numeric_band(
                    derivation_inputs.get("effect_value"),
                    "%s derivation_inputs.effect_value" % label,
                    errors,
                    probability=True,
                )
            else:
                errors.append("%s event action missing relative_risk_reduction" % label)
        if "legacy_qaly_per_event" in derivation_inputs:
            errors.append("%s fully_derived_v2 must not use legacy_qaly_per_event" % label)
        horizon = derivation_inputs.get("sustained_horizon_years")
        if not isinstance(horizon, (int, float)) or horizon <= 0:
            errors.append("%s event action missing positive sustained_horizon_years" % label)
        basis = derivation_inputs.get("basis")
        if not isinstance(basis, dict):
            errors.append("%s event action missing derivation_inputs.basis audit object" % label)
        else:
            for basis_key in event_action_basis_keys(derivation_inputs):
                if not basis.get(basis_key):
                    errors.append("%s event action derivation_inputs.basis missing %s" % (label, basis_key))
        burden = action.get("burden_qaly") or {}
        if burden.get("units") not in ("per_year", "one_time"):
            errors.append("%s burden_qaly.units must be per_year or one_time" % label)
        if not isinstance(action.get("overlap_group"), str) or not action.get("overlap_group"):
            errors.append("%s fully_derived_v2 missing overlap_group" % label)
        validate_event_or_curve_shift_net_shape(action, label, errors)
        validate_event_or_curve_shift_runner_math(action, label, errors)
        validate_event_or_curve_shift_zero_secondary_channels(action, label, errors)
    elif derivation_inputs.get("method") == "harm_aware_event_action":
        if action.get("runner_method") != "harm_aware_event_action":
            errors.append("%s runner_method must match harm_aware_event_action" % label)
        effect_type = str(derivation_inputs.get("effect_type", "RRR")).upper()
        if effect_type not in {"RR", "HR", "RRR", "ARR"}:
            errors.append("%s derivation_inputs.effect_type must be RR, HR, RRR, or ARR" % label)
        validate_event_effect_binding(derivation_inputs, label, errors)
        numeric_band(derivation_inputs.get("event_value_qaly"), "%s derivation_inputs.event_value_qaly" % label, errors)
        if effect_type == "ARR":
            numeric_band(derivation_inputs.get("absolute_risk_reduction"), "%s derivation_inputs.absolute_risk_reduction" % label, errors, probability=True)
        else:
            if derivation_inputs.get("risk_domain"):
                if not isinstance(derivation_inputs.get("risk_domain"), str):
                    errors.append("%s derivation_inputs.risk_domain must be a string" % label)
            else:
                numeric_band(derivation_inputs.get("baseline_event_risk"), "%s derivation_inputs.baseline_event_risk" % label, errors, probability=True)
            if "relative_risk_reduction" in derivation_inputs:
                numeric_band(derivation_inputs.get("relative_risk_reduction"), "%s derivation_inputs.relative_risk_reduction" % label, errors, probability=True)
            elif effect_type in {"RR", "HR"}:
                numeric_band(derivation_inputs.get("effect_value"), "%s derivation_inputs.effect_value" % label, errors, probability=True)
            else:
                errors.append("%s harm-aware event action missing relative_risk_reduction" % label)
        if "legacy_qaly_per_event" in derivation_inputs:
            errors.append("%s fully_derived_v2 must not use legacy_qaly_per_event" % label)
        burden = action.get("burden_qaly") or {}
        if burden.get("units") not in ("per_year", "one_time", "course"):
            errors.append("%s harm-aware event burden_qaly.units must be per_year, one_time, or course" % label)
        horizon = derivation_inputs.get("sustained_horizon_years")
        if not isinstance(horizon, (int, float)) or horizon <= 0:
            errors.append("%s harm-aware event action missing positive sustained_horizon_years" % label)
        basis = derivation_inputs.get("basis")
        if not isinstance(basis, dict):
            errors.append("%s harm-aware event action missing derivation_inputs.basis audit object" % label)
        else:
            for basis_key in event_action_basis_keys(derivation_inputs) + ["harm_objects", "burden_schedule"]:
                if not basis.get(basis_key):
                    errors.append("%s harm-aware event action derivation_inputs.basis missing %s" % (label, basis_key))
        validate_harm_aware_event_net_shape(action, label, errors)
        validate_harm_objects_and_burden_schedule(action, label, errors)
        if not isinstance(action.get("overlap_group"), str) or not action.get("overlap_group"):
            errors.append("%s fully_derived_v2 missing overlap_group" % label)
        validate_event_or_curve_shift_runner_math(action, label, errors)
        validate_harm_aware_secondary_channels_runner_math(action, label, errors)
    elif derivation_inputs.get("method") == "procedure_device_action":
        validate_procedure_device_action(action, label, errors)
    elif derivation_inputs:
        errors.append("%s fully_derived_v2 uses unsupported method %s" % (label, derivation_inputs.get("method")))


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


def validate_fully_derived_source_action_ids(item, label, legacy_action_ids, errors):
    """Fully-derived records must map back to concrete legacy 145-action IDs."""
    if item.get("status") != "fully_derived_v2":
        return
    source_ids = item.get("source_action_ids")
    if not isinstance(source_ids, list) or not source_ids:
        errors.append("%s fully_derived_v2 source_action_ids must be a non-empty list" % label)
        return
    for source_id in source_ids:
        if not isinstance(source_id, str) or not source_id:
            errors.append("%s fully_derived_v2 source_action_ids contains a non-string/empty id" % label)
        elif legacy_action_ids and source_id not in legacy_action_ids:
            errors.append("%s fully_derived_v2 references unknown legacy source_action_id %s" % (label, source_id))


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
    validate_fully_derived_source_action_ids(action, "action %s" % aid, legacy_action_ids, errors)
    validate_fully_derived_event_action(action, "action %s" % aid, errors)


def validate_diagnostic(diagnostic, required_fields, legacy_action_ids, errors):
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
    validate_fully_derived_source_action_ids(diagnostic, "diagnostic %s" % did, legacy_action_ids, errors)
    validate_fully_derived_diagnostic(diagnostic, "diagnostic %s" % did, errors)


def validate_fully_derived_diagnostic(diagnostic, label, errors):
    if diagnostic.get("status") != "fully_derived_v2":
        return
    for key in ("source_action_ids", "trace_status", "runner_method", "derivation_inputs"):
        if key not in diagnostic:
            errors.append("%s fully_derived_v2 missing %s" % (label, key))
    if diagnostic.get("trace_status") != "runner_computed":
        errors.append("%s fully_derived_v2 requires trace_status=runner_computed" % label)
    if diagnostic.get("runner_method") != "diagnostic_direct_voi":
        errors.append("%s runner_method must match diagnostic_direct_voi" % label)
    derivation_inputs = diagnostic.get("derivation_inputs") or {}
    if derivation_inputs.get("method") != "diagnostic_direct_voi":
        errors.append("%s fully_derived_v2 uses unsupported diagnostic method %s" % (label, derivation_inputs.get("method")))
    if "legacy_qaly_per_event" in derivation_inputs:
        errors.append("%s fully_derived_v2 must not use legacy_qaly_per_event" % label)
    for key in ("reclassification_probability", "qaly_if_reclassified", "test_burden"):
        if key not in derivation_inputs:
            errors.append("%s derivation_inputs missing %s" % (label, key))
    validate_evidence_trace(
        diagnostic,
        label,
        [
            "reclassification_probability",
            "qaly_if_reclassified",
            "test_burden",
            "evidence_grade",
            "downstream_decisions_changed",
        ],
        errors,
    )


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
        validate_diagnostic(diagnostic, required_diagnostics, legacy_action_ids, errors)

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
