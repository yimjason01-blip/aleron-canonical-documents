#!/usr/bin/env python3
"""Aleron value engine — the universal QALY math the action engine calls.

This is the generalization of `design-loop/value-trace/compute_trace.py` (the
worked-trace seed) into reusable, patient-parameterized scorers. It holds ONLY
universal machinery (life tables, survival, the three channel formulas). Every
per-action constant lives in the library as `derivation_inputs` (data, basis-
tagged, reviewable) — NOT here — so a reviewer sees each number's recipe next to
the number, and one method computes every surface.

Codified method it implements (see system-design/QALY_METHOD_DECISIONS.md):
  D2  C1 = survival-curve-shift (length/mortality) + event-based (non-fatal height)
  D1  C2 = capacity_conditioning(Δu_anchor · swy  +  dependency_compression · Δu_gap)
  D3  causality haircut on observational effects (band 0.40–0.70, central 0.55)
  D4  burden at declared cadence (per_year integrated · S, or one_time lump)
  D5  integrate to full life expectancy; S(t) sex-specific (risk-adjust = upgrade)
  D6  0% discount, survival-weighting only; patient-realistic utilities
  D7  diagnostics carry a value_channel label (handled in the library/runner)
  VOI P_reclass = prior · LR(packet) · P(mgmt change); QALY_if decomposed by channel

Basis tags on every constant: [RCT] [EPI] [TABLE] [MODEL] [JUDGMENT]. Values are
returned banded as (low, central, high). No third-party dependencies.
"""

from __future__ import annotations

# --------------------------------------------------------------- life tables
# SSA 2021 period life tables, l(x) per 100k at 5-year anchors. [TABLE]
# Period (not cohort) and not risk-adjusted — both are the D5 upgrade path; the
# current tables understate future survival and ignore the patient's own modeled
# mortality. Male values transcribed ~0.5% precision (match compute_trace.py);
# female values are APPROXIMATE pending a sourced table (flagged in run output).
LIFE_TABLES = {
    "male": {45: 94500, 50: 93000, 55: 90800, 60: 87500, 65: 82800, 70: 76200,
             75: 67000, 80: 54800, 85: 39700, 90: 23900, 95: 10700, 100: 3100, 105: 400},
    "female": {45: 96400, 50: 95300, 55: 93600, 60: 91000, 65: 87300, 70: 81900,
               75: 74100, 80: 63400, 85: 48900, 90: 31400, 95: 15000, 100: 4800, 105: 700},
}

U_BASELINE = (0.70, 0.78, 0.85)   # [JUDGMENT] framework §2.4 / D6; instrument anchor pending
U_DEPENDENT = 0.40                # [JUDGMENT] framework §2.4 (0.35–0.45); dependent/frail years
BAND = ("low", "central", "high")


def _table(sex: str) -> dict[int, float]:
    return LIFE_TABLES.get(sex, LIFE_TABLES["male"])


