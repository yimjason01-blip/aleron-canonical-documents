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


def _relative_risk_reduction_band(di: dict) -> tuple[float, float, float]:
    """Return a low/central/high relative risk reduction band.

    Fully-derived library records usually store `relative_risk_reduction`
    directly. Draft derivations sometimes carry a source RR/HR instead; accept
    that only when `effect_type` is RR or HR and convert it deterministically to
    RRR = 1 - RR/HR. This keeps the generic event adapter from treating a source
    hazard ratio as a risk-reduction scalar by accident.
    """
    if "relative_risk_reduction" in di:
        return _band(di["relative_risk_reduction"], "relative_risk_reduction")
    effect_type = str(di.get("effect_type", "RRR")).upper()
    if effect_type in {"RR", "HR"} and "effect_value" in di:
        effect = _band(di["effect_value"], "effect_value")
        return tuple(1.0 - value for value in effect)
    raise ValueError(
        "event_or_curve_shift_action requires relative_risk_reduction, or effect_value when effect_type is RR/HR"
    )


def _require_event_or_curve_shift_inputs(di: dict) -> None:
    """Runtime input contract for the shared event-action adapter.

    The validator enforces this statically for library rows. Keeping the same
    contract here prevents ad hoc runner calls or future draft records from being
    scored with an unbound baseline risk, missing horizon, or ambiguous effect
    encoding.
    """
    effect_type = str(di.get("effect_type", "RRR")).upper()
    if effect_type not in {"ARR", "RR", "HR", "RRR"}:
        raise ValueError(
            "event_or_curve_shift_action effect_type must be ARR, RR, HR, or RRR"
        )
    horizon = di.get("sustained_horizon_years")
    if not isinstance(horizon, (int, float)) or horizon <= 0:
        raise ValueError("event_or_curve_shift_action requires positive sustained_horizon_years")
    if "event_value_qaly" not in di and "legacy_qaly_per_event" not in di:
        raise ValueError("event_or_curve_shift_action requires event_value_qaly or legacy_qaly_per_event")
    if effect_type == "ARR":
        if "absolute_risk_reduction" not in di:
            raise ValueError("event_or_curve_shift_action ARR requires absolute_risk_reduction")
        return
    if "baseline_event_risk" not in di and "risk_domain" not in di:
        raise ValueError("event_or_curve_shift_action requires baseline_event_risk or risk_domain")
    if "relative_risk_reduction" not in di and not (effect_type in {"RR", "HR"} and "effect_value" in di):
        raise ValueError(
            "event_or_curve_shift_action requires relative_risk_reduction, or effect_value when effect_type is RR/HR"
        )


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


# =============================================== C1 — generic event action

def score_event_or_curve_shift_action(ctx: dict, di: dict) -> dict:
    """Generic C1 event-prevention scorer for legacy actions with HR/RR/RRR/ARR.

    This is the high-throughput bridge for the 145-action conversion. It does
    not invent baseline risk or event value. A library item must supply either:
      - baseline_event_risk, or
      - risk_domain that resolves in the patient packet context.

    C1 = baseline risk over the declared horizon · relative risk reduction ·
    event value. ARR is supported by passing effect_type='ARR' and using the
    supplied absolute risk reduction directly.
    """
    _require_event_or_curve_shift_inputs(di)
    effect_type = str(di.get("effect_type", "RRR")).upper()
    if effect_type == "ARR":
        prevented_events = _band(di["absolute_risk_reduction"])
    else:
        if "baseline_event_risk" in di:
            baseline_risk = _band(di["baseline_event_risk"])
        elif di.get("risk_domain") in ctx.get("risk", {}):
            baseline_risk = _band(ctx["risk"][di["risk_domain"]])
        else:
            raise ValueError("event_or_curve_shift_action requires baseline_event_risk or resolvable risk_domain")
        rrr = _relative_risk_reduction_band(di)
        prevented_events = tuple(baseline_risk[i] * rrr[i] for i in range(3))

    if "event_value_qaly" in di:
        event_value = _band(di["event_value_qaly"])
    elif "legacy_qaly_per_event" in di:
        event_value = _band(di["legacy_qaly_per_event"])
    else:
        raise ValueError("event_or_curve_shift_action requires event_value_qaly or legacy_qaly_per_event")

    c1 = tuple(prevented_events[i] * event_value[i] for i in range(3))
    return {
        "c1_prevention": _as_band_dict(c1),
        "prevented_events": _as_band_dict(prevented_events),
        "event_value_qaly": _as_band_dict(event_value),
        "c2_capacity": _as_band_dict((0.0, 0.0, 0.0)),
        "c3_resilience": _as_band_dict((0.0, 0.0, 0.0)),
    }


