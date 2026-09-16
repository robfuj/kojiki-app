/**
 * Specialist registry, transcribed from
 * engine/kojiki_core/specialists/<key>/config.yaml in robfuj/kojiki-ontology.
 *
 * `decisionRights` mirrors the seven-verb decision-rights model
 * (own / recommend / consult / approve / execute / escalate / automate) and
 * `handoffs` mirrors the Cross-Functional Handoff Standard entries.
 */

export type DecisionRightVerb =
  | 'own'
  | 'recommend'
  | 'consult'
  | 'approve'
  | 'execute'
  | 'escalate'
  | 'automate'

export type DecisionRights = Record<DecisionRightVerb, string[]>

export interface Handoff {
  target: string
  trigger: string
  payloadSchema: string
}

export interface Specialist {
  key: string
  department: string
  description: string
  skills: string[]
  tools: string[]
  temperature: number
  decisionRights: DecisionRights
  handoffs: Handoff[]
}

export const SPECIALISTS: Specialist[] = [
  {
    key: 'engineering-platform',
    department: 'Engineering',
    description: 'Product, Customer Success, Technology, Referral tech',
    skills: ['github-autodiscovery', 'specialist-builder', 'multi-agent-orchestration'],
    tools: [
      'code_analyzer',
      'architecture_reviewer',
      'ci_cd_validator',
      'dependency_auditor',
      'performance_profiler',
      'tech_debt_tracker',
    ],
    temperature: 0.2,
    decisionRights: {
      own: ['technical_architecture', 'tech_stack_decisions', 'refactoring_priorities', 'infrastructure_scaling'],
      recommend: ['feature_prioritization', 'api_design', 'database_schema', 'security_standards'],
      consult: ['product_roadmap', 'sales_commitments', 'marketing_launch_dates', 'legal_compliance'],
      approve: ['production_deployments', 'breaking_changes', 'security_patches', 'vendor_technologies'],
      execute: ['code_reviews', 'feature_development', 'bug_fixes', 'performance_optimization', 'tech_debt_reduction'],
      escalate: ['architecture_overhaul', 'major_outage', 'security_breach', 'vendor_lock_in_risk'],
      automate: ['ci_cd_pipeline', 'dependency_updates', 'code_formatting', 'test_generation', 'deployment_rollback'],
    },
    handoffs: [
      { target: 'marketing-brand', trigger: 'feature_launch_ready', payloadSchema: 'schemas/handoff-feature-launch.json' },
      { target: 'sales-outbound', trigger: 'technical_demo_ready', payloadSchema: 'schemas/handoff-demo-ready.json' },
      { target: 'operations-ops', trigger: 'infrastructure_change', payloadSchema: 'schemas/handoff-infra-change.json' },
    ],
  },
  {
    key: 'finance-accounting',
    department: 'Finance',
    description: 'Budget, CAC, ROI, FP&A, treasury',
    skills: ['deck-builder', 'github-autodiscovery'],
    tools: ['financial_modeling', 'treasury_management', 'budget_analysis', 'cac_calculator', 'roi_analyzer'],
    temperature: 0.3,
    decisionRights: {
      own: ['budget_allocation', 'treasury_policy', 'financial_reporting'],
      recommend: ['pricing_strategy', 'investment_decisions', 'cost_optimization'],
      consult: ['product_roadmap', 'engineering_capacity', 'marketing_budget'],
      approve: ['capital_expenditure_over_50k', 'vendor_contracts_over_25k'],
      execute: ['monthly_close', 'forecast_updates', 'expense_processing'],
      escalate: ['budget_variance_over_10pct', 'cash_flow_crisis', 'audit_findings'],
      automate: ['expense_categorization', 'recurring_journal_entries', 'bank_reconciliation'],
    },
    handoffs: [
      { target: 'engineering-platform', trigger: 'feature_cost_estimate', payloadSchema: 'schemas/handoff-cost-estimate.json' },
      { target: 'marketing-brand', trigger: 'campaign_roi_review', payloadSchema: 'schemas/handoff-roi-review.json' },
      { target: 'sales-outbound', trigger: 'pipeline_revenue_forecast', payloadSchema: 'schemas/handoff-pipeline-forecast.json' },
    ],
  },
  {
    key: 'legal-compliance',
    department: 'Legal',
    description: 'Compliance, Risk, contracts, regulatory',
    skills: ['deck-builder', 'github-autodiscovery'],
    tools: ['contract_analyzer', 'compliance_checker', 'risk_assessor', 'regulatory_tracker', 'policy_generator', 'litigation_tracker'],
    temperature: 0.2,
    decisionRights: {
      own: ['contract_templates', 'compliance_policy', 'risk_framework', 'regulatory_strategy'],
      recommend: ['contract_terms', 'litigation_strategy', 'ip_protection', 'data_privacy'],
      consult: ['product_features', 'marketing_claims', 'sales_contracts', 'hr_policies', 'engineering_security'],
      approve: ['major_contracts', 'settlement_agreements', 'regulatory_filings', 'policy_changes'],
      execute: ['contract_review', 'compliance_audit', 'risk_assessment', 'policy_drafting', 'regulatory_response'],
      escalate: ['litigation_risk', 'regulatory_investigation', 'data_breach', 'ip_infringement'],
      automate: ['contract_redlining', 'compliance_monitoring', 'policy_distribution', 'training_tracking'],
    },
    handoffs: [
      { target: 'sales-outbound', trigger: 'contract_approved', payloadSchema: 'schemas/handoff-contract-approved.json' },
      { target: 'engineering-platform', trigger: 'compliance_requirement', payloadSchema: 'schemas/handoff-compliance-req.json' },
      { target: 'people-hr', trigger: 'policy_update', payloadSchema: 'schemas/handoff-policy-update.json' },
    ],
  },
  {
    key: 'marketing-brand',
    department: 'Marketing',
    description: 'Brand, growth, referral, paid media',
    skills: ['deck-builder', 'github-autodiscovery', 'multi-agent-orchestration'],
    tools: ['brand_analysis', 'campaign_optimizer', 'referral_tracker', 'paid_media_analyzer', 'seo_auditor', 'content_calendar'],
    temperature: 0.4,
    decisionRights: {
      own: ['brand_strategy', 'campaign_budget', 'creative_direction', 'channel_mix'],
      recommend: ['product_positioning', 'pricing_strategy', 'market_entry'],
      consult: ['engineering_roadmap', 'sales_capacity', 'legal_compliance'],
      approve: ['brand_guidelines', 'major_campaign_launch', 'influencer_contracts'],
      execute: ['campaign_launch', 'content_publishing', 'social_scheduling', 'ab_tests'],
      escalate: ['brand_crisis', 'budget_over_100k', 'regulatory_complaint'],
      automate: ['social_scheduling', 'ab_test_variants', 'performance_reporting', 'lead_scoring'],
    },
    handoffs: [
      { target: 'sales-outbound', trigger: 'qualified_lead', payloadSchema: 'schemas/handoff-lead.json' },
      { target: 'engineering-platform', trigger: 'landing_page_request', payloadSchema: 'schemas/handoff-landing-page.json' },
      { target: 'finance-accounting', trigger: 'campaign_budget_request', payloadSchema: 'schemas/handoff-budget-request.json' },
    ],
  },
  {
    key: 'operations-ops',
    department: 'Operations',
    description: 'Supply chain, procurement, day-to-day ops',
    skills: ['deck-builder', 'github-autodiscovery'],
    tools: ['supply_chain_optimizer', 'procurement_analyzer', 'vendor_manager', 'inventory_tracker', 'logistics_planner', 'workflow_automator'],
    temperature: 0.3,
    decisionRights: {
      own: ['vendor_selection', 'procurement_policy', 'inventory_levels', 'logistics_routing'],
      recommend: ['capacity_planning', 'make_vs_buy', 'outsourcing_decisions'],
      consult: ['product_launch_timeline', 'engineering_infra_needs', 'finance_budget', 'legal_contracts'],
      approve: ['major_vendor_contracts', 'facility_changes', 'emergency_procurement'],
      execute: ['purchase_orders', 'vendor_onboarding', 'inventory_rebalancing', 'shipment_scheduling'],
      escalate: ['supply_disruption', 'vendor_quality_issue', 'cost_overrun_20pct', 'regulatory_violation'],
      automate: ['reorder_points', 'vendor_scorecards', 'shipment_tracking', 'compliance_checks'],
    },
    handoffs: [
      { target: 'finance-accounting', trigger: 'procurement_spend_report', payloadSchema: 'schemas/handoff-procurement-spend.json' },
      { target: 'engineering-platform', trigger: 'infra_capacity_request', payloadSchema: 'schemas/handoff-capacity-request.json' },
      { target: 'legal-compliance', trigger: 'vendor_contract_review', payloadSchema: 'schemas/handoff-vendor-contract.json' },
    ],
  },
  {
    key: 'people-hr',
    department: 'People & Comms',
    description: 'HR, Internal comms, Public Affairs',
    skills: ['deck-builder', 'github-autodiscovery'],
    tools: ['org_designer', 'compensation_analyzer', 'talent_acquisition', 'engagement_survey', 'comms_drafter', 'policy_communicator'],
    temperature: 0.4,
    decisionRights: {
      own: ['org_structure', 'compensation_bands', 'hiring_policy', 'culture_initiatives', 'internal_comms'],
      recommend: ['headcount_plan', 'performance_framework', 'learning_budget', 'dei_strategy'],
      consult: ['department_headcount', 'role_definitions', 'promotion_cases', 'employee_relations'],
      approve: ['executive_compensation', 'major_policy_changes', 'crisis_communications', 'public_statements'],
      execute: ['recruiting', 'onboarding', 'performance_reviews', 'communications', 'events', 'policy_rollout'],
      escalate: ['executive_departure', 'harassment_claim', 'whistleblower', 'labor_dispute', 'reputation_crisis'],
      automate: ['job_posting', 'candidate_screening', 'onboarding_checklist', 'survey_distribution', 'policy_acknowledgment'],
    },
    handoffs: [
      { target: 'finance-accounting', trigger: 'headcount_budget_request', payloadSchema: 'schemas/handoff-headcount-budget.json' },
      { target: 'legal-compliance', trigger: 'employment_law_review', payloadSchema: 'schemas/handoff-employment-law.json' },
      { target: 'engineering-platform', trigger: 'technical_hiring_plan', payloadSchema: 'schemas/handoff-tech-hiring.json' },
    ],
  },
  {
    key: 'sales-outbound',
    department: 'Sales',
    description: 'Outbound, growth, Biz Dev, Corp Dev',
    skills: ['deck-builder', 'github-autodiscovery', 'multi-agent-orchestration'],
    tools: ['crm_enrichment', 'outreach_sequencer', 'proposal_generator', 'pipeline_analyzer', 'territory_planner', 'deal_scorer'],
    temperature: 0.3,
    decisionRights: {
      own: ['outbound_strategy', 'territory_assignment', 'quota_setting', 'deal_approval_under_50k'],
      recommend: ['pricing_discounts', 'contract_terms', 'partnership_deals'],
      consult: ['product_roadmap', 'marketing_campaigns', 'legal_contracts', 'finance_terms'],
      approve: ['enterprise_deals_over_100k', 'strategic_partnerships', 'channel_partner_agreements'],
      execute: ['outbound_sequences', 'demo_scheduling', 'proposal_delivery', 'follow_up_cadence'],
      escalate: ['deal_stalled_60_days', 'competitive_displacement', 'pricing_exception', 'legal_redline'],
      automate: ['lead_routing', 'sequence_enrollment', 'activity_logging', 'forecast_updates'],
    },
    handoffs: [
      { target: 'engineering-platform', trigger: 'technical_requirements', payloadSchema: 'schemas/handoff-tech-requirements.json' },
      { target: 'legal-compliance', trigger: 'contract_review', payloadSchema: 'schemas/handoff-contract-review.json' },
      { target: 'finance-accounting', trigger: 'revenue_recognition', payloadSchema: 'schemas/handoff-revenue-recognition.json' },
    ],
  },
  {
    key: 'ai-intelligence',
    department: 'Technology Platform',
    description: 'AI strategy, models, governance, InfoSec, identity, tools',
    skills: ['github-autodiscovery', 'specialist-builder', 'multi-agent-orchestration'],
    tools: ['model_evaluator', 'governance_auditor', 'security_scanner', 'identity_manager', 'tool_registry', 'ai_risk_assessor'],
    temperature: 0.2,
    decisionRights: {
      own: ['model_selection', 'ai_governance_policy', 'infosec_standards', 'identity_architecture', 'tool_approval'],
      recommend: ['ai_strategy', 'model_deployment', 'security_architecture', 'vendor_ai_tools'],
      consult: ['product_ai_features', 'engineering_ml_infra', 'legal_ai_compliance', 'finance_ai_budget'],
      approve: ['production_model_deployment', 'data_access_policies', 'security_incident_response', 'ai_vendor_contracts'],
      execute: ['model_training', 'governance_review', 'security_audit', 'identity_provisioning', 'tool_evaluation'],
      escalate: ['model_bias_incident', 'security_breach', 'data_privacy_violation', 'ai_safety_concern', 'regulatory_ai_inquiry'],
      automate: ['model_monitoring', 'drift_detection', 'vulnerability_scanning', 'access_review', 'compliance_reporting'],
    },
    handoffs: [
      { target: 'engineering-platform', trigger: 'model_deployment_request', payloadSchema: 'schemas/handoff-model-deploy.json' },
      { target: 'legal-compliance', trigger: 'ai_compliance_review', payloadSchema: 'schemas/handoff-ai-compliance.json' },
      { target: 'operations-ops', trigger: 'infra_for_ml_request', payloadSchema: 'schemas/handoff-ml-infra.json' },
    ],
  },
]

export const SPECIALIST_BY_KEY = new Map(SPECIALISTS.map((s) => [s.key, s]))

export function getSpecialist(key: string): Specialist | undefined {
  return SPECIALIST_BY_KEY.get(key)
}

/** Human-readable label, e.g. "engineering-platform" -> "Engineering Platform". */
export function specialistLabel(key: string): string {
  return key
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
