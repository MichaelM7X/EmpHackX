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
  csv_columns: string[];
  preprocessing_code: string;
  model_training_code?: string;
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
  missing_metadata: string[];
  clarifying_questions: string[];
  bucket_summary: Record<MacroBucket, number>;
}

export interface AgentMessage {
  role: "assistant" | "user";
  content: string;
}
