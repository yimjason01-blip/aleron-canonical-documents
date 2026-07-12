/**
 * Currency of truth registry.
 *
 * Jason views case state through the physician dashboard, always in the frame of
 * the governing canonical documents. This module maps live artifacts (risk domain,
 * vitality, wearables, plan) → definitional docs + diagram routes.
 *
 * Operational truth: physician_case.v1 from backend (what is true for this patient now).
 * Definitional truth: system-design / schemas / action library (what the system means).
 * Both must surface together.
 */

/** Public Pages shell (travel-safe). Dashboard is #dashboard-ds. */
export const CANONICAL_PAGES_BASE = 'https://yimjason01-blip.github.io/aleron-canonical-documents';

/**
 * @typedef {{ id: string, label: string, role: string, repoPath: string, pagesPath?: string|null, pagesHash?: string|null, surfaces: string[] }} CanonicalSource
 */

/** @type {Record<string, CanonicalSource>} */
export const CANONICAL_REGISTRY = {
  source_of_truth: {
    id: 'source_of_truth',
    label: 'Source of truth index',
    role: 'Index of external + internal canonical routes',
    repoPath: 'docs/SOURCE_OF_TRUTH.md',
    pagesPath: null,
    pagesHash: null,
    surfaces: ['global']
  },
  dashboard_runtime: {
    id: 'dashboard_runtime',
    label: 'Physician dashboard (runtime)',
    role: 'Operational currency of truth for active case review',
    repoPath: 'apps/physician/',
    pagesPath: null,
    pagesHash: '#dashboard-ds',
    surfaces: ['global', 'patient-data', 'risk', 'vitality', 'care-plan', 'journal', 'ai']
  },
  physician_case_schema: {
    id: 'physician_case_schema',
    label: 'Physician case contract',
    role: 'Bundle schema the dashboard requires',
    repoPath: 'schemas/physician_case.schema.json',
    surfaces: ['global']
  },
  patient_packet_schema: {
    id: 'patient_packet_schema',
    label: 'Patient packet contract',
    role: 'Measurement + wearables input shape',
    repoPath: 'schemas/patient_packet.schema.json',
    surfaces: ['patient-data']
  },
  architecture: {
    id: 'architecture',
    label: 'Architecture',
    role: 'Engine boundary and mono-repo modules',
    repoPath: 'docs/engineering/ARCHITECTURE.md',
    surfaces: ['global', 'care-plan']
  },
  risk_models_overview: {
    id: 'risk_models_overview',
    label: 'Risk models (diagram)',
    role: 'Five-domain risk surface',
    repoPath: 'system-design/diagrams/aleron-risk-models.html',
    pagesPath: 'system-design/diagrams/aleron-risk-models.html',
    pagesHash: '#risk-models',
    surfaces: ['risk']
  },
  prevent: {
    id: 'prevent',
    label: 'CVD / PREVENT',
    role: 'Cardiovascular risk model',
    repoPath: 'system-design/cvd-phenotype-risk-model-condensed.md',
    pagesPath: 'system-design/diagrams/aleron-prevent.html',
    surfaces: ['risk']
  },
  metabolic: {
    id: 'metabolic',
    label: 'Metabolic / FINDRISC placeholder',
    role: 'Metabolic domain (licensing-gated full QDiabetes)',
    repoPath: 'system-design/metabolic-phenotype-risk-model-condensed.md',
    pagesPath: 'system-design/diagrams/aleron-metabolic.html',
    surfaces: ['risk']
  },
  kidney: {
    id: 'kidney',
    label: 'CKD / KFRE',
    role: 'Kidney risk (validated eGFR < 60 population)',
    repoPath: 'system-design/ckd-phenotype-risk-model-condensed.md',
    pagesPath: 'system-design/diagrams/aleron-ckd.html',
    surfaces: ['risk']
  },
  neuro: {
    id: 'neuro',
    label: 'Neuro / CAIDE placeholder',
    role: 'Neurocognitive domain (licensing-gated CogDrisk)',
    repoPath: 'system-design/neuro-phenotype-risk-model-condensed.md',
    pagesPath: 'system-design/diagrams/aleron-neuro.html',
    surfaces: ['risk']
  },
  cancer: {
    id: 'cancer',
    label: 'Cancer burden sketch',
    role: 'Site engines representative',
    repoPath: 'models/risk-models/cancer/sporadic-cancer-burden-calculator-v0.md',
    pagesPath: 'system-design/diagrams/aleron-cancer.html',
    surfaces: ['risk']
  },
  vitality: {
    id: 'vitality',
    label: 'Vitality phenotype model v1.5',
    role: 'Within-person protocol; instruments subordinate; no composite score',
    repoPath: 'system-design/vitality-phenotype-model.md',
    pagesPath: 'system-design/diagrams/aleron-vitality-physician-outcomes.html',
    surfaces: ['vitality', 'care-plan', 'patient-data']
  },
  wearables_history: {
    id: 'wearables_history',
    label: 'Wearable history & trend requirements',
    role: 'Daily series, density gates, within-person baseline',
    repoPath: 'docs/engineering/WEARABLE_HISTORY_AND_TREND_REQUIREMENTS.md',
    surfaces: ['patient-data', 'vitality']
  },
  action_library: {
    id: 'action_library',
    label: 'Vitality action library',
    role: 'Deterministic care-plan actions from the governed library',
    repoPath: 'system-design/vitality-action-library.json',
    surfaces: ['care-plan']
  },
  action_engine: {
    id: 'action_engine',
    label: 'Action Engine contract',
    role: 'Side-module ranking contract (Python)',
    repoPath: 'system-design/ACTION_ENGINE_GENERALIZATION_CONTRACT.md',
    surfaces: ['care-plan']
  },
  design_reference: {
    id: 'design_reference',
    label: 'Dashboard design reference (golden)',
    role: 'Visual golden — not runtime truth',
    repoPath: 'system-design/diagrams/aleron-actionmap-al47m-ds.html',
    pagesPath: 'system-design/diagrams/aleron-actionmap-al47m-ds.html',
    surfaces: ['global']
  }
};