def lx(age: float, sex: str) -> float:
    """Survivors at `age` (geometric interpolation between 5-year anchors)."""
    tbl = _table(sex)
    if age >= 105:
        return tbl[105]
    lo = 5 * int(age // 5)
    if lo < 45:
        lo = 45
    hi = lo + 5
    f = (age - lo) / 5
    return tbl[lo] * (tbl[hi] / tbl[lo]) ** f


def make_S(age0: float, sex: str):
    """P(alive at age0+t | alive at age0) — the only legitimate deflator (§2.2)."""
    base = lx(age0, sex)
    return lambda t: lx(age0 + t, sex) / base


def swy(S, t0: float, t1: float) -> float:
    """Survival-weighted years between t0 and t1 (annual midpoint sum)."""
    return sum(S(t + 0.5) for t in range(int(t0), int(t1)))


def life_expectancy(age: float, sex: str, hr: float = 1.0) -> float:
    """Remaining life expectancy at `age`, with an optional proportional all-cause
    mortality hazard ratio applied from `age` forward. hr<1 shifts the survival
    curve up (the D2 length/mortality term)."""
    e, alive, a = 0.0, 1.0, age
    tbl = _table(sex)
    while a < 105 and alive > 1e-6:
        q = 1 - (lx(a + 1, sex) / lx(a, sex))
        q = min(1.0, q * hr)
        e += alive * (1 - q / 2)
        alive *= (1 - q)
        a += 1
    return e


def _band(spec, key=None):
    """Pull a (low, central, high) tuple from a scalar, a 3-tuple/list, or a
    {low,central,high} dict."""
    if isinstance(spec, (int, float)):
        return (float(spec), float(spec), float(spec))
    if isinstance(spec, (tuple, list)) and len(spec) == 3:
        return tuple(float(x) for x in spec)
    if isinstance(spec, dict):
        return tuple(float(spec[k]) for k in BAND)
    raise ValueError(f"expected scalar or low/central/high, got {spec!r} for {key}")


def _as_band_dict(triple):
    return {"low": round(triple[0], 4), "central": round(triple[1], 4), "high": round(triple[2], 4)}


# ============================================================ C1 — curve-shift
def score_c1_curve_shift(ctx: dict, di: dict) -> dict:
    """C1 prevention for a risk-scaling lever (e.g. statin). D2:
        length  = survival-curve shift of CVD-attributable mortality  (primary)
        height  = non-fatal events averted · utility decrement · duration (event-based)
    Patient-scaled: the CVD share of mortality is scaled by the patient's own
    30-yr CVD risk relative to the reference risk the effect was anchored at.
    """
    sex = ctx["sex"]
    age = ctx["age"]
    u = _band(U_BASELINE)
    patient_risk = ctx["risk"].get(di["risk_domain"])          # [MODEL] packet 30-yr risk
    if patient_risk is None:
        patient_risk = di.get("reference_risk_30yr")
    ref_risk = di["reference_risk_30yr"]                        # [MODEL]
    share_base = di["cvd_mortality_share_base"]                 # [TABLE] CVD share of mortality
    mort_rrr = _band(di["mortality_rrr"])                       # [RCT] CTT CVD-mortality RRR at dLDL
    fatal_dummy = None  # fatal value is captured by the curve shift, not counted discretely

    # scale the CVD mortality share by this patient's relative CVD risk (clamped)
    share = min(0.9, share_base * (patient_risk / ref_risk)) if ref_risk else share_base

    # ---- length term: shift the all-cause hazard by the CVD-attributable reduction
    length = []
    for i in range(3):
        hr_allcause = 1 - share * mort_rrr[i]
        ly = life_expectancy(age, sex, hr=hr_allcause) - life_expectancy(age, sex)
        length.append(ly * u[i])

    # ---- height term: non-fatal events averted · decrement · remaining years
    rrr_events = _band(di["relative_risk_reduction_events"])   # [RCT]
    fatal_frac = _band(di["fatal_fraction"])                   # [EPI]
    decrement = _band(di["nonfatal_decrement"])                # [EPI]
    rle_event = life_expectancy(di["event_age"], sex)
    height = []
    for i in range(3):
        nonfatal_averted = patient_risk * rrr_events[i] * (1 - fatal_frac[i])
        per_nonfatal = decrement[i] * rle_event + di.get("acute_dip", 0.05)
        height.append(nonfatal_averted * per_nonfatal)

    c1 = tuple(length[i] + height[i] for i in range(3))
    return {
        "c1_prevention": _as_band_dict(c1),
        "c1_length_curve_shift": _as_band_dict(tuple(length)),
        "c1_height_event_based": _as_band_dict(tuple(height)),
        "cvd_mortality_share_used": round(share, 4),
        "c2_capacity": _as_band_dict((0.0, 0.0, 0.0)),
        "c3_resilience": _as_band_dict((0.0, 0.0, 0.0)),
    }


# ============================================================ C2 — capacity
def score_fitness_bundle(ctx: dict, di: dict) -> dict:
    """Fitness/activity lever scored on all three channels. D1/D2/D3.
        C1  observational CRF-mortality gradient · causality haircut → life-years
        C2  Δu_anchor · swy(all baseline years)  +  dependency_compression · (u−u_dep)
        C3  resilience band
    """
    sex, age = ctx["sex"], ctx["age"]
    u = _band(U_BASELINE)
    S = make_S(age, sex)

    vo2_gain = di["vo2max_gain"]                               # target lever size
    mets_gain = vo2_gain / 3.5
    hr_per_met = di["hr_per_met"]                              # [EPI] ~12%/MET all-cause mort
    hr_obs = hr_per_met ** mets_gain
    haircut = _band(di["causal_fraction"])                    # [JUDGMENT/MR] D3 (0.40–0.55–0.70)

    # C1: life-years from the (haircut) causal share of the mortality gradient
    c1 = []
    for i in range(3):
        hr_causal = hr_obs ** haircut[i]
        ly = life_expectancy(age, sex, hr=hr_causal) - life_expectancy(age, sex)
        c1.append(ly * u[i])

    # C2b reserve: per-year Δu across all baseline-survival years (D1 anchor)
    du = _band(di["delta_u_per_year"])                        # [RCT within-person] EQ-5D/SF-6D
    years_all = swy(S, 0, 105 - age)
    c2b = tuple(du[i] * years_all for i in range(3))
    # C2a independence: dependency-years compressed · utility gap
    comp = _band(di["dependency_years_compressed"])          # [JUDGMENT] cohorts exist, util map pending
    c2a = tuple(comp[i] * (u[i] - U_DEPENDENT) for i in range(3))
    c2 = tuple(c2b[i] + c2a[i] for i in range(3))

    c3 = _band(di["c3_resilience"])                          # [EPI-weak]
    return {
        "c1_prevention": _as_band_dict(tuple(c1)),
        "c2_capacity": _as_band_dict(c2),
        "c2b_reserve": _as_band_dict(c2b),
        "c2a_independence": _as_band_dict(c2a),
        "c3_resilience": _as_band_dict(c3),
    }


# ============================================================ Diagnostic VOI
def score_diagnostic_direct_voi(ctx: dict, di: dict) -> dict:
    """Direct diagnostic VOI when the library already carries reviewed/banded
    P_reclass and QALY_if_reclassified inputs. This moves a diagnostic from
    asserted display fields into runner-computed state without inventing a
    subtype-specific equation. Subtype equations can replace this later."""
    p_reclass = _band(di["reclassification_probability"])
    qaly_if = _band(di["qaly_if_reclassified"])
    burden = _band(di.get("test_burden", 0.0))
    voi = tuple(p_reclass[i] * qaly_if[i] - burden[i] for i in range(3))
    return {
        "reclassification_probability": _as_band_dict(p_reclass),
        "qaly_if_reclassified": _as_band_dict(qaly_if),
        "expected_voi": _as_band_dict(voi),
    }


def score_diagnostic_voi(ctx: dict, di: dict) -> dict:
    """P_reclass = prior · LR(packet findings) · P(mgmt change); QALY_if decomposed
    by value channel (D7). Returns banded p_reclass, qaly_if, expected VOI."""
    sex, age = ctx["sex"], ctx["age"]
    S = make_S(age, sex)
    prior = di["prior"]                                       # [EPI]
    lr = _band(di["likelihood_ratio"])                        # [EPI/JUDGMENT] packet-driven lift
    p_mgmt = di["p_management_change"]                        # [JUDGMENT] D-record floor ~0.10

    def posterior(p, l):
        o = p / (1 - p) * l
        return o / (1 + o)

    p_reclass = tuple(posterior(prior, lr[i]) * p_mgmt for i in range(3))

    # QALY_if decomposed by channel — the value_channel label lives in the library (D7)
    du_sx = _band(di["delta_u_symptom"])                     # [RCT] treated-state QoL uplift
    horizon = di["treated_horizon_yr"]
    qol = tuple(du_sx[i] * swy(S, 0, horizon) for i in range(3))
    extra = _band(di.get("other_channel_qaly", 0.0))         # e.g. BP-sequencing path
    excluded = _band(di.get("excluded_channel_qaly", 0.0))   # e.g. CV prevention — honest zero
    qaly_if = tuple(qol[i] + extra[i] + excluded[i] for i in range(3))

    voi = tuple(p_reclass[i] * qaly_if[i] for i in range(3))
    return {
        "reclassification_probability": _as_band_dict(p_reclass),
        "qaly_if_reclassified": _as_band_dict(qaly_if),
        "qaly_if_components": {"symptom_quality": _as_band_dict(tuple(qol)),
                               "other_channel": _as_band_dict(extra),
                               "excluded_channel": _as_band_dict(excluded)},
        "expected_voi": _as_band_dict(voi),
    }


SCORERS = {
    "c1_curve_shift": score_c1_curve_shift,
    "fitness_bundle": score_fitness_bundle,
    "diagnostic_direct_voi": score_diagnostic_direct_voi,
    "diagnostic_voi": score_diagnostic_voi,
}


def score(ctx: dict, di: dict) -> dict:
    method = di.get("method")
    if method not in SCORERS:
        raise ValueError(f"unknown derivation method {method!r}")
    return SCORERS[method](ctx, di)
