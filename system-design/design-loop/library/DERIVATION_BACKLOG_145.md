# 145-Action Full-Derivation Backlog

Generated from `action_library.json`. This is the worklist for converting the legacy 145-action catalog into the V2 Audited Valuation Library. Seed scores below are triage aids only, not final clinical derivations.

## Summary

- **legacy_actions:** 145
- **already_represented_in_current_v2_or_bundle:** 6
- **not_yet_represented_in_v2:** 139
- **by_action_class:** {'lifestyle': 20, 'drug': 79, 'procedure': 27, 'screen': 19}
- **by_derivation_family:** {'direct_multichannel_lifestyle': 20, 'direct_c1_event_or_curve_shift': 76, 'direct_procedure_prevention_or_resilience': 27, 'diagnostic_voi': 19, 'direct_action_generic': 2, 'surrogate_translated_value': 1}
- **by_endpoint_directness:** {'hard_or_clinical_outcome': 116, 'surrogate': 21, 'unclear_endpoint': 7, 'surrogate_or_intermediate': 1}
- **by_seed_evidence_level:** {'medium': 49, 'high': 59, 'low': 37}
- **by_engine_path:** {'action_map': 79, 'classifier': 24, 'second_order_action': 42}
- **by_classifier_bucket:** {'genetic_result_router': 19, 'get_evidence_open_path_voi': 5}

## Macro path split

- `engine_path: action_map` means first-order bounded valuation: the item has a computable downstream action-map value.
- `engine_path: classifier` means the item routes first and should not be counted as a failed action derivation.
- `engine_path: second_order_action` means the item may be clinically valuable, but is not computable at the initial Action Map level until state classification, eligibility/threshold resolution, surrogate policy, procedure counterfactual, or bundle/dose specification is done.
- `classifier_bucket: genetic_result_router` means gene, variant class, zygosity, penetrance, phenotype/context, and disclosure policy must classify the finding before action selection.
- `classifier_bucket: get_evidence_open_path_voi` means the information may change management, but downstream branches are not finite/value-bound enough for QALY mapping until classified.

## Acceptance bar for a fully derived action-map item

- Effect/value side: each nonzero C1/C2/C3/burden or closed-path diagnostic VOI parameter has structured derivation inputs and an evidence trace.
- Confidence side: `evidence_axis` is computed from component scores, caps, and primary trace parameters.
- Runner side: a scorer adapter or family adapter computes the emitted value. No map coordinate is only a typed scalar.
- Validator side: missing trace, mismatched evidence score, invalid caps, or missing diagnostic fields fail validation.
- UI side: dashboard renders emitted `action_map_state`, not hand-authored priorities.

## Items

