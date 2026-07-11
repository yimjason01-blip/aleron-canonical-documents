# Derivation Blocker Taxonomy for the 145 Legacy Actions

## Scope and counts

Source files reviewed:

- `system-design/design-loop/library/action_library.json`
- `system-design/design-loop/library/action_library_v2.json`
- `system-design/design-loop/library/derivation_batches/*.json`
- `system-design/design-loop/library/DERIVATION_BACKLOG_145.md`

Current coverage state:

- Legacy actions: **145**
- Legacy actions with `fully_derived_v2` source coverage in `action_library_v2.json`: **61**
- Remaining non-fully-derived legacy actions: **84**
- Remaining by legacy action class: **46 drug**, **14 procedure**, **12 screen**, **12 lifestyle**
- Remaining by primary domain: **26 cancer**, **19 cvd**, **13 ckd**, **13 metabolic**, **13 neuro**

The blocker taxonomy below assigns each of the 84 remaining legacy actions to one primary runner/input gap. Cross-cutting gaps such as event-value objects, burden calibration, and overlap reducers recur across classes and are summarized after the primary taxonomy.

## Primary blocker taxonomy

| Primary blocker class | Count | Representative IDs | Minimum deterministic infrastructure/input needed |
|---|---:|---|---|
| Direct event-or-curve-shift medical action runner | 23 | `aspirin_primary`, `aspirin_secondary_prevention`, `act_sglt2i_progressor`, `act_hpv_vaccination_cervical`, `gdm_treatment_perinatal`, `statin_primary` | Generalized `event_or_curve_shift_action` promotion path with patient-specific baseline event risk, source-traced relative/absolute effect, endpoint-specific `event_value_qaly` objects, harm-event objects, per-cadence burden bands, and overlap reducers. This would unlock many conventional drug/vaccine records once inputs are bound. |
| Procedure/device/threshold runner | 14 | `act_kidney_transplant`, `aaa_repair_screen_detected`, `cabg_high_risk_anatomy`, `icd_primary_prevention`, `act_dbs_parkinson`, `pfo_closure_cryptogenic_stroke` | Deterministic procedure adapter that binds eligibility/thresholds, comparator/counterfactual management, baseline event or progression curves, procedure-specific harms, one-time and longitudinal burden, device/follow-up burden, and C2 utility when the main benefit is function rather than mortality. |
| Surrogate/VOI/enablement runner | 13 | `act_tolvaptan_adpkd`, `act_sparsentan_glomerular`, `act_budesonide_tr_igan`, `cgm_glycemic_mgmt`, `act_potassium_binder_enable_raasi`, `lpa_targeted_lowering` | Explicit policy adapter for surrogate or enablement records: accepted surrogate-to-hard-outcome transform or zero-credit rule, baseline-risk binding for the hard endpoint if credited, `P_enablement` or management-change probability for enablement/VOI records, downstream `qaly_if_enabled`, and overlap with direct treatment records. |
| Diagnostic VOI/reclassification runner | 12 | `act_colonoscopy_polypectomy`, `act_ldct_lung_resect`, `act_brca_mri_surveillance`, `fh_cascade_screening`, `retinopathy_screen_treat`, `activity_cascade_inherited` | Diagnostic VOI adapter requiring patient-specific `P_reclass`, test performance/yield, downstream decisions changed, path-specific `qaly_if_reclassified`, false-positive/false-negative/overdiagnosis burden, test cadence, and family/cascade boundary rules when applicable. |
| Lifestyle dose-response/multichannel runner | 12 | `physical_activity_rx`, `dietary_pattern_med`, `dietary_sodium_protein_ckd`, `ir_lifestyle_prevention`, `act_multidomain_finger`, `processed_red_meat_reduction` | Lifestyle bundle/dose adapter binding baseline exposure, achievable dose delta, adherence durability/decay, contraindications, endpoint-specific event values, C2 utility anchors where credited, behavior burden, and overlap partitioning across physical activity, diet, weight loss, BP, diabetes, cancer, and dementia records. Exercise prescriptions must use FITT-VP. VO2 max / CRF remains a separate destination phenotype or mediator, not the exercise prescription itself. |
| Precision/genetic therapeutic runner | 10 | `act_apol1_targeted`, `act_raasi_alport`, `act_raasi_monogenic`, `betablocker_lqts`, `mody_gck_deprescribe`, `teplizumab_t1d_delay` | Genotype/phenotype actionability adapter binding variant or genotype certainty, phenotype severity, subgroup baseline risk, probability of management change, variant-specific effect or response, VUS/family-cascade accounting, and overlap with broader disease-treatment records. |

