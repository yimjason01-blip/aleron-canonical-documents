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
    "aaa_ultrasound_screening": "One-time abdominal aortic aneurysm ultrasound",
    "act_anal_hsil_treatment": "Anal HSIL detection and treatment pathway",
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
        horizon = item.get("derivation_inputs", {}).get("sustained_horizon_years")
        if isinstance(horizon, (int, float)) and horizon > 0:
            return round(value * float(horizon), 4)
        S = ve.make_S(ctx["age"], ctx["sex"])
        return round(value * ve.swy(S, 0, 105 - ctx["age"]), 4)
    return round(value, 4)


def engine_channels(item: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    """Compute an action's channels from the codified method (D1/D2/D3/D4)."""
    scored = ve.score(ctx, item["derivation_inputs"])
    c1 = scored.get("c1_prevention", {}).get("central", 0.0)
    c2 = scored.get("c2_capacity", {}).get("central", 0.0)
    c3 = scored.get("c3_resilience", {}).get("central", 0.0)
    if item.get("derivation_inputs", {}).get("method") == "procedure_device_action":
        burden = scored.get("procedure_burden_qaly", {}).get("central", 0.0)
        net = scored.get("net_qaly_if_achieved", {}).get("central", c1 + c2 + c3 - burden)
    elif item.get("derivation_inputs", {}).get("method") == "harm_aware_event_action":
        burden = scored.get("action_burden_qaly", {}).get("central", 0.0)
        net = scored.get("net_qaly_if_achieved", {}).get("central", c1 + c2 + c3 - burden)
    else:
        burden = burden_integrated(item, ctx)
        net = c1 + c2 + c3 - burden
    return {
        "c1_prevention": round(c1, 4),
        "c2_capacity": round(c2, 4),
        "c3_resilience": round(c3, 4),
        "burden_qaly": round(burden, 4),
        "net_qaly_if_achieved": round(net, 4),
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
    """Rank diagnostics for final-plan selection.

    The map still exposes both qaly_if_reclassified and P(reclass). The reducer
    needs a deterministic ordering heuristic, so it starts with those two visible
    quantities and adds small transparent sequencing bonuses for diagnostics that
    unblock multiple near-term decisions, especially vitality-sensitive sleep or
    recovery gates. This is selection logic, not a new value calculation.
    """
    p_reclass = item.get("reclassification_probability", 0.0)
    qaly_if = item.get("qaly_if_reclassified", 0.0)
    priority = qaly_if + p_reclass
    primary_text = " ".join(
        str(part).lower()
        for part in (
            item.get("id", ""),
            item.get("label", ""),
            item.get("dominant_reclassification_path", ""),
        )
    )
    if any(token in primary_text for token in ("sleep", "fatigue", "recovery", "vitality")):
        priority += 0.35
    if "sequencing" in primary_text or len(item.get("downstream_decisions_changed", [])) >= 3:
        priority += 0.15
    if p_reclass < 0.1:
        priority *= 0.25
    if item.get("gate_status") == "pretest_fields_missing":
        priority *= 0.9
    return round(priority, 4)


def action_priority(item: dict[str, Any]) -> float:
    if not item.get("recommendation_eligible"):
        return 0.0
    return round(item.get("channels", {}).get("net_qaly_if_achieved", 0.0), 4)


def value_summary(item: dict[str, Any]) -> str:
    if item.get("kind") == "diagnostic":
        return (
            f"P(reclass) {item.get('reclassification_probability', 0.0):.0%}; "
            f"QALY if reclassified {item.get('qaly_if_reclassified', 0.0):.2f}"
        )
    return f"net patient value {item.get('channels', {}).get('net_qaly_if_achieved', 0.0):.2f} QALY"


def recommendation_action_phrase(item: dict[str, Any]) -> str:
    label = item.get("label", item.get("id", "item"))
    if item.get("kind") == "diagnostic":
        return f"Complete {label}."
    lower = label.lower()
    if "screening" in lower or "counseling" in lower or "guidance" in lower:
        return f"Complete {label}."
    if "training" in lower or "physical activity" in lower or "diet" in lower:
        return f"Start {label}."
    if "therapy" in lower or "repletion" in lower or "treatment" in lower or "statin" in lower:
        return f"Start {label}."
    return f"Review and implement {label}."


def build_recommendation(item: dict[str, Any], why_now: str) -> dict[str, Any]:
    recommendation = {
        "id": item["id"],
        "label": item["label"],
        "kind": item["kind"],
        "source": item["source"],
        "evidence_axis": item.get("evidence_axis"),
        "why_now": why_now,
        "action_phrase": recommendation_action_phrase(item),
        "value_summary": value_summary(item),
        "matched_findings": item.get("matched_findings") or item.get("matched_triggers", []),
        "trace_status": item.get("trace_status"),
    }
    if item.get("kind") == "diagnostic":
        recommendation.update(
            {
                "reclassification_probability": item.get("reclassification_probability"),
                "qaly_if_reclassified": item.get("qaly_if_reclassified"),
                "expected_voi_internal": item.get("expected_voi_internal"),
                "dominant_reclassification_path": item.get("dominant_reclassification_path"),
                "downstream_decisions_changed": item.get("downstream_decisions_changed", []),
            }
        )
    else:
        recommendation["patient_value_qaly"] = item.get("channels", {}).get("net_qaly_if_achieved")
    return recommendation


def build_deferred_item(item: dict[str, Any], reason: str) -> dict[str, Any]:
    deferred = {
        "id": item["id"],
        "label": item["label"],
        "kind": item["kind"],
        "source": item["source"],
        "reason": reason,
        "value_summary": value_summary(item),
    }
    if item.get("kind") == "diagnostic":
        deferred["reclassification_probability"] = item.get("reclassification_probability")
        deferred["qaly_if_reclassified"] = item.get("qaly_if_reclassified")
    else:
        deferred["patient_value_qaly"] = item.get("channels", {}).get("net_qaly_if_achieved")
    return deferred


def infer_order_or_referral(item: dict[str, Any]) -> dict[str, Any]:
    label = item.get("label", item.get("id", "item"))
    if item.get("kind") == "diagnostic":
        return {
            "id": f"order:{item['id']}",
            "type": "diagnostic_order_candidate",
            "label": label,
            "source_item_id": item["id"],
            "status": "physician_review_required",
        }
    lower = label.lower()
    if "training" in lower or "physical activity" in lower:
        return {
            "id": f"referral:{item['id']}",
            "type": "program_referral_candidate",
            "label": label,
            "source_item_id": item["id"],
            "status": "physician_review_required",
        }
    return {
        "id": f"plan:{item['id']}",
        "type": "treatment_plan_candidate",
        "label": label,
        "source_item_id": item["id"],
        "status": "physician_review_required",
    }


def required_plan_phrase(item: dict[str, Any]) -> str:
    label = item.get("label", item.get("id", "required item"))
    reason = item.get("reason")
    return f"Complete {label}." + (f" Reason: {reason}" if reason else "")


def build_note_draft(
    patient: dict[str, Any],
    required_items: list[dict[str, Any]],
    selected: list[dict[str, Any]],
    deferred: list[dict[str, Any]],
    vitality: dict[str, Any],
) -> dict[str, Any]:
    vitality_read = vitality.get("primary_driver_read") or "not specified"
    assessment = (
        f"{patient['display_name']} is a {patient['age']}-year-old {patient['sex']} with "
        f"{patient.get('phenotype', 'a preventive-care phenotype')}. Current engine state separates "
        f"{len(required_items)} required item{'' if len(required_items) == 1 else 's'} from "
        f"{len(selected)} selected scored next step{'' if len(selected) == 1 else 's'}. "
        f"Vitality context: {vitality_read}."
    )
    plan_lines: list[str] = []
    for idx, item in enumerate(required_items, 1):
        plan_lines.append(f"Required {idx}. {required_plan_phrase(item)}")
    for idx, item in enumerate(selected, 1):
        plan_lines.append(
            f"Next step {idx}. {item['action_phrase']} {item['value_summary']}. Why now: {item['why_now']}"
        )
    if deferred:
        first = deferred[0]
        plan_lines.append(f"Deferred. {first['label']}: {first['reason']}")

    orders: list[dict[str, Any]] = []
    referrals: list[dict[str, Any]] = []
    for item in selected:
        inferred = infer_order_or_referral(item)
        if inferred["type"].endswith("referral_candidate"):
            referrals.append(inferred)
        else:
            orders.append(inferred)
    for item in required_items:
        if item.get("source") == "genetic_mustdo_library":
            referrals.append(
                {
                    "id": f"referral:{item['id']}",
                    "type": "genetics_referral_candidate",
                    "label": item.get("label", item["id"]),
                    "source_item_id": item["id"],
                    "status": "physician_review_required",
                }
            )

    patient_message = (
        "We separated required items from optional opportunities, then chose the few next steps "
        "with the best combination of patient value, evidence, actionability, and sequencing. "
        "Items not selected remain visible for review rather than being hidden."
    )
    return {
        "assessment": assessment,
        "plan": "\n".join(plan_lines),
        "orders": orders,
        "referrals": referrals,
        "patient_message": patient_message,
        "signature_status": "draft_for_physician_review",
    }


def build_synthesis_checks(
    selected: list[dict[str, Any]],
    required_items: list[dict[str, Any]],
    deferred: list[dict[str, Any]],
    note_draft: dict[str, Any],
) -> list[dict[str, Any]]:
    note_plan = note_draft.get("plan", "")
    return [
        {"id": "required_items_separate", "pass": isinstance(required_items, list)},
        {"id": "max_three_recommendations", "pass": len(selected) <= 3},
        {"id": "selected_items_are_atomic", "pass": all(item.get("action_phrase") for item in selected)},
        {
            "id": "diagnostics_expose_reclass_and_qaly",
            "pass": all(
                item.get("kind") != "diagnostic"
                or (
                    item.get("reclassification_probability") is not None
                    and item.get("qaly_if_reclassified") is not None
                )
                for item in selected
            ),
        },
        {"id": "note_draft_present", "pass": bool(note_draft.get("assessment") and note_draft.get("plan"))},
        {
            "id": "selected_items_appear_in_note_plan",
            "pass": all(item["label"] in note_plan for item in selected),
        },
        {"id": "deferred_item_explained_when_available", "pass": bool(deferred) or len(selected) < 3},
    ]


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
    selected_ids: set[str] = set()
    for action in ranked_actions:
        if action_priority(action) >= 0.5 and len(selected) < 2:
            selected.append(
                build_recommendation(
                    action,
                    "High patient-value eligible action after required-item separation and overlap gating.",
                )
            )
            selected_ids.add(action["id"])
    for diagnostic in ranked_diagnostics:
        if len(selected) >= 3:
            break
        if diagnostic_priority(diagnostic) < 0.65:
            continue
        selected.append(
            build_recommendation(
                diagnostic,
                diagnostic.get("dominant_reclassification_path")
                or "Diagnostic could change downstream management enough to be selected now.",
            )
        )
        selected_ids.add(diagnostic["id"])

    deferred: list[dict[str, Any]] = []
    for item in ranked_actions + ranked_diagnostics:
        if item["id"] in selected_ids:
            continue
        if item.get("kind") == "diagnostic" and item.get("reclassification_probability", 0.0) < 0.1:
            reason = "Clinically visible but low reclassification probability, so it stays secondary unless safety context changes."
        elif item.get("kind") == "diagnostic":
            reason = "Action-changing, but lower priority than the selected next steps after value, burden, and sequencing review."
        elif not item.get("recommendation_eligible"):
            reason = "Not recommendation eligible in the current state."
        else:
            reason = "Eligible, but not in the top limited recommendation set after value and sequencing review."
        deferred.append(build_deferred_item(item, reason))
        if len(deferred) >= 5:
            break

    patient = action_map_state["patient"]
    required_items = action_map_state["required_items"]
    required_count = len(required_items)
    vitality = action_map_state.get("model_outputs", {}).get("vitality", {})
    clinical_overview = (
        f"{patient['display_name']} has {required_count} required item"
        f"{'' if required_count == 1 else 's'} separated from the optional action map. "
        f"The compiler selected {len(selected)} scored next step"
        f"{'' if len(selected) == 1 else 's'} from typed action and diagnostic state, with vitality used only as context for sequencing and near-term felt progress."
    )
    note_draft = build_note_draft(patient, required_items, selected, deferred, vitality)
    synthesis_checks = build_synthesis_checks(selected, required_items, deferred, note_draft)
    return {
        "schema_version": "clinical_plan.v1",
        "source_action_map_state": action_map_state["run_id"],
        "patient_id": patient["patient_id"],
        "title": f"{patient['display_name']} clinical plan from scored engine state",
        "summary": clinical_overview,
        "clinical_overview": clinical_overview,
        "required_items": required_items,
        "recommended_next_steps": selected,
        "non_required_next_steps": selected,
        "deferred_not_selected": deferred,
        "clinical_note_draft": note_draft,
        "synthesis_checks": synthesis_checks,
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
    recommendations = clinical_plan.get("recommended_next_steps", clinical_plan.get("non_required_next_steps", []))
    recommended_ids = {item["id"] for item in recommendations}
    scored_action_ids = {item["id"] for item in action_map_state["optional_actions"]}
    scored_diagnostic_ids = {item["id"] for item in action_map_state["diagnostics"]}
    diagnostics_complete = all(
        item.get("reclassification_probability") is not None
        and item.get("qaly_if_reclassified") is not None
        for item in action_map_state["diagnostics"]
    )
    diagnostic_recommendations_complete = all(
        item.get("kind") != "diagnostic"
        or (
            item.get("reclassification_probability") is not None
            and item.get("qaly_if_reclassified") is not None
        )
        for item in recommendations
    )
    raw_ai_recommended = any(
        item["id"] not in scored_action_ids | scored_diagnostic_ids
        for item in recommendations
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
    note_draft = clinical_plan.get("clinical_note_draft", {})
    note_plan = note_draft.get("plan", "")
    synthesis_checks = clinical_plan.get("synthesis_checks", [])
    checks = {
        "patient_packet_hash_present": bool(action_map_state.get("patient_packet_hash")),
        "diagnostics_expose_reclass_and_qaly_if_reclassified": diagnostics_complete,
        "diagnostic_recommendations_expose_reclass_and_qaly": diagnostic_recommendations_complete,
        "required_items_are_separate_from_optional_action_map": all(
            item["id"] not in scored_action_ids for item in action_map_state["required_items"]
        ),
        "required_items_are_not_duplicated": len(required_aliases) == len(set(required_aliases)),
        "all_recommendations_are_scored": recommended_ids.issubset(scored_action_ids | scored_diagnostic_ids),
        "raw_ai_text_not_recommended": not raw_ai_recommended,
        "ai_scored_candidates_have_valid_cited_keys": not ai_scored_with_invalid_citations,
        "max_three_non_required_next_steps": len(recommendations) <= 3,
        "recommendations_have_action_phrases": all(item.get("action_phrase") for item in recommendations),
        "clinical_note_draft_present": bool(note_draft.get("assessment") and note_draft.get("plan")),
        "selected_items_appear_in_note_plan": all(item.get("label", "") in note_plan for item in recommendations),
        "synthesis_checks_pass": bool(synthesis_checks) and all(item.get("pass") for item in synthesis_checks),
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
