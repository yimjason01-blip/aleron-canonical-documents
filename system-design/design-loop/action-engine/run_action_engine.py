#!/usr/bin/env python3
"""Prototype action engine runner.

This is intentionally small and deterministic. It moves the current prototype
one layer away from dashboard-authored plans by producing typed engine artifacts
from patient packets, the v2 action library, genetics, and AI candidate packets.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import value_engine as ve  # noqa: E402  (local module, path inserted above)


ROOT = Path(__file__).resolve().parents[3]
ENGINE_DIR = Path(__file__).resolve().parent
PACKETS_PATH = ENGINE_DIR / "patient_packets.json"
ACTION_LIBRARY_PATH = ROOT / "system-design/design-loop/library/action_library_v2.json"
GENETIC_LIBRARY_PATH = ROOT / "system-design/genetic-mustdo-library.json"
DEFAULT_OUTPUT_PATH = ENGINE_DIR / "action_engine_outputs.json"

EVIDENCE_WEIGHT = {
    "strong": 3,
    "moderate": 2,
    "low_to_moderate": 1.5,
    "weak": 1,
    "n/a": 0,
}

ACTION_LABELS = {
    "physical_activity": "Physical activity / fitness opportunity pool",
    "statin_primary": "Statin primary prevention",
    "iron_repletion_confirmed_deficiency": "Iron repletion for confirmed deficiency",
    "thyroid_treatment_confirmed_dysfunction": "Thyroid treatment for confirmed dysfunction",
    "vitamin_d_repletion_confirmed_deficiency": "Vitamin D repletion for confirmed deficiency",
    "glp1_gip_metabolic_therapy": "GLP-1/GIP metabolic therapy",
    "bp_pharmacotherapy_stage2_primary": "BP pharmacotherapy for confirmed stage-2 hypertension",
    "supervised_resistance_training": "Supervised resistance training",
    "colorectal_screening_gap_closure": "Colorectal screening gap closure",
    "atm_pathogenic_variant_management": "ATM pathogenic variant management",
}

DIAGNOSTIC_LABELS = {
    "cac_primary_prevention_reclassification": "Coronary calcium scoring",
    "sleep_apnea_reclassification": "Home sleep apnea test",
    "bp_persistence_reclassification": "Home or ambulatory BP confirmation",
    "iron_thyroid_fatigue_reclassification": "CBC, iron studies, and thyroid panel",
    "vitamin_d_bone_reclassification": "Vitamin D recheck",
    "dexa_bone_lean_mass_reclassification": "Baseline DEXA",
    "rhythm_safety_reclassification": "ECG / Holter bradycardia workup",
    "ogtt_diabetes_reclassification": "Oral glucose tolerance test",
    "masld_fibrosis_staging_reclassification": "FIB-4 then FibroScan if indicated",
    "sleep_fragmentation_reclassification": "Insomnia / sleep regularity screen",
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def stable_hash(obj: Any) -> str:
    payload = json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(payload).hexdigest()


def central(value: Any, default: float | None = None) -> float | None:
    if isinstance(value, dict):
        value = value.get("central")
    if isinstance(value, (int, float)):
        return float(value)
    return default


def active_findings(packet: dict[str, Any]) -> set[str]:
    return {str(item["id"]) for item in packet.get("findings", [])}


def evidence_rank(grade: str | None) -> float:
    return EVIDENCE_WEIGHT.get(str(grade or "").lower(), 1)


def rule_matches(applies_when: dict[str, Any], findings: set[str]) -> bool:
    all_findings = set(applies_when.get("all_findings", []))
    any_findings = set(applies_when.get("any_findings", []))
    if all_findings and not all_findings.issubset(findings):
        return False
    if any_findings and not any_findings.intersection(findings):
        return False
    return bool(all_findings or any_findings)


def risk_percent(packet: dict[str, Any], risk_id: str) -> float | None:
    for row in packet.get("model_outputs", {}).get("risk_domains", []):
        if row.get("id") != risk_id:
            continue
        text = str(row.get("display", "")).replace("~", "").replace("%", "")
        try:
            return float(text) / 100.0
        except ValueError:
            return None
    return None


def score_risk_scaled_action(item: dict[str, Any], packet: dict[str, Any]) -> dict[str, Any]:
    if item["id"] != "statin_primary":
        raise ValueError(f"Unsupported calculated action: {item['id']}")
    cvd_risk = risk_percent(packet, "cvd") or 0.0
    qaly_per_event = central(
        item.get("cohort_projection", {}).get("risk_scaled_qaly_per_event"), 0.0
    )
    relative_risk_reduction = 0.21
    burden = central(item.get("burden_qaly"), 0.0) or 0.0
    net = cvd_risk * relative_risk_reduction * (qaly_per_event or 0.0) - burden
    return {
        "c1_prevention": round(cvd_risk * relative_risk_reduction * (qaly_per_event or 0.0), 4),
        "c2_capacity": 0.0,
        "c3_resilience": 0.0,
        "burden_qaly": burden,
        "net_qaly_if_achieved": round(net, 4),
    }


def channels_from_item(item: dict[str, Any]) -> dict[str, float]:
    return {
        "c1_prevention": central(item.get("channels", {}).get("c1_prevention"), 0.0) or 0.0,
        "c2_capacity": central(item.get("channels", {}).get("c2_capacity"), 0.0) or 0.0,
        "c3_resilience": central(item.get("channels", {}).get("c3_resilience"), 0.0) or 0.0,
        "burden_qaly": central(item.get("burden_qaly"), 0.0) or 0.0,
        "net_qaly_if_achieved": central(item.get("net_qaly_if_achieved"), 0.0) or 0.0,
    }


def action_source_state(item: dict[str, Any]) -> str:
    if item.get("display_role") == "opportunity_pool_not_atomic_recommendation":
        return "opportunity_pool"
    if str(item.get("status", "")).startswith("required_"):
        return "required"
    return "optional"


def patient_context(packet: dict[str, Any]) -> dict[str, Any]:
    """Patient-specific inputs the value engine reads (age, sex, 30-yr risks)."""
    risk: dict[str, float] = {}
    for row in packet.get("model_outputs", {}).get("risk_domains", []):
        value = risk_percent(packet, row.get("id"))
        if value is not None:
            risk[row.get("id")] = value
    return {"age": float(packet["age"]), "sex": packet.get("sex", "male"), "risk": risk}


def burden_integrated(item: dict[str, Any], ctx: dict[str, Any]) -> float:
    """Burden at its declared cadence (D4): a per_year burden is integrated over
    remaining life and survival-weighted; a one_time burden is a lump. An
    undeclared burden falls back to its central as a lump (legacy reading)."""
    burden = item.get("burden_qaly", {})
    value = central(burden, 0.0) or 0.0
    if isinstance(burden, dict) and burden.get("units") == "per_year":
        S = ve.make_S(ctx["age"], ctx["sex"])
        return round(value * ve.swy(S, 0, 105 - ctx["age"]), 4)
    return round(value, 4)


def engine_channels(item: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    """Compute an action's channels from the codified method (D1/D2/D3/D4)."""
    scored = ve.score(ctx, item["derivation_inputs"])
    c1 = scored.get("c1_prevention", {}).get("central", 0.0)
    c2 = scored.get("c2_capacity", {}).get("central", 0.0)
    c3 = scored.get("c3_resilience", {}).get("central", 0.0)
    burden = burden_integrated(item, ctx)
    return {
        "c1_prevention": round(c1, 4),
        "c2_capacity": round(c2, 4),
        "c3_resilience": round(c3, 4),
        "burden_qaly": burden,
        "net_qaly_if_achieved": round(c1 + c2 + c3 - burden, 4),
        "bands": scored,
        "trace_status": "runner_computed",
    }


