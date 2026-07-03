# Value Runner - first derived run vs. hand-entered values

**What this is.** The first end-to-end run of the value engine (`value_engine.py`) through the action engine (`run_action_engine.py`), reading the codified method (D1-D10) from the library's `derivation_inputs` and each patient's packet. It replaces hand-entered map coordinates with *computed* ones for every action/diagnostic that carries derivation inputs. This is the step that turns asserted numbers into derived numbers - shown here as a diff **before anything touches the dashboard**.

**Reproduce.**
```
cd system-design/design-loop/action-engine
python3 run_action_engine.py --check      # writes action_engine_outputs.json, structural audit passes
python3 ../library/validate_action_library_v2.py   # library schema passes
```

**Coverage of this run.** The worked-trace action levers compute from method-specific derivation inputs. Diagnostics now all compute through either the HSAT-specific VOI equation or the generic direct-VOI adapter, using traced `P_reclass`, `QALY_if_reclassified`, and `test_burden` inputs. Remaining asserted coverage is in direct actions whose channel inputs are sourced or marked for source upgrade, but not yet connected to action-specific scorer equations.

| Patient | actions runner_computed | actions asserted | diagnostics runner_computed | diagnostics asserted |
|---|---|---|---|---|
| Ethan (47 M) | physical_activity | GLP-1/GIP, supervised resistance | CAC, sleep_apnea (HSAT), BP confirmation, rhythm safety, OGTT, MASLD fibrosis staging | 0 |
| Mara (56 F) | physical_activity, statin | supervised resistance | CAC, iron/thyroid fatigue labs, vitamin D bone, DEXA, sleep fragmentation | 0 |

---

## The diff (derived vs. currently displayed)

### Ethan - fitness (physical activity bundle)
| Channel | Displayed (asserted) | Derived (runner) | Note |
|---|---|---|---|
| C1 prevention | 1.30 | **1.64** | curve-shift on the fitness mortality gradient computes more life-years than the asserted number |
| C2 capacity | 2.60 | **1.47** | capacity_conditioning(Δu·swy + dependency comp); asserted 2.60 sat above the traced band |
| C3 resilience | 0.30 | **0.18** | within band |
| Burden | 0.008 (as total) | **0.27** | D4: per-year burden integrated over life - the biggest single mover of *net* |
| **Net** | **4.19** | **3.02** | channels reproduce the worked trace exactly; net falls because burden is now honestly integrated |

### Ethan - HSAT (diagnostic VOI)
| Quantity | Displayed | Derived | Note |
|---|---|---|---|
| P_reclass | 0.35 | **0.342** | now *derived*: prior 0.13 × LR 5 × P(mgmt) 0.80 |
| QALY_if | 0.45 | **0.644** | decomposed: felt-quality 0.62 + BP-path 0.02 + **CV-events 0 (SAVE null)** |
| Expected VOI | 0.158 | **0.220** | consistent with the trace |
| value_channel | - | **c2_felt_quality + bp_sequencing; excludes c1_cardiovascular_prevention** | D7 label now carried on the number |

### Ethan - statin
Currently displayed at **net 0.016**. The engine **gates it off** for Ethan: his packet carries none of the statin triggers (`cvd_risk_ascvd`, `lpa_elevated`, `FH`, `ckd_cvd_high_risk`) - his CVD picture is `cvd_risk_uncertainty` / `treatment_intensity_uncertain`, pending workup. *If* indicated, the curve-shift method computes **c1 ≈ 0.44** (length 0.38 + non-fatal height 0.06) - reproducing the worked trace (0.376 / 0.063). So the machine surfaces a real consistency gap: the hand-authored map shows Ethan a statin value the packet doesn't yet justify.

### Mara - statin (the C1 curve-shift exemplar, patient-scaled)
| Channel | Derived (runner) | Note |
|---|---|---|
| C1 length (curve-shift) | 0.47 | higher than Ethan's 0.38 - she is higher CVD risk (22% vs 16%), so her CVD mortality share scales up (0.41 vs 0.30) |
| C1 height (event) | 0.10 | non-fatal events averted |
| Burden | 0.14 | per-year integrated (female life table → fewer high-survival years than a younger patient) |
| **Net** | **0.43** | a statin genuinely buys more for a higher-risk patient - the D2 risk-sensitivity the old flat 0.8-scalar couldn't express |

### Mara - fitness
| Channel | Displayed (asserted) | Derived (runner) | Note |
|---|---|---|---|
| C1 | 0.50 | **1.47** | fitness mortality-curve-shift on the **female** life table; asserted 0.50 was low |
| C2 | 1.65 | **1.30** | shorter remaining horizon at 56 than Ethan's at 47 |
| C3 | 0.20 | **0.18** | within band |
| Burden | - | **0.22** | per-year integrated |
| **Net** | **2.35** | **2.72** | close total, very different channel split - the method disagrees with the hand-entered C1/C2 split |

---

## What moved, and why (all three are the codified rulings doing their job)

1. **C1 rose** on both fitness and statin - this is **D2 curve-shift**. Valuing the whole mortality curve (competing-risk-adjusted, full life expectancy) credits more than the old event-scalar. It is risk-sensitive: Mara's statin > Ethan's because her risk is higher.
2. **Net fell on fitness** - this is **D4 burden**. A per-year burden integrated over decades is larger than the old "total" reading, so net drops even as the benefit channels hold. (Caveat below.)
3. **Mara's numbers use the female life table** - this is **D5** sex-specific S(t), a fidelity gain over the trace, which used the male table throughout.

**Ordering is preserved.** Fitness (~2.7-3.0) still dominates statin (~0.43) and diagnostics. The magnitudes moved; the clinical ranking did not - exactly the safety property D2 predicted.

## Honest caveats - what is derived-from-provisional, not yet gospel

- **Diagnostic coverage is now broad but not equally strong.** Every currently triggered diagnostic computes through the runner. The direct-VOI adapter is deliberately transparent: it computes from traced `P_reclass`, `QALY_if_reclassified`, and `test_burden`, but several probabilities and QALY-if values are still marked `needs_source_upgrade` until subtype-specific equations replace the direct adapter.
- **Burden per-year magnitudes are legacy.** 0.008/yr (fitness) and 0.005/yr (statin) were authored under the old ambiguous convention and are now *read* per-year. Integrated over life they may be too high (a well-tolerated pill is nearer 0.001-0.003/yr). The per-year values need re-derivation; the *method* (integrate at cadence) is correct.
- **Female life table is approximate**, pending a sourced table; both tables are period, not cohort, and not yet risk-adjusted to the patient (the full D5 upgrade).
- **The C2 Δu anchor is still the trace's placeholder band** (0.02-0.05); D1 fixed the *method* (within-person RCT deltas), the specific per-lever numbers are the sourcing tranche.
- **Remaining asserted actions need scorer equations.** GLP-1/GIP, supervised resistance, and similar direct actions now carry clinical trace evidence, but still read channel values directly until action-specific derivation inputs are written.

## Verdict on the hand-waviness

For the levers that carry derivation inputs, the map coordinate is no longer typed in - it is computed from named, basis-tagged inputs, reproducibly, one method across every surface, with each number's recipe sitting next to it in the library. The **hand-waviness is removed from the method and from the diagnostic runner path**. It is not yet removed from direct actions whose clinical trace is now sourced but whose channel magnitudes still await action-specific equations. The machine runs; finishing the job is replacing direct-action asserted channels with scorer-backed derivations, not more architecture.