# ============================================ C1/C2/C3 — procedure/device action
def _zero_band():
    return (0.0, 0.0, 0.0)


def _band_add(*bands):
    return tuple(float(sum(band[i] for band in bands)) for i in range(3))


def _band_mul(a, b):
    return tuple(float(a[i] * b[i]) for i in range(3))


def _burden_years(S, start: float, duration: float) -> float:
    """Survival-weighted years over a possibly fractional interval."""
    if duration <= 0:
        return 0.0
    full_years = int(duration)
    total = sum(S(start + year + 0.5) for year in range(full_years))
    remainder = duration - full_years
    if remainder > 0:
        total += remainder * S(start + full_years + remainder / 2)
    return total


def _integrate_burden_schedule(ctx: dict, schedule: list[dict]) -> tuple[float, float, float]:
    sex, age = ctx["sex"], ctx["age"]
    S = make_S(age, sex)
    totals = [0.0, 0.0, 0.0]
    for item in schedule or []:
        values = _band(item["value_qaly_loss"], "burden_schedule.value_qaly_loss")
        durations = _band(item.get("duration_years", 0.0), "burden_schedule.duration_years")
        start = float(item.get("start_year", 0.0) or 0.0)
        cadence = item.get("cadence")
        survival_weighted = bool(item.get("survival_weighted", True))
        for i in range(3):
            if cadence == "one_time":
                weight = S(start) if survival_weighted else 1.0
                totals[i] += values[i] * weight
            elif cadence in {"per_year", "course"}:
                years = _burden_years(S, start, durations[i]) if survival_weighted else durations[i]
                totals[i] += values[i] * years
            elif cadence in {"surveillance_interval", "replacement_interval", "per_cycle"}:
                interval = float(item.get("interval_years") or 0.0)
                if interval <= 0:
                    raise ValueError(f"{cadence} burden requires positive interval_years")
                horizon = durations[i]
                t = start
                while t <= start + horizon + 1e-9:
                    weight = S(t) if survival_weighted else 1.0
                    totals[i] += values[i] * weight
                    t += interval
            else:
                raise ValueError(f"unsupported burden cadence {cadence!r}")
    return tuple(totals)


def _score_harm_objects(di: dict) -> tuple[float, float, float]:
    """Expected QALY loss from explicit harm objects."""
    harms = _zero_band()
    for harm in di.get("harm_objects", []):
        if harm.get("included_in_endpoint_value"):
            continue
        probability = _band(harm["probability"], f"harm_objects.{harm.get('id', '<missing>')}.probability")
        value_loss = _band(harm["value_qaly_loss"], f"harm_objects.{harm.get('id', '<missing>')}.value_qaly_loss")
        harms = _band_add(harms, _band_mul(probability, value_loss))
    return harms


def score_harm_aware_event_action(ctx: dict, di: dict) -> dict:
    """Event-prevention scorer with explicit harms and burden schedule."""
    benefit = score_event_or_curve_shift_action(ctx, di)
    c1 = _band(benefit["c1_prevention"], "c1_prevention")
    c2 = _band(di.get("direct_c2_capacity", 0.0), "direct_c2_capacity")
    c3 = _band(di.get("direct_c3_resilience", 0.0), "direct_c3_resilience")
    harms = _score_harm_objects(di)
    burden = _integrate_burden_schedule(ctx, di.get("burden_schedule", []))
    net = tuple(c1[i] + c2[i] + c3[i] - harms[i] - burden[i] for i in range(3))
    return {
        "c1_prevention": _as_band_dict(c1),
        "c2_capacity": _as_band_dict(c2),
        "c3_resilience": _as_band_dict(c3),
        "prevented_events": benefit.get("prevented_events"),
        "event_value_qaly": benefit.get("event_value_qaly"),
        "harm_qaly_loss": _as_band_dict(harms),
        "action_burden_qaly": _as_band_dict(burden),
        "net_qaly_if_achieved": _as_band_dict(net),
    }