Assigned IDs by class:

- Direct event-or-curve-shift medical action runner, 23: `act_aspirin_crc_sporadic`, `act_bp_control_dementia`, `act_hbv_antiviral_hcc`, `act_hbv_vaccination_hcc`, `act_hcv_daa_cure_hcc`, `act_hpv_vaccination_anal_oro`, `act_hpv_vaccination_cervical`, `act_hpylori_eradication_gastric`, `act_lynch_aspirin`, `act_serm_chemoprevention_breast`, `act_sglt2i_progressor`, `act_statin_stroke_prevention`, `act_treat_b12_thyroid`, `aspirin_primary`, `aspirin_secondary_prevention`, `canakinumab_il1b`, `dual_pathway_inhibition_pad`, `gdm_treatment_perinatal`, `glp1_cardiovascular_t2dm`, `intensive_glycemic_control`, `p2y12_dapt_post_acs`, `sglt2_cardiorenal_t2dm`, `statin_primary`.
- Procedure/device/threshold runner, 14: `aaa_repair_screen_detected`, `act_bariatric_surgery_cancer`, `act_barretts_rfa`, `act_brca_rrso`, `act_cea_asymptomatic_carotid`, `act_crc_resect_screendetected`, `act_dbs_parkinson`, `act_hearing_aids`, `act_influenza_pneumococcal_vax_ckd`, `act_kidney_transplant`, `cabg_high_risk_anatomy`, `icd_primary_prevention`, `laa_occlusion_watchman`, `pfo_closure_cryptogenic_stroke`.
- Surrogate/VOI/enablement runner, 13: `act_anti_amyloid_mab`, `act_anti_amyloid_mab_symptomatic`, `act_budesonide_tr_igan`, `act_lupus_nephritis_immunotherapy`, `act_ms_dmt`, `act_potassium_binder_enable_raasi`, `act_rituximab_membranous`, `act_sparsentan_glomerular`, `act_tolvaptan_adpkd`, `cgm_glycemic_mgmt`, `lpa_reclassify_intensify`, `lpa_targeted_lowering`, `metreleptin_lipodystrophy`.
- Diagnostic VOI/reclassification runner, 12: `act_brca_mri_surveillance`, `act_colonoscopy_polypectomy`, `act_hcc_surveillance_ultrasound`, `act_hereditary_other_surveillance`, `act_ldct_lung_resect`, `act_lfs_wbmri_surveillance`, `act_lynch_colonoscopy`, `act_mced_stageshift_workup`, `act_mutyh_colonoscopy`, `activity_cascade_inherited`, `fh_cascade_screening`, `retinopathy_screen_treat`.
- Lifestyle dose-response/multichannel runner, 12: `act_exercise_parkinson`, `act_lifestyle_genetic_riskmod`, `act_multidomain_finger`, `act_physical_activity_dementia`, `dietary_pattern_med`, `dietary_sodium_protein_ckd`, `ir_lifestyle_prevention`, `med_diet_cancer`, `med_diet_metabolic`, `physical_activity_cancer`, `physical_activity_rx`, `processed_red_meat_reduction`.
- Precision/genetic therapeutic runner, 10: `act_apol1_targeted`, `act_brca_chemoprevention`, `act_raasi_alport`, `act_raasi_monogenic`, `betablocker_lqts`, `fh_high_intensity_llt`, `mody_gck_deprescribe`, `mody_sulfonylurea_switch`, `neonatal_diabetes_sulfonylurea`, `teplizumab_t1d_delay`.

## Cross-cutting blockers observed

These are not mutually exclusive. They explain why records remain draft-blocked even when the clinical effect direction is plausible.

