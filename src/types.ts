export type MacroBucket =
  | "Time leakage"
  | "Feature / proxy leakage"
  | "Structure / pipeline leakage";

export type FineGrainedLeakageType =
  | "temporal"
  | "proxy"
  | "evaluation"
  | "boundary"
  | "join_entity"
  | "duplicate"
  | "aggregation_lookahead"
  | "label_definition"
  | "missing_metadata";

export type Severity = "low" | "medium" | "high" | "critical";
export type Confidence = "low" | "medium" | "high";

export interface FeatureDictionaryEntry {
  name: string;
  description: string;
  semantic_tags?: string[];
  availability?: "pre-decision" | "post-decision" | "derived" | "unknown";
  example?: string;
}

export interface AuditRequest {
  dataset_ref: string;
  domain_template: string;
  prediction_goal: string;
  target_column: string;
  timestamp_fields: string[];
  entity_keys: string[];
  feature_dictionary: FeatureDictionaryEntry[];
  pipeline_notes: string;
  model_artifacts_optional?: string;
  optional_uploads?: string[];
}

export interface AuditFinding {
  id: string;
  title: string;
  macro_bucket: MacroBucket;
  fine_grained_type: FineGrainedLeakageType;
  severity: Severity;
  confidence: Confidence;
  flagged_object: string;
  evidence: string[];
  why_it_matters: string;
  fix_recommendation: string[];
  needs_human_review: boolean;
}

export interface AuditReport {
  overall_risk: Severity;
  summary: string;
  findings: AuditFinding[];
  missing_metadata: string[];
  clarifying_questions: string[];
  fix_plan: string[];
  bucket_summary: Record<MacroBucket, number>;
  report_note?: string;
}

export interface DemoSignalTemplate {
  object_name: string;
  title: string;
  macro_bucket: MacroBucket;
  fine_grained_type: FineGrainedLeakageType;
  severity: Severity;
  confidence: Confidence;
  match_keywords: string[];
  match_scope: "feature" | "pipeline" | "request";
  evidence: string[];
  why_it_matters: string;
  fix_recommendation: string[];
  needs_human_review?: boolean;
}

export interface DemoCaseConfig {
  case_id: string;
  domain: string;
  title: string;
  story: string;
  narrator_line: string;
  source_label?: string;
  source_url?: string;
  source_note?: string;
  default_inputs: AuditRequest;
  expected_findings: string[];
  prompt_starters: string[];
  signal_templates: DemoSignalTemplate[];
}

export interface AgentMessage {
  role: "assistant" | "user";
  content: string;
}
