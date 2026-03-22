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
}

export interface AuditRequest {
  prediction_goal: string;
  target_column: string;
  feature_dictionary: FeatureDictionaryEntry[];
  timestamp_fields: string[];
  entity_keys: string[];
  pipeline_notes: string;
  prediction_time_point: string;
  preprocessing_code?: string;
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
  narrative_report: string;
  findings: AuditFinding[];
  safe_features: string[];
  missing_metadata: string[];
  clarifying_questions: string[];
  fix_plan: string[];
  bucket_summary: Record<MacroBucket, number>;
  report_note?: string;
}

export interface AgentMessage {
  role: "assistant" | "user";
  content: string;
}