| Cross-cutting blocker | Affected surface | Minimum deterministic input/infrastructure |
|---|---|---|
| Patient-specific baseline risk binding | Almost all remaining records | A typed baseline-risk registry keyed by disease state, phenotype, time horizon, subgroup, and comparator. For diagnostics, this is pre-test risk/yield. For procedures, this is counterfactual event/progression risk. |
| Endpoint-specific `event_value_qaly` objects | Almost all action/procedure records | Replace `legacy_qaly_per_event` scalars with endpoint objects covering acute decrement, chronic utility loss, mortality curve shift, duration, age/horizon, and source trace. Add parallel harm-event objects. |
| Burden and cadence calibration | All remaining records | D4-compatible per-year, per-course, one-time, device, procedure, monitoring, and behavior burden bands with cadence and persistence. |
| Overlap reducers and attribution rules | Almost all remaining records | Deterministic overlap groups for lipid/BP/CKD/cardiometabolic/lifestyle/genetic/cancer-screen/procedure pathways, including mutual exclusion and marginal-credit logic. |
| Diagnostic VOI path decomposition | All 12 diagnostic records plus several VOI-like action records | `P_reclass`, downstream path probabilities, `qaly_if_reclassified`, false-positive/false-negative cascades, test burden, and explicit downstream-decision-change fields. |
| Surrogate-to-hard-outcome policy | CKD surrogate therapies, metabolic monitoring, neuro disease-modifying therapy, Lp(a), CGM | Either accepted transform with cap/haircut and validation, or zero C1 credit until hard-outcome evidence exists. |
| C2 utility anchors | Procedure/function, lifestyle, neuro, sensory, and metabolic records | Validated utility mapping for function, cognition, communication, motor state, energy, dyspnea, pain, caregiver load, and weight/glycemic quality-of-life effects before any C2 credit. |
| Genetic/cascade accounting | Hereditary cancer, FH, LQTS, APOL1/Alport/monogenic diabetes/CKD | Variant certainty, VUS handling, genotype-specific baseline risk/effect, management-change probability, family-boundary accounting, and cascade overlap rules. |

## Highest-leverage runner/input gaps

1. **General event-or-curve-shift medical action adapter.** Highest immediate yield because it directly covers **23** primary-blocked records and supplies shared inputs needed by procedure, surrogate, and precision classes. Minimum build: baseline-risk binding, effect trace, endpoint/harm `event_value_qaly`, D4 burden, and overlap validation.
2. **Procedure/device/threshold adapter.** Covers **14** records that cannot honestly fit a simple drug action path. Minimum build: threshold eligibility, comparator curve, procedure harms, one-time/longitudinal burden, device follow-up, and C2 utility option.
3. **Surrogate/VOI/enablement policy adapter.** Covers **13** records and prevents false precision for CKD, neuro, metabolic monitoring, Lp(a), and therapy-enablement actions. Minimum build: accepted surrogate transform or zero-credit gate, `P_enablement`, downstream value, and cap logic.
4. **Diagnostic VOI adapter.** Covers **12** screen records and several genetic/cascade or diagnostic-to-treatment records. Minimum build: `P_reclass`, downstream paths, false-positive/negative burden, cadence, and changed-management value.
5. **Lifestyle dose-response bundle adapter.** Covers **12** records and should be designed with overlap partitioning first, because physical activity, diet, weight, BP, diabetes, cancer, dementia, and C2 capacity benefits otherwise double-count.
6. **Precision/genetic actionability overlay.** Covers **10** primary records but also crosses diagnostic and procedure records. It should probably be implemented as an overlay used by the other adapters, not as an isolated runner.

## Practical unblock order

Recommended order for maximum map-eligible yield:

1. Implement shared typed objects first: baseline risk, endpoint/harm `event_value_qaly`, burden cadence, overlap reducer contract.
2. Promote the 23 direct event-or-curve-shift medical actions that only need those shared objects.
3. Add procedure threshold/device semantics and promote the 14 procedure/device records.
4. Add diagnostic VOI path decomposition and promote the 12 screen records.
5. Add surrogate/enablement policy before promoting surrogate-heavy CKD/metabolic/neuro records.
6. Add lifestyle dose-response and precision/genetic overlays once shared event, burden, and overlap contracts are stable.