def score_procedure_device_action(ctx: dict, di: dict) -> dict:
    """Episode-based procedure/device scorer.

    The runner intentionally consumes only audited, library-supplied parameters:
    threshold eligibility is validated upstream; the math here turns bound
    baseline endpoint risks, procedure effects, explicit harm objects, optional
    direct C2/C3 utility components, and a burden schedule into deterministic
    banded QALY channels.
    """
    effect_model = di["effect_model"]
    effect_type = effect_model["type"]
    baseline = di.get("baseline_risk", {}).get("endpoint_risks", {})
    endpoint_values = di.get("endpoint_values", {})

    c1 = _zero_band()
    endpoint_absolute_risk_delta: dict[str, dict] = {}
    if effect_type in {"relative_event_reduction", "absolute_event_reduction"}:
        for endpoint_id in effect_model.get("effect_applies_to", []):
            if endpoint_id not in endpoint_values:
                raise ValueError(f"procedure endpoint {endpoint_id!r} missing endpoint_values")
            if effect_type == "relative_event_reduction":
                risk = _band(baseline[endpoint_id], f"baseline_risk.endpoint_risks.{endpoint_id}")
                rrr = _band(effect_model["relative_risk_reduction"], "effect_model.relative_risk_reduction")
                risk_delta = _band_mul(risk, rrr)
            else:
                arr = effect_model.get("absolute_risk_reduction", {})
                risk_delta = _band(arr[endpoint_id] if isinstance(arr, dict) and endpoint_id in arr else arr,
                                   "effect_model.absolute_risk_reduction")
            value = _band(endpoint_values[endpoint_id]["event_value_qaly"],
                          f"endpoint_values.{endpoint_id}.event_value_qaly")
            c1 = _band_add(c1, _band_mul(risk_delta, value))
            endpoint_absolute_risk_delta[endpoint_id] = _as_band_dict(risk_delta)
    elif effect_type not in {"utility_time_in_state", "counterfactual_curve_comparison", "survival_curve_shift"}:
        raise ValueError(f"unsupported procedure effect_model.type {effect_type!r}")

    c2 = _zero_band()
    c3 = _zero_band()
    for component in effect_model.get("utility_time_in_state_components", []):
        channel = component.get("channel")
        delta_u = _band(component["delta_u"], "utility_time_in_state_components.delta_u")
        duration = _band(component["duration_years"], "utility_time_in_state_components.duration_years")
        value = _band_mul(delta_u, duration)
        if channel == "c2_capacity":
            c2 = _band_add(c2, value)
        elif channel == "c3_resilience":
            c3 = _band_add(c3, value)
        elif channel == "c1_prevention":
            c1 = _band_add(c1, value)
        else:
            raise ValueError(f"unsupported utility_time_in_state channel {channel!r}")

    harms = _zero_band()
    for harm in di.get("harm_objects", []):
        if harm.get("included_in_endpoint_value"):
            continue
        probability = _band(harm["probability"], f"harm_objects.{harm.get('id', '<missing>')}.probability")
        value_loss = _band(harm["value_qaly_loss"], f"harm_objects.{harm.get('id', '<missing>')}.value_qaly_loss")
        harms = _band_add(harms, _band_mul(probability, value_loss))

    burden = _integrate_burden_schedule(ctx, di.get("burden_schedule", []))
    net = tuple(c1[i] + c2[i] + c3[i] - harms[i] - burden[i] for i in range(3))
    return {
        "c1_prevention": _as_band_dict(c1),
        "c2_capacity": _as_band_dict(c2),
        "c3_resilience": _as_band_dict(c3),
        "endpoint_absolute_risk_delta": endpoint_absolute_risk_delta,
        "harm_qaly_loss": _as_band_dict(harms),
        "procedure_burden_qaly": _as_band_dict(burden),
        "net_qaly_if_achieved": _as_band_dict(net),
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
    "event_or_curve_shift_action": score_event_or_curve_shift_action,
    "harm_aware_event_action": score_harm_aware_event_action,
    "procedure_device_action": score_procedure_device_action,
    "fitness_bundle": score_fitness_bundle,
    "diagnostic_direct_voi": score_diagnostic_direct_voi,
    "diagnostic_voi": score_diagnostic_voi,
}


def score(ctx: dict, di: dict) -> dict:
    method = di.get("method")
    if method not in SCORERS:
        raise ValueError(f"unknown derivation method {method!r}")
    return SCORERS[method](ctx, di)
