#!/usr/bin/env python3
"""
Discovery-layer prototype -- Stage 1: PATIENT RECORD PACKET (deterministic).

Assembles the single packet the discovery layer is allowed to see for AL-47M.
Two halves, per the proposed design:
  (a) the patient's full observable record -- every value mirrors the PT object
      in system-design/diagrams/aleron-actionmap-al47m.html (47y male), grouped
      and unit-stamped, PLUS an explicit list of high-value tests NOT yet run
      (so the "highest-information missing test" lens has material to reason on);
  (b) the engine's own output for him -- the findings already firing and the
      levers already on his action map -- so the layer knows his covered space
      for THIS patient and will not re-surface it.

Every citable datum is flattened into valid_keys so the downstream grounding
gate can verify that a candidate's cited evidence actually exists (a candidate
citing a key not in this set is dropped as ungrounded).

Writes only into this prototype silo.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# ---- AL-47M, mirroring the PT object on the action map --------------------
observables = {
    "demographics": {"age": 47, "sex": "male", "genetic_ancestry": "untested"},
    "anthropometry": {
        "height_cm": 178, "weight_kg": 93, "bmi": 29.4, "body_fat_pct": 30,
        "waist_cm": 105, "waist_to_height": 0.59,
    },
    "vitals": {"sbp": 142, "dbp": 90, "resting_hr": 76, "pulse_pressure": 52},
    "wearable_overnight": {"overnight_spo2_nadir_pct": 85, "overnight_spo2_mean_pct": 94,
                           "overnight_hr_min_bpm": 38, "overnight_hr_mean_bpm": 49,
                           "daytime_resting_hr_bpm": 76},
    "lipids": {"total_chol": 205, "hdl": 40, "ldl": 132, "triglycerides": 180,
               "apob": 112, "lp_a": 25, "lp_a_unit": "mg/dL", "non_hdl": 165},
    "glycemic": {"hba1c": 6.0, "fasting_glucose": 110, "fasting_insulin": 16, "homa_ir": 4.3},
    "renal": {"egfr": 93, "uacr": 14},
    "inflammation": {"hs_crp": 3.0},
    "fitness": {"vo2max": 28, "vo2max_note": "low, ~10-15th percentile for age/sex"},
    "behavior": {"smoking": "never", "physical_activity": "low"},
    "family_history": {"summary": "type 2 diabetes + hypertension", "premature_cad": "unknown",
                       "cancer": "unknown", "dementia": "unknown"},
    "genetics": {"status": "hereditary panel performed", "atm": "heterozygous pathogenic ATM variant"},
}

# High-value tests NOT yet run for this patient -- the data-gap surface the
# value-of-information lens reasons over. Listing them is honest scaffolding, not
# a recommendation; the layer decides which (if any) clear the bar.
not_measured = [
    "ALT", "AST", "GGT", "platelets", "FIB-4 (computable only if AST/ALT/platelets present)",
    "liver ultrasound / FibroScan (hepatic steatosis + fibrosis)",
    "coronary artery calcium (CAC) score",
    "2-hour OGTT (post-load glucose)",
    "TSH", "free T4",
    "uric acid",
    "ferritin", "transferrin saturation",
    "STOP-BANG questionnaire", "home sleep apnea test / overnight oximetry",
    "SLCO1B1 / pharmacogenomic panel",
    "ApoB already measured (112); Lp(a) already measured (25 mg/dL)",
]

# ---- the engine's own output for AL-47M (his covered space) ----------------
# Finding ids that fire for his phenotype + the levers already plotted on his map.
engine_already_flagged = {
    "active_findings": [
        "bp_driven_risk", "hs_crp_residual_inflam", "high_triglycerides_resid",
        "prediabetes", "insulin_resistance", "adiposity_obesity",
        "lifestyle_cancer_incidence_risk", "physical_inactivity", "suboptimal_diet",
        "cvd_risk_ascvd (borderline/intermediate at his inputs)",
    ],
    "not_firing_but_in_library": [
        "lpa_elevated (his Lp(a) 25 mg/dL is below threshold)",
        "undiagnosed_t2dm (HbA1c 6.0 < 6.5)", "ckd_albuminuric (UACR 14 < 30)",
    ],
    "levers_on_his_action_map": [
        "acarbose_cv_igt", "dpp_lifestyle", "dietary_pattern_med", "fiber_wholegrain_intake",
        "physical_activity_rx", "ir_lifestyle_prevention", "pioglitazone_stroke_mi_ir",
        "metformin_prevention", "statin_primary", "antihypertensive_rx",
        "VO2max / cardiorespiratory fitness (headline lever)",
        "+ ezetimibe/bempedoic/pcsk9/aspirin/canakinumab (net-negative at his risk)",
    ],
}


def flatten(prefix, obj, out):
    for k, v in obj.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            flatten(key, v, out)
        else:
            out.append(key)


valid_keys = []
flatten("", observables, valid_keys)

packet = {
    "patient_id": "AL-47M",
    "one_line": "47-year-old male, central obesity + insulin resistance + stage-2 HTN + atherogenic dyslipidemia + low fitness; never-smoker; FH of T2D and HTN; genetics untested.",
    "observables": observables,
    "tests_not_yet_run": not_measured,
    "engine_already_flagged": engine_already_flagged,
    "valid_keys": sorted(valid_keys),
    "run_date": "2026-06-29",
}

json.dump(packet, open(os.path.join(HERE, "patient_packet.json"), "w"), indent=2)
print("wrote patient_packet.json -- %d citable observable keys" % len(valid_keys))
print("active findings already on his map:", len(engine_already_flagged["active_findings"]))
print("high-value tests not yet run:", len(not_measured))