| ID | Class | Domains | Evidence | Endpoint | Family | V2 now? | Missing count |
|---|---|---|---|---|---|---:|---:|
| smoking_cessation_program | lifestyle | cvd,cancer,neuro,ckd | moderate | hard_or_clinical_outcome | direct_multichannel_lifestyle | no | 11 |
| lifestyle_bp_lowering | lifestyle | cvd,neuro,ckd | moderate | hard_or_clinical_outcome | direct_multichannel_lifestyle | no | 11 |
| act_sglt2i_ckd | drug | ckd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_raasi_ckd | drug | ckd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_finerenone | drug | ckd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_glp1_ckd | drug | ckd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_bp_intensive_renal | drug | ckd | moderate | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_egfr_dose_review | procedure | ckd | weak | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| act_sglt2i_progressor | drug | ckd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_tolvaptan_adpkd | drug | ckd | weak | surrogate | direct_c1_event_or_curve_shift | no | 11 |
| act_raasi_alport | drug | ckd | weak | surrogate | direct_c1_event_or_curve_shift | no | 11 |
| act_apol1_targeted | drug | ckd | weak | surrogate | direct_c1_event_or_curve_shift | no | 11 |
| act_raasi_monogenic | drug | ckd | weak | surrogate | direct_c1_event_or_curve_shift | no | 11 |
| dietary_sodium_protein_ckd | lifestyle | ckd | weak | surrogate | direct_multichannel_lifestyle | no | 11 |
| act_sglt2i_nondiabetic_ckd | drug | ckd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_finerenone_nondiabetic_ckd | drug | ckd | moderate | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_finerenone_cv_hf | drug | ckd,cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_statin_ezetimibe_ckd | drug | ckd,cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_kidney_transplant | procedure | ckd | strong | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| act_sparsentan_glomerular | drug | ckd | weak | surrogate | direct_c1_event_or_curve_shift | no | 11 |
| act_budesonide_tr_igan | drug | ckd | weak | surrogate | direct_c1_event_or_curve_shift | no | 11 |
| act_rituximab_membranous | drug | ckd | weak | surrogate | direct_c1_event_or_curve_shift | no | 11 |
| act_lupus_nephritis_immunotherapy | drug | ckd | weak | surrogate | direct_c1_event_or_curve_shift | no | 11 |
| act_potassium_binder_enable_raasi | drug | ckd | weak | surrogate | direct_c1_event_or_curve_shift | no | 11 |
| act_nephrology_referral_mdc | procedure | ckd | moderate | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| act_influenza_pneumococcal_vax_ckd | procedure | ckd | weak | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| multifactorial_intensive_t2dm | procedure | metabolic,cvd,ckd | strong | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| aspirin_secondary_prevention | drug | cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| p2y12_dapt_post_acs | drug | cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| high_intensity_statin_secondary | drug | cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| semaglutide_select_secondary | drug | cvd,metabolic | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| influenza_vaccination_cv | drug | cvd | moderate | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| doac_afib_anticoagulation | drug | cvd,neuro | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| af_catheter_ablation_hf | procedure | cvd | moderate | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| laa_occlusion_watchman | procedure | cvd | moderate | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| arni_hfref | drug | cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| betablocker_hfref | drug | cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| mra_hfref | drug | cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| sglt2i_hfref | drug | cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| sglt2i_hfpef | drug | cvd,metabolic | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| icd_primary_ischemic_cardiomyopathy | procedure | cvd | strong | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| crt_hfref_wide_qrs | procedure | cvd | strong | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| avr_severe_aortic_stenosis | procedure | cvd | strong | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| carotid_endarterectomy_symptomatic | procedure | cvd,neuro | strong | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| cabg_high_risk_anatomy | procedure | cvd | strong | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| pfo_closure_cryptogenic_stroke | procedure | cvd,neuro | strong | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| dual_pathway_inhibition_pad | drug | cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| aaa_repair_screen_detected | procedure | cvd | strong | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| aaa_ultrasound_screening | screen | cvd | strong | hard_or_clinical_outcome | diagnostic_voi | no | 12 |
| act_hpylori_eradication_gastric | drug | cancer | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_hbv_vaccination_hcc | drug | cancer | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_hbv_antiviral_hcc | drug | cancer | moderate | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_hcv_daa_cure_hcc | drug | cancer | moderate | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_hcc_surveillance_ultrasound | screen | cancer | moderate | hard_or_clinical_outcome | diagnostic_voi | no | 12 |
| act_hpv_vaccination_cervical | drug | cancer | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_hpv_vaccination_anal_oro | drug | cancer | weak | surrogate | direct_c1_event_or_curve_shift | no | 11 |
| act_barretts_rfa | procedure | cancer | strong | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| act_serm_chemoprevention_breast | drug | cancer | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_ai_chemoprevention_breast | drug | cancer | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_aspirin_crc_sporadic | drug | cancer | moderate | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_bariatric_surgery_cancer | procedure | cancer,metabolic | moderate | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| act_anal_hsil_treatment | screen | cancer | strong | hard_or_clinical_outcome | diagnostic_voi | no | 12 |
| statin_primary | drug | cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | yes | 10 |
| ezetimibe_addon | drug | cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| pcsk9_inhibitor | drug | cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| bempedoic_acid | drug | cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| aspirin_primary | drug | cvd | weak | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| antihypertensive_rx | drug | cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| colchicine_ldose | drug | cvd | moderate | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| canakinumab_il1b | drug | cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| icosapent_ethyl | drug | cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| fh_high_intensity_llt | drug | cvd | moderate | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| fh_cascade_screening | screen | cvd | moderate | hard_or_clinical_outcome | diagnostic_voi | no | 12 |
| lpa_reclassify_intensify | drug | cvd | moderate | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| lpa_targeted_lowering | drug | cvd | weak | surrogate | direct_c1_event_or_curve_shift | no | 11 |
| icd_primary_prevention | procedure | cvd | moderate | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| betablocker_lqts | drug | cvd | moderate | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| activity_cascade_inherited | screen | cvd | weak | surrogate | diagnostic_voi | no | 12 |
| metformin_prevention | drug | metabolic | strong | unclear_endpoint | direct_action_generic | no | 11 |
| incretin_prevention_obesity | drug | metabolic | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| glp1_cardiovascular_t2dm | drug | metabolic | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| sglt2_cardiorenal_t2dm | drug | metabolic | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| intensive_glycemic_control | drug | metabolic | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| cgm_glycemic_mgmt | drug | metabolic | weak | surrogate | direct_c1_event_or_curve_shift | no | 11 |
| metabolic_surgery | procedure | metabolic | moderate | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| mody_sulfonylurea_switch | drug | metabolic | moderate | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| mody_gck_deprescribe | drug | metabolic | moderate | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| neonatal_diabetes_sulfonylurea | drug | metabolic | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| metreleptin_lipodystrophy | drug | metabolic | weak | surrogate | surrogate_translated_value | no | 11 |
| incretin_hfpef_obesity | drug | metabolic,cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| metformin_macrovascular_t2dm | drug | metabolic,cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| pioglitazone_stroke_mi_ir | drug | metabolic,cvd | moderate | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| acarbose_cv_igt | drug | metabolic,cvd | weak | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| orlistat_t2dm_prevention | drug | metabolic | weak | unclear_endpoint | direct_action_generic | no | 11 |
| gdm_treatment_perinatal | drug | metabolic | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| gdm_screen_treat | screen | metabolic | moderate | hard_or_clinical_outcome | diagnostic_voi | no | 12 |
| retinopathy_screen_treat | screen | metabolic | moderate | hard_or_clinical_outcome | diagnostic_voi | no | 12 |
| teplizumab_t1d_delay | drug | metabolic | moderate | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_colonoscopy_polypectomy | screen | cancer | strong | hard_or_clinical_outcome | diagnostic_voi | no | 12 |
| act_crc_resect_screendetected | procedure | cancer | strong | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| act_ldct_lung_resect | screen | cancer | strong | hard_or_clinical_outcome | diagnostic_voi | no | 12 |
| act_mammo_breast_treat | screen | cancer | strong | hard_or_clinical_outcome | diagnostic_voi | no | 12 |
| act_breastmri_supplemental | screen | cancer | weak | surrogate | diagnostic_voi | no | 12 |
| act_cervical_hpv_treat_precursor | screen | cancer | strong | hard_or_clinical_outcome | diagnostic_voi | no | 12 |
| act_psa_workup_treat | screen | cancer | moderate | hard_or_clinical_outcome | diagnostic_voi | no | 12 |
| act_brca_rrso | procedure | cancer | moderate | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| act_brca_rrm | procedure | cancer | strong | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| act_brca_mri_surveillance | screen | cancer | moderate | hard_or_clinical_outcome | diagnostic_voi | no | 12 |
| act_brca_chemoprevention | drug | cancer | moderate | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_lynch_colonoscopy | screen | cancer | moderate | hard_or_clinical_outcome | diagnostic_voi | no | 12 |
| act_lynch_aspirin | drug | cancer | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_lynch_gyn_riskreduce | procedure | cancer | moderate | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| act_mutyh_colonoscopy | screen | cancer | weak | hard_or_clinical_outcome | diagnostic_voi | no | 12 |
| act_lfs_wbmri_surveillance | screen | cancer | moderate | hard_or_clinical_outcome | diagnostic_voi | no | 12 |
| act_hereditary_other_surveillance | screen | cancer | moderate | hard_or_clinical_outcome | diagnostic_voi | no | 12 |
| act_mced_stageshift_workup | screen | cancer | weak | surrogate | diagnostic_voi | no | 12 |
| act_bp_control_dementia | drug | neuro | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_hearing_aids | procedure | neuro | weak | surrogate | direct_procedure_prevention_or_resilience | no | 11 |
| act_treat_b12_thyroid | drug | neuro | weak | surrogate | direct_c1_event_or_curve_shift | no | 11 |
| act_anti_amyloid_mab | drug | neuro | weak | surrogate | direct_c1_event_or_curve_shift | no | 11 |
| act_anti_amyloid_mab_symptomatic | drug | neuro | moderate | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_cea_asymptomatic_carotid | procedure | neuro,cvd | moderate | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| act_statin_stroke_prevention | drug | neuro,cvd | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_dbs_parkinson | procedure | neuro | strong | unclear_endpoint | direct_procedure_prevention_or_resilience | no | 11 |
| act_ms_dmt | drug | neuro | strong | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_nph_shunt | procedure | neuro | strong | unclear_endpoint | direct_procedure_prevention_or_resilience | no | 11 |
| act_zoster_vaccine_dementia | drug | neuro | moderate | hard_or_clinical_outcome | direct_c1_event_or_curve_shift | no | 11 |
| act_cataract_surgery_dementia | procedure | neuro | weak | hard_or_clinical_outcome | direct_procedure_prevention_or_resilience | no | 11 |
| alcohol_reduction | lifestyle | cvd,cancer | moderate | hard_or_clinical_outcome | direct_multichannel_lifestyle | no | 11 |
| dietary_pattern_med | lifestyle | cvd,metabolic,cancer,neuro | moderate | hard_or_clinical_outcome | direct_multichannel_lifestyle | no | 11 |
| physical_activity_rx | lifestyle | cvd,metabolic,cancer,neuro | moderate | hard_or_clinical_outcome | direct_multichannel_lifestyle | yes | 10 |
| dpp_lifestyle | lifestyle | metabolic | strong | hard_or_clinical_outcome | direct_multichannel_lifestyle | no | 11 |
| ir_lifestyle_prevention | lifestyle | metabolic | weak | surrogate_or_intermediate | direct_multichannel_lifestyle | no | 11 |
| direct_weight_remission | lifestyle | metabolic | moderate | hard_or_clinical_outcome | direct_multichannel_lifestyle | no | 11 |
| physical_activity_metabolic | lifestyle | metabolic | moderate | unclear_endpoint | direct_multichannel_lifestyle | yes | 10 |
| med_diet_metabolic | lifestyle | metabolic | moderate | unclear_endpoint | direct_multichannel_lifestyle | no | 11 |
| physical_activity_cancer | lifestyle | cancer | moderate | hard_or_clinical_outcome | direct_multichannel_lifestyle | yes | 10 |
| med_diet_cancer | lifestyle | cancer | weak | hard_or_clinical_outcome | direct_multichannel_lifestyle | no | 11 |
| fiber_wholegrain_intake | lifestyle | cvd,metabolic,cancer | weak | hard_or_clinical_outcome | direct_multichannel_lifestyle | no | 11 |
| processed_red_meat_reduction | lifestyle | cancer,metabolic,cvd | weak | hard_or_clinical_outcome | direct_multichannel_lifestyle | no | 11 |
| act_physical_activity_dementia | lifestyle | neuro | moderate | hard_or_clinical_outcome | direct_multichannel_lifestyle | yes | 10 |
| act_multidomain_finger | lifestyle | neuro | moderate | unclear_endpoint | direct_multichannel_lifestyle | no | 11 |
| act_lifestyle_genetic_riskmod | lifestyle | neuro | weak | hard_or_clinical_outcome | direct_multichannel_lifestyle | no | 11 |
| act_exercise_parkinson | lifestyle | neuro | weak | surrogate | direct_multichannel_lifestyle | yes | 10 |
| act_cognitive_speed_training | lifestyle | neuro | weak | hard_or_clinical_outcome | direct_multichannel_lifestyle | no | 11 |