const RISK_DOMAIN_TO_SOURCE = {
  prevent_base_representative: 'prevent',
  prevent: 'prevent',
  cvd: 'prevent',
  metabolic_qdiabetes_representative: 'metabolic',
  metabolic: 'metabolic',
  kidney_ckd_representative: 'kidney',
  kidney: 'kidney',
  ckd: 'kidney',
  neuro_cogdrisk_representative: 'neuro',
  neuro: 'neuro',
  cancer_site_engines_representative: 'cancer',
  cancer: 'cancer'
};

export function pagesUrl(source) {
  if (!source) return null;
  if (source.pagesHash && !source.pagesPath) {
    return `${CANONICAL_PAGES_BASE}/${source.pagesHash}`;
  }
  if (source.pagesPath) {
    // Direct asset on Pages (when deployed with full bundle)
    return `${CANONICAL_PAGES_BASE}/${source.pagesPath}`;
  }
  return null;
}

export function resolveRiskSource(domainId) {
  const key = RISK_DOMAIN_TO_SOURCE[domainId] || null;
  return key ? CANONICAL_REGISTRY[key] : CANONICAL_REGISTRY.risk_models_overview;
}

/**
 * Build the truth ledger for the active case: definitional docs + live versions.
 */
export function buildCurrencyOfTruth(caseBundle, modelVersions = { risk: {}, vitality: {} }) {
  const risk = caseBundle?.risk_outputs
    || caseBundle?.action_map_state?.risk_outputs
    || caseBundle?.analytical_run?.risk_outputs
    || [];
  const vitality = caseBundle?.vitality_outputs
    || caseBundle?.action_map_state?.vitality_outputs
    || [];
  const wearables = caseBundle?.patient_packet?.measurements?.wearables || {};
  const hasWearableSummary = Boolean(wearables.summary?.schema_version || wearables.series);

  const entries = [];

  const push = (sourceId, extra = {}) => {
    const source = CANONICAL_REGISTRY[sourceId];
    if (!source) return;
    entries.push({
      id: source.id,
      label: source.label,
      role: source.role,
      repoPath: source.repoPath,
      href: pagesUrl(source),
      surfaces: source.surfaces,
      ...extra
    });
  };

  push('dashboard_runtime', { live: { schema: caseBundle?.schema_version || 'physician_case.v1' } });
  push('source_of_truth');
  push('patient_packet_schema');
  push('risk_models_overview');

  for (const row of risk) {
    const sourceId = RISK_DOMAIN_TO_SOURCE[row.id];
    if (sourceId) {
      push(sourceId, {
        live: {
          domain_id: row.id,
          model_version: row.model_version || modelVersions?.risk?.[row.id] || null,
          value: row.value,
          calculation_state: row.calculation_state || row.state || null
        }
      });
    }
  }

  for (const row of vitality) {
    push('vitality', {
      live: {
        id: row.id,
        model_version: row.model_version || modelVersions?.vitality?.[row.id] || 'aleron-vitality-phenotype.v1.5',
        source: row.source || 'system-design/vitality-phenotype-model.md',
        state: row.calculation_state || row.model_status || row.value || null,
        output_kind: row.output_kind || null
      }
    });
  }
  if (!vitality.length) push('vitality');

  if (hasWearableSummary) {
    push('wearables_history', {
      live: {
        summary_version: wearables.summary?.schema_version || null,
        series_present: Boolean(wearables.series),
        coverage: wearables.summary?.coverage || null
      }
    });
  } else {
    push('wearables_history', { live: { series_present: false, note: 'snapshot_only_or_missing' } });
  }

  push('action_library', {
    live: {
      plan_id: caseBundle?.clinical_plan?.plan_id || null,
      library_hint: 'action-library-v2 / vitality_action_library'
    }
  });
  push('architecture');

  // de-dupe by id keeping first with richest live
  const byId = new Map();
  for (const entry of entries) {
    if (!byId.has(entry.id) || (entry.live && !byId.get(entry.id).live)) {
      byId.set(entry.id, entry);
    }
  }

  return {
    principle: 'Dashboard case state is operational truth. Linked docs are definitional truth. Read both together.',
    pagesBase: CANONICAL_PAGES_BASE,
    dashboardRoute: `${CANONICAL_PAGES_BASE}/#dashboard-ds`,
    entries: [...byId.values()]
  };
}

/** Sources relevant to a tab for compact strip rendering. */
export function sourcesForSurface(truth, surface) {
  if (!truth?.entries) return [];
  return truth.entries.filter((e) => (e.surfaces || []).includes(surface) || (e.surfaces || []).includes('global'));
}