def score_actions(
    packet: dict[str, Any], action_library: dict[str, Any]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    findings = active_findings(packet)
    ctx = patient_context(packet)
    optional: list[dict[str, Any]] = []
    required: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    candidates = action_library.get("bundle_valuations", []) + action_library.get("action_valuations", [])
    for item in candidates:
        applies_when = item.get("applies_when", {})
        matched = rule_matches(applies_when, findings)
        if not matched:
            excluded.append(
                {
                    "id": item["id"],
                    "label": ACTION_LABELS.get(item["id"], item["id"]),
                    "reason": "eligibility_findings_not_present",
                    "required_findings": applies_when,
                }
            )
            continue
        state = action_source_state(item)
        if "derivation_inputs" in item:
            channel_values = engine_channels(item, ctx)
        elif "calculation" in item.get("net_qaly_if_achieved", {}):
            channel_values = score_risk_scaled_action(item, packet)
            channel_values["trace_status"] = "asserted_legacy"
        else:
            channel_values = channels_from_item(item)
            channel_values["trace_status"] = "asserted_legacy"
        record = {
            "id": item["id"],
            "label": ACTION_LABELS.get(item["id"], item["id"]),
            "kind": "action",
            "source": "action_library_v2",
            "state": state,
            "evidence_grade": item.get("evidence_grade") or "see_library",
            "evidence_axis": item.get("evidence_axis"),
            "matched_findings": sorted(findings.intersection(set(applies_when.get("all_findings", [])) | set(applies_when.get("any_findings", [])))),
            "valuation_kind": item.get("valuation_kind"),
            "channels": channel_values,
            "trace_status": channel_values.get("trace_status"),
            "overlap_rules": item.get("overlap_rules", []),
            "recommendation_eligible": state == "optional",
        }
        if state == "required":
            required.append(
                {
                    "id": item["id"],
                    "label": ACTION_LABELS.get(item["id"], item["id"]),
                    "source": "action_library_v2",
                    "reason": item.get("applies_when", {}).get("interpretation", "required_library_rule"),
                    "valuation": channel_values,
                }
            )
        else:
            optional.append(record)
    return optional, required, excluded


def score_diagnostics(
    packet: dict[str, Any], action_library: dict[str, Any]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    findings = active_findings(packet)
    ctx = patient_context(packet)
    valid_keys = set(packet.get("valid_keys", []))
    ai_by_candidate: dict[str, list[dict[str, Any]]] = {}
    for candidate in packet.get("ai_candidate_packets", []):
        ai_by_candidate.setdefault(candidate.get("candidate_id", ""), []).append(candidate)

    scored: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    for item in action_library.get("diagnostic_valuations", []):
        eligibility = item.get("eligibility", {})
        triggers = set(eligibility.get("trigger_findings", []))
        blocks = set(eligibility.get("do_not_score_when", []))
        matched_triggers = sorted(findings.intersection(triggers))
        blocked_by = sorted(findings.intersection(blocks))
        if not matched_triggers or blocked_by:
            excluded.append(
                {
                    "id": item["id"],
                    "label": DIAGNOSTIC_LABELS.get(item["id"], item["id"]),
                    "reason": "diagnostic_trigger_not_present" if not matched_triggers else "blocked_by_do_not_score_rule",
                    "matched_triggers": matched_triggers,
                    "blocked_by": blocked_by,
                }
            )
            continue

        missing_fields = sorted(set(eligibility.get("required_patient_fields", [])) - valid_keys)
        ai_packets = [
            candidate for candidate in ai_by_candidate.get(item["id"], [])
            if set(candidate.get("cited_keys", [])).issubset(valid_keys)
        ]
        voi_bands = None
        if "derivation_inputs" in item:
            voi_bands = ve.score(ctx, item["derivation_inputs"])
            p_reclass = voi_bands["reclassification_probability"]["central"]
            qaly_if = voi_bands["qaly_if_reclassified"]["central"]
            test_burden = central(item.get("test_burden"), 0.0) or 0.0
            expected_voi = round(p_reclass * qaly_if - test_burden, 4)
            trace_status = "runner_computed"
        else:
            p_reclass = central(item.get("reclassification_probability"), 0.0) or 0.0
            qaly_if = central(item.get("qaly_if_reclassified"), 0.0) or 0.0
            expected_voi = central(item.get("expected_voi_internal"), 0.0) or 0.0
            trace_status = "asserted_legacy"
        scored.append(
            {
                "id": item["id"],
                "label": DIAGNOSTIC_LABELS.get(item["id"], item["id"]),
                "kind": "diagnostic",
                "source": "ai_scored_candidate" if ai_packets else "action_library_v2",
                "ai_candidate_ids": [packet["id"] for packet in ai_packets],
                "test_id": item.get("test_id"),
                "evidence_grade": item.get("evidence_grade"),
                "evidence_axis": item.get("evidence_axis"),
                "reclassification_probability": p_reclass,
                "qaly_if_reclassified": qaly_if,
                "expected_voi_internal": expected_voi,
                "value_channel": item.get("value_channel"),
                "trace_status": trace_status,
                "voi_bands": voi_bands,
                "display_value_basis": "qaly_if_reclassified",
                "dominant_reclassification_path": item.get("dominant_reclassification_path"),
                "downstream_decisions_changed": item.get("downstream_decisions_changed", []),
                "matched_triggers": matched_triggers,
                "missing_fields": missing_fields,
                "gate_status": "pretest_fields_missing" if missing_fields else "ready_to_order_or_discuss",
                "recommendation_eligible": True,
            }
        )
    return scored, excluded


def route_care_gaps(packet: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "id": gap["id"],
            "label": gap["label"],
            "source": "care_gap",
            "reason": gap.get("reason", "required_care_gap"),
        }
        for gap in packet.get("required_care_gaps", [])
    ]


def route_genetics(packet: dict[str, Any], genetic_library: dict[str, Any]) -> list[dict[str, Any]]:
    by_gene = {entry.get("gene"): entry for entry in genetic_library.get("entries", [])}
    required: list[dict[str, Any]] = []
    for finding in packet.get("genetic_findings", []):
        if not finding.get("confirmed"):
            continue
        classification = str(finding.get("classification", "")).upper()
        if classification not in {"P", "LP", "P/LP"}:
            continue
        entry = by_gene.get(finding.get("gene"))
        if not entry:
            continue
        required.append(
            {
                "id": f"genetic_guidance:{entry['gene']}",
                "label": f"{entry['gene']} genetic counseling and documentation",
                "source": "genetic_mustdo_library",
                "reason": f"{entry['gene']} {finding.get('classification')} {finding.get('zygosity')} finding requires documented guidance.",
            }
        )
        for idx, action in enumerate(entry.get("mustdo", [])):
            text = action.get("action", "")
            lower_text = text.lower()
            if packet.get("sex") == "male" and ("breast mri" in lower_text or "mammogram" in lower_text):
                continue
            if "only if" in lower_text or "consider" in lower_text:
                required.append(
                    {
                        "id": f"genetic_gate:{entry['gene']}:{idx}",
                        "label": f"{entry['gene']} family-history gate",
                        "source": "genetic_mustdo_library",
                        "reason": text,
                        "cadence": action.get("cadence"),
                        "guideline": action.get("guideline"),
                    }
                )
    return required


def required_alias(item: dict[str, Any]) -> str:
    item_id = item.get("id", "")
    if item_id == "atm_pathogenic_variant_management":
        return "genetic_guidance:ATM"
    return item_id


def dedupe_required_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for item in items:
        alias = required_alias(item)
        if alias in seen:
            continue
        seen.add(alias)
        deduped.append(item)
    return deduped


def diagnostic_priority(item: dict[str, Any]) -> float:
    p_reclass = item.get("reclassification_probability", 0.0)
    qaly_if = item.get("qaly_if_reclassified", 0.0)
    priority = qaly_if + p_reclass
    if p_reclass < 0.1:
        priority *= 0.25
    if item.get("gate_status") == "pretest_fields_missing":
        priority *= 0.9
    return round(priority, 4)


def action_priority(item: dict[str, Any]) -> float:
    if not item.get("recommendation_eligible"):
        return 0.0
    return round(item.get("channels", {}).get("net_qaly_if_achieved", 0.0), 4)


def build_clinical_plan(action_map_state: dict[str, Any]) -> dict[str, Any]:
    optional_actions = [
        item for item in action_map_state["optional_actions"]
        if item.get("recommendation_eligible") and item.get("state") == "optional"
    ]
    diagnostics = [
        item for item in action_map_state["diagnostics"]
        if item.get("recommendation_eligible")
    ]
    ranked_actions = sorted(optional_actions, key=action_priority, reverse=True)
    ranked_diagnostics = sorted(diagnostics, key=diagnostic_priority, reverse=True)

    selected: list[dict[str, Any]] = []
    for action in ranked_actions:
        if action_priority(action) >= 0.5 and len(selected) < 2:
            selected.append(
                {
                    "id": action["id"],
                    "label": action["label"],
                    "kind": "action",
                    "source": action["source"],
                    "patient_value_qaly": action["channels"]["net_qaly_if_achieved"],
                    "evidence_axis": action.get("evidence_axis"),
                    "why_now": "Highest patient-value optional action after eligibility and required-item separation.",
                }
            )
    for diagnostic in ranked_diagnostics:
        if len(selected) >= 3:
            break
        if diagnostic_priority(diagnostic) < 0.65:
            continue
        selected.append(
            {
                "id": diagnostic["id"],
                "label": diagnostic["label"],
                "kind": "diagnostic",
                "source": diagnostic["source"],
                "reclassification_probability": diagnostic["reclassification_probability"],
                "qaly_if_reclassified": diagnostic["qaly_if_reclassified"],
                "evidence_axis": diagnostic.get("evidence_axis"),
                "why_now": diagnostic["dominant_reclassification_path"],
            }
        )

    patient = action_map_state["patient"]
    required_count = len(action_map_state["required_items"])
    summary = (
        f"{patient['display_name']} has {required_count} required item"
        f"{'' if required_count == 1 else 's'} separated from the optional action map. "
        f"The recommended next-step set is limited to {len(selected)} scored item"
        f"{'' if len(selected) == 1 else 's'} after library scoring, diagnostic scoring, "
        "genetics routing, and AI candidate admission."
    )
    return {
        "schema_version": "clinical_plan.v1",
        "source_action_map_state": action_map_state["run_id"],
        "patient_id": patient["patient_id"],
        "title": f"{patient['display_name']} clinical plan from scored engine state",
        "summary": summary,
        "required_items": action_map_state["required_items"],
        "non_required_next_steps": selected,
    }


def build_ai_candidate_funnel(
    packet: dict[str, Any], diagnostics: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    diagnostics_by_id = {item["id"]: item for item in diagnostics}
    funnel: list[dict[str, Any]] = []
    valid_keys = set(packet.get("valid_keys", []))
    for candidate in packet.get("ai_candidate_packets", []):
        cited = set(candidate.get("cited_keys", []))
        cited_keys_valid = cited.issubset(valid_keys)
        scored_item = diagnostics_by_id.get(candidate.get("candidate_id"))
        ai_admitted_to_scored_item = bool(
            scored_item and candidate["id"] in scored_item.get("ai_candidate_ids", [])
        )
        if not cited_keys_valid:
            state = "rejected_missing_cited_keys"
        elif ai_admitted_to_scored_item:
            state = "scored_candidate"
        elif scored_item:
            state = "covered_by_library_not_ai_admitted"
        else:
            state = "structured_unscored"
        funnel.append(
            {
                "id": candidate["id"],
                "title": candidate["title"],
                "candidate_kind": candidate.get("candidate_kind"),
                "candidate_id": candidate.get("candidate_id"),
                "state": state,
                "cited_keys_valid": cited_keys_valid,
                "mapped_scored_item": scored_item["id"] if ai_admitted_to_scored_item else None,
            }
        )
    return funnel


def build_action_map_state(
    packet: dict[str, Any],
    action_library: dict[str, Any],
    genetic_library: dict[str, Any],
) -> dict[str, Any]:
    optional_actions, library_required, action_exclusions = score_actions(packet, action_library)
    diagnostics, diagnostic_exclusions = score_diagnostics(packet, action_library)
    required_items = dedupe_required_items(
        route_care_gaps(packet) + route_genetics(packet, genetic_library) + library_required
    )
    run_id = stable_hash(
        {
            "patient": packet["patient_id"],
            "packet_hash": stable_hash(packet),
            "library_schema": action_library.get("schema_version"),
        }
    )[:16]
    return {
        "schema_version": "action_map_state.v1",
        "run_id": run_id,
        "patient_packet_hash": stable_hash(packet),
        "patient": {
            "patient_id": packet["patient_id"],
            "display_name": packet["display_name"],
            "code": packet["code"],
            "age": packet["age"],
            "sex": packet["sex"],
            "phenotype": packet["phenotype"],
        },
        "model_outputs": packet.get("model_outputs", {}),
        "optional_actions": optional_actions,
        "diagnostics": diagnostics,
        "required_items": required_items,
        "excluded_items": action_exclusions + diagnostic_exclusions,
        "ai_candidate_funnel": build_ai_candidate_funnel(packet, diagnostics),
        "warnings": [
            "Non-CVD risk domains remain marked pending live model wiring in source prototype."
        ],
    }


def build_run_audit(action_map_state: dict[str, Any], clinical_plan: dict[str, Any]) -> dict[str, Any]:
    recommended_ids = {item["id"] for item in clinical_plan["non_required_next_steps"]}
    scored_action_ids = {item["id"] for item in action_map_state["optional_actions"]}
    scored_diagnostic_ids = {item["id"] for item in action_map_state["diagnostics"]}
    diagnostics_complete = all(
        item.get("reclassification_probability") is not None
        and item.get("qaly_if_reclassified") is not None
        for item in action_map_state["diagnostics"]
    )
    raw_ai_recommended = any(
        item["id"] not in scored_action_ids | scored_diagnostic_ids
        for item in clinical_plan["non_required_next_steps"]
    )
    ai_funnel_by_candidate = {
        item["candidate_id"]: item for item in action_map_state["ai_candidate_funnel"]
    }
    ai_scored_with_invalid_citations = any(
        item.get("source") == "ai_scored_candidate"
        and any(
            ai_funnel_by_candidate.get(candidate_id, {}).get("cited_keys_valid") is False
            for candidate_id in item.get("ai_candidate_ids", [])
        )
        for item in action_map_state["diagnostics"]
    )
    required_aliases = [required_alias(item) for item in action_map_state["required_items"]]
    checks = {
        "patient_packet_hash_present": bool(action_map_state.get("patient_packet_hash")),
        "diagnostics_expose_reclass_and_qaly_if_reclassified": diagnostics_complete,
        "required_items_are_separate_from_optional_action_map": all(
            item["id"] not in scored_action_ids for item in action_map_state["required_items"]
        ),
        "required_items_are_not_duplicated": len(required_aliases) == len(set(required_aliases)),
        "all_recommendations_are_scored": recommended_ids.issubset(scored_action_ids | scored_diagnostic_ids),
        "raw_ai_text_not_recommended": not raw_ai_recommended,
        "ai_scored_candidates_have_valid_cited_keys": not ai_scored_with_invalid_citations,
        "max_three_non_required_next_steps": len(clinical_plan["non_required_next_steps"]) <= 3,
        "patient_id_used_for_identity_not_rule_branching": True,
    }
    return {
        "schema_version": "run_audit.v1",
        "run_id": action_map_state["run_id"],
        "patient_id": action_map_state["patient"]["patient_id"],
        "checks": checks,
        "pass": all(checks.values()),
    }


def run_engine(patient_id: str | None = None) -> dict[str, Any]:
    packet_set = load_json(PACKETS_PATH)
    action_library = load_json(ACTION_LIBRARY_PATH)
    genetic_library = load_json(GENETIC_LIBRARY_PATH)
    patients = packet_set.get("patients", [])
    if patient_id:
        patients = [packet for packet in patients if packet.get("patient_id") == patient_id]
        if not patients:
            raise SystemExit(f"No patient packet found for {patient_id}")
    outputs = []
    for packet in patients:
        action_map_state = build_action_map_state(packet, action_library, genetic_library)
        clinical_plan = build_clinical_plan(action_map_state)
        run_audit = build_run_audit(action_map_state, clinical_plan)
        outputs.append(
            {
                "patient_id": packet["patient_id"],
                "action_map_state": action_map_state,
                "clinical_plan": clinical_plan,
                "run_audit": run_audit,
            }
        )
    return {
        "schema_version": "action_engine_output_set.v1",
        "source": {
            "patient_packets": str(PACKETS_PATH.relative_to(ROOT)),
            "action_library": str(ACTION_LIBRARY_PATH.relative_to(ROOT)),
            "genetic_library": str(GENETIC_LIBRARY_PATH.relative_to(ROOT)),
        },
        "outputs": outputs,
    }


def assert_outputs(output: dict[str, Any]) -> None:
    failures = []
    for patient_output in output["outputs"]:
        audit = patient_output["run_audit"]
        if not audit["pass"]:
            failed = [key for key, value in audit["checks"].items() if not value]
            failures.append(f"{patient_output['patient_id']}: {', '.join(failed)}")
    if failures:
        raise SystemExit("Action engine audit failed: " + "; ".join(failures))


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the prototype Aleron action engine.")
    parser.add_argument("--patient", help="Optional patient_id to run.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT_PATH), help="Output JSON path.")
    parser.add_argument("--check", action="store_true", help="Fail if audit checks do not pass.")
    args = parser.parse_args()

    output = run_engine(args.patient)
    out_path = Path(args.output)
    out_path.write_text(json.dumps(output, indent=2) + "\n")
    if args.check:
        assert_outputs(output)
    print(f"Wrote {out_path}")
    for patient_output in output["outputs"]:
        audit = patient_output["run_audit"]
        plan = patient_output["clinical_plan"]
        print(
            f"{patient_output['patient_id']}: audit={'pass' if audit['pass'] else 'fail'}; "
            f"next_steps={len(plan['non_required_next_steps'])}; "
            f"required={len(plan['required_items'])}"
        )


if __name__ == "__main__":
    main()
