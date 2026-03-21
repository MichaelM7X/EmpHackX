import { DemoCaseConfig } from "../types";

export const demoCases: DemoCaseConfig[] = [
  {
    case_id: "nyc-rental",
    domain: "Housing",
    title: "NYC rental prediction",
    story:
      "We are New York students trying to predict listing rent and whether an apartment will be leased within 7 days. The flashy model looks amazing offline, but LeakGuard checks whether the model is learning pricing signals or quietly cheating with future information and repeated-building shortcuts.",
    narrator_line:
      "This is the main 2-minute walkthrough: a relatable housing dataset where time leakage, proxy leakage, and structure leakage all show up naturally.",
    default_inputs: {
      dataset_ref: "nyc-rental-listings-demo.csv",
      domain_template: "Housing",
      prediction_goal:
        "Predict monthly rent and whether a rental listing will be leased within 7 days.",
      target_column: "leased_within_7_days",
      timestamp_fields: ["listing_date", "lease_signed_date"],
      entity_keys: ["listing_id", "building_id", "landlord_id"],
      feature_dictionary: [
        {
          name: "bedrooms",
          description: "Bedroom count visible when the listing goes live.",
          semantic_tags: ["clean_signal"],
          availability: "pre-decision",
        },
        {
          name: "distance_to_subway",
          description: "Nearest subway stop distance at listing time.",
          semantic_tags: ["clean_signal"],
          availability: "pre-decision",
        },
        {
          name: "days_on_market",
          description:
            "Number of days the listing stayed active before it was rented.",
          semantic_tags: ["proxy_leakage", "label_definition"],
          availability: "post-decision",
        },
        {
          name: "final_lease_price",
          description:
            "Final signed price after negotiation, recorded after the deal closes.",
          semantic_tags: ["proxy_leakage"],
          availability: "post-decision",
        },
        {
          name: "neighborhood_avg_rent",
          description:
            "Neighborhood average rent computed over the full dataset, including future months.",
          semantic_tags: ["time_leakage", "aggregation_lookahead"],
          availability: "derived",
        },
        {
          name: "broker_fee_flag",
          description: "Whether the unit had a broker fee at listing time.",
          semantic_tags: ["clean_signal"],
          availability: "pre-decision",
        },
      ],
      pipeline_notes:
        "Random split across listings. Multiple units from the same building and landlord appear in both train and test. Neighborhood average rent was computed with all available months, not just data available at listing time.",
      model_artifacts_optional:
        "Optional notebook shows a single sklearn pipeline evaluated with a random split.",
      optional_uploads: [
        "nyc-rental-listings-demo.csv",
        "housing_feature_dictionary.json",
        "baseline_notebook.py",
      ],
    },
    expected_findings: [
      "Future rent aggregates are leaking through neighborhood_avg_rent.",
      "days_on_market behaves like the answer key for fast-lease prediction.",
      "Units from the same building/landlord are split across train and test.",
    ],
    prompt_starters: [
      "Why is days_on_market leaky?",
      "What should we change before showing this model to judges?",
      "Which issue matters most for deployment trust?",
    ],
    signal_templates: [
      {
        object_name: "neighborhood_avg_rent",
        title: "Future market averages are crossing the decision boundary",
        macro_bucket: "Time leakage",
        fine_grained_type: "aggregation_lookahead",
        severity: "high",
        confidence: "high",
        match_keywords: [
          "neighborhood_avg_rent",
          "all available months",
          "future months",
          "full dataset",
        ],
        match_scope: "feature",
        evidence: [
          "The feature is described as a neighborhood average computed over the full dataset.",
          "That means January predictions can silently incorporate rent information from later months.",
        ],
        why_it_matters:
          "The model will look smarter offline than it can possibly be in a live marketplace because it is using future market conditions.",
        fix_recommendation: [
          "Recompute neighborhood aggregates using only data available up to the listing date.",
          "Version aggregate features by month or decision timestamp.",
        ],
      },
      {
        object_name: "days_on_market",
        title: "days_on_market is acting as an answer proxy",
        macro_bucket: "Feature / proxy leakage",
        fine_grained_type: "label_definition",
        severity: "critical",
        confidence: "high",
        match_keywords: ["days_on_market", "stayed active", "leased within 7 days"],
        match_scope: "feature",
        evidence: [
          "The feature is only known after the listing has already spent time on the market.",
          "For a quick-lease label, the value nearly restates the target itself.",
        ],
        why_it_matters:
          "A strong score here says more about post-outcome bookkeeping than true demand forecasting.",
        fix_recommendation: [
          "Drop days_on_market from any model meant to score a listing at publish time.",
          "If retention time is the target, define features strictly from pre-listing or same-day signals.",
        ],
      },
      {
        object_name: "final_lease_price",
        title: "Signed-price information is leaking into the listed-price task",
        macro_bucket: "Feature / proxy leakage",
        fine_grained_type: "proxy",
        severity: "high",
        confidence: "high",
        match_keywords: ["final_lease_price", "signed price", "after negotiation"],
        match_scope: "feature",
        evidence: [
          "The feature is recorded after negotiation completes.",
          "Its value is downstream of the pricing process the model claims to predict.",
        ],
        why_it_matters:
          "The model can memorize the transaction outcome instead of learning listing-side pricing patterns.",
        fix_recommendation: [
          "Remove signed-price fields from listing-time prediction models.",
          "Separate listing-time tasks from post-close analytics.",
        ],
      },
      {
        object_name: "building leakage",
        title: "Repeated buildings and landlords are split across train and test",
        macro_bucket: "Structure / pipeline leakage",
        fine_grained_type: "join_entity",
        severity: "high",
        confidence: "high",
        match_keywords: [
          "random split",
          "same building",
          "same landlord",
          "train and test",
        ],
        match_scope: "pipeline",
        evidence: [
          "Pipeline notes say the split is random across listings.",
          "The same building_id and landlord_id appear on both sides of the split.",
        ],
        why_it_matters:
          "The model can learn building identity and landlord patterns rather than general rent behavior, inflating offline accuracy.",
        fix_recommendation: [
          "Group the split by building_id or landlord_id.",
          "Use a time-aware holdout so future listings do not help past predictions.",
        ],
      },
    ],
  },
  {
    case_id: "sepsis-audit",
    domain: "Healthcare",
    title: "Sepsis early-warning audit",
    story:
      "This case is a credibility anchor for high-stakes auditing. LeakGuard inspects a synthetic sepsis early-warning setup inspired by a real clinical validation story and flags where a model may be relying on operational responses or full-stay summaries instead of pre-deterioration signals.",
    narrator_line:
      "Use this as a quick-switch credibility case: it shows why methodological trust matters when the domain is clinical and mistakes are expensive.",
    source_label:
      "JAMA Internal Medicine: External Validation of a Widely Implemented Proprietary Sepsis Prediction Model in Hospitalized Patients",
    source_url:
      "https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/2781307",
    source_note:
      "This demo case is inspired by a real clinical validation failure story. It is an audit-style demonstration, not a recreation of the study and not a clinical claim.",
    default_inputs: {
      dataset_ref: "synthetic-sepsis-audit-demo.csv",
      domain_template: "Healthcare",
      prediction_goal:
        "Audit a model that predicts sepsis or clinical deterioration within the next 12 hours.",
      target_column: "deterioration_within_12h",
      timestamp_fields: ["admission_time", "measurement_time", "outcome_time"],
      entity_keys: ["patient_id", "encounter_id"],
      feature_dictionary: [
        {
          name: "heart_rate_last_6h",
          description: "Rolling heart-rate summary from the first 6 hours.",
          semantic_tags: ["clean_signal"],
          availability: "pre-decision",
        },
        {
          name: "lactate_initial",
          description: "Initial lactate value collected early in the stay.",
          semantic_tags: ["clean_signal"],
          availability: "pre-decision",
        },
        {
          name: "rapid_response_team_called",
          description:
            "Whether a rapid response team was called after clinicians noticed instability.",
          semantic_tags: ["proxy_leakage"],
          availability: "post-decision",
        },
        {
          name: "antibiotic_escalation_after_suspicion",
          description:
            "Escalation to broader-spectrum antibiotics after sepsis concern was raised.",
          semantic_tags: ["proxy_leakage", "time_leakage"],
          availability: "post-decision",
        },
        {
          name: "full_stay_max_lactate",
          description:
            "Maximum lactate observed over the full hospitalization, not just before the cutoff.",
          semantic_tags: ["time_leakage", "aggregation_lookahead"],
          availability: "derived",
        },
        {
          name: "icu_transfer_order",
          description:
            "Order placed for ICU transfer after patient decline was recognized.",
          semantic_tags: ["proxy_leakage"],
          availability: "post-decision",
        },
      ],
      pipeline_notes:
        "Encounter-random split rather than patient-grouped temporal validation. Some operational response variables remain in the feature list. Timestamp granularity is coarse for certain order events.",
      model_artifacts_optional:
        "Optional model card says the score updates every 15 minutes but does not fully document feature availability.",
      optional_uploads: [
        "synthetic-sepsis-audit-demo.csv",
        "clinical_feature_dictionary.json",
        "model_card.md",
      ],
    },
    expected_findings: [
      "Operational response variables look like downstream proxies rather than early-warning signals.",
      "full_stay_max_lactate uses information from after the prediction cutoff.",
      "The split design risks leakage across repeated patients and time.",
    ],
    prompt_starters: [
      "Why is this demo careful about not making clinical claims?",
      "Which findings are most likely to require human review?",
      "How would you clean this feature set before deployment?",
    ],
    signal_templates: [
      {
        object_name: "full_stay_max_lactate",
        title: "A full-stay summary is leaking future physiology",
        macro_bucket: "Time leakage",
        fine_grained_type: "aggregation_lookahead",
        severity: "high",
        confidence: "high",
        match_keywords: ["full_stay_max_lactate", "full hospitalization", "not just before the cutoff"],
        match_scope: "feature",
        evidence: [
          "The feature is explicitly defined over the full hospitalization.",
          "That means the score can access measurements recorded after the claimed decision point.",
        ],
        why_it_matters:
          "An early-warning model becomes untrustworthy if it can peek at what happened later in the stay.",
        fix_recommendation: [
          "Recompute lab summaries using only measurements available before the prediction cutoff.",
          "Add explicit feature-availability metadata for each derived field.",
        ],
      },
      {
        object_name: "rapid_response_team_called",
        title: "Clinical response signals are being treated as predictive features",
        macro_bucket: "Feature / proxy leakage",
        fine_grained_type: "proxy",
        severity: "critical",
        confidence: "medium",
        match_keywords: [
          "rapid_response_team_called",
          "noticed instability",
          "after sepsis concern",
        ],
        match_scope: "feature",
        evidence: [
          "The feature describes a clinician response to patient decline rather than a pre-event physiologic signal.",
          "Operational actions often happen because deterioration is already suspected.",
        ],
        why_it_matters:
          "The model may be encoding clinician recognition instead of detecting risk early enough to help.",
        fix_recommendation: [
          "Remove downstream operational response variables from the training set.",
          "Review event timestamps manually if the order/action timing is coarse.",
        ],
        needs_human_review: true,
      },
      {
        object_name: "antibiotic_escalation_after_suspicion",
        title: "Post-suspicion treatment escalation is crossing the target boundary",
        macro_bucket: "Feature / proxy leakage",
        fine_grained_type: "boundary",
        severity: "high",
        confidence: "medium",
        match_keywords: [
          "antibiotic_escalation_after_suspicion",
          "after sepsis concern",
          "broader-spectrum antibiotics",
        ],
        match_scope: "feature",
        evidence: [
          "The feature is recorded after concern has already been raised.",
          "Treatment escalation is closer to an outcome response than to a baseline risk factor.",
        ],
        why_it_matters:
          "This inflates retrospective performance and weakens any claim that the model is alerting earlier than clinicians.",
        fix_recommendation: [
          "Exclude downstream treatment decisions from the feature set.",
          "Document the true prediction boundary in the model card.",
        ],
        needs_human_review: true,
      },
      {
        object_name: "patient split leakage",
        title: "Validation design allows patient or encounter leakage",
        macro_bucket: "Structure / pipeline leakage",
        fine_grained_type: "evaluation",
        severity: "high",
        confidence: "high",
        match_keywords: [
          "encounter-random split",
          "patient-grouped temporal validation",
          "coarse",
        ],
        match_scope: "pipeline",
        evidence: [
          "Pipeline notes say the validation is encounter-random instead of patient-grouped and time-aware.",
          "Repeated patients or late encounters can leak familiar patterns into the test set.",
        ],
        why_it_matters:
          "A validation score built on repeated-patient exposure can overstate true deployment performance.",
        fix_recommendation: [
          "Switch to patient-grouped, temporally ordered validation.",
          "Audit repeated encounters before reporting any live-readiness metrics.",
        ],
      },
    ],
  },
  {
    case_id: "credit-default",
    domain: "Finance",
    title: "Credit default / loan risk audit",
    story:
      "LeakGuard checks whether a credit-risk model is truly predicting future default or quietly smuggling in post-origination repayment behavior and repeated-borrower shortcuts. It gives a strong third case to prove that the same audit logic transfers across domains.",
    narrator_line:
      "This finance case rounds out the cross-domain story with a regulated workflow that maps cleanly to the same three judge-friendly buckets.",
    default_inputs: {
      dataset_ref: "credit-default-demo.csv",
      domain_template: "Finance",
      prediction_goal:
        "Predict whether a newly originated loan will default within 90 days.",
      target_column: "default_within_90_days",
      timestamp_fields: ["application_date", "origination_date", "chargeoff_date"],
      entity_keys: ["loan_id", "borrower_id"],
      feature_dictionary: [
        {
          name: "fico_at_application",
          description: "Borrower FICO score available at application time.",
          semantic_tags: ["clean_signal"],
          availability: "pre-decision",
        },
        {
          name: "debt_to_income",
          description: "Debt-to-income ratio at application time.",
          semantic_tags: ["clean_signal"],
          availability: "pre-decision",
        },
        {
          name: "delinquency_60d_after_origination",
          description:
            "Missed-payment behavior observed after the loan has already been funded.",
          semantic_tags: ["time_leakage"],
          availability: "post-decision",
        },
        {
          name: "collections_status",
          description:
            "Whether the account entered collections during servicing.",
          semantic_tags: ["proxy_leakage"],
          availability: "post-decision",
        },
        {
          name: "recovery_amount_30d",
          description:
            "Recovered amount after delinquency management begins.",
          semantic_tags: ["proxy_leakage"],
          availability: "post-decision",
        },
        {
          name: "portfolio_avg_default_rate_full_quarter",
          description:
            "Quarterly portfolio default average computed with the full quarter, including future observations.",
          semantic_tags: ["time_leakage", "aggregation_lookahead"],
          availability: "derived",
        },
      ],
      pipeline_notes:
        "Random split at the loan level even when borrowers have multiple accounts. Portfolio aggregates are recomputed globally each quarter using all rows. Collections features remain in the training matrix.",
      model_artifacts_optional:
        "Optional credit memo shows a random train/test split and feature list exported from a model notebook.",
      optional_uploads: [
        "credit-default-demo.csv",
        "loan_feature_dictionary.json",
        "model_memo.md",
      ],
    },
    expected_findings: [
      "Borrower behavior after origination is leaking into the label window.",
      "Collections and recovery signals act as downstream default proxies.",
      "Repeated borrowers are split across train and test.",
    ],
    prompt_starters: [
      "Why is collections_status not fair game here?",
      "How would you redesign the validation split?",
      "What should stay in the model if we want an underwriting-time score?",
    ],
    signal_templates: [
      {
        object_name: "delinquency_60d_after_origination",
        title: "Post-origination repayment behavior is leaking into underwriting",
        macro_bucket: "Time leakage",
        fine_grained_type: "temporal",
        severity: "high",
        confidence: "high",
        match_keywords: [
          "delinquency_60d_after_origination",
          "after the loan has already been funded",
        ],
        match_scope: "feature",
        evidence: [
          "The feature is only observed after origination.",
          "It belongs to the period the model is trying to predict, not the moment the decision is made.",
        ],
        why_it_matters:
          "The score will appear stronger than any real underwriting model because it uses future repayment behavior.",
        fix_recommendation: [
          "Restrict features to application-time or origination-time information.",
          "Separate underwriting models from servicing-stage risk models.",
        ],
      },
      {
        object_name: "collections_status",
        title: "Servicing and collections signals are acting as outcome proxies",
        macro_bucket: "Feature / proxy leakage",
        fine_grained_type: "proxy",
        severity: "critical",
        confidence: "high",
        match_keywords: ["collections_status", "entered collections", "servicing"],
        match_scope: "feature",
        evidence: [
          "Collections status exists because repayment problems have already emerged.",
          "It is a downstream operational response to the default process.",
        ],
        why_it_matters:
          "A high score here reflects post-default handling rather than genuine credit selection quality.",
        fix_recommendation: [
          "Remove collections and recovery fields from underwriting-time models.",
          "Document which stage of the loan lifecycle each feature belongs to.",
        ],
      },
      {
        object_name: "borrower split leakage",
        title: "Borrowers with multiple loans are split across train and test",
        macro_bucket: "Structure / pipeline leakage",
        fine_grained_type: "join_entity",
        severity: "high",
        confidence: "high",
        match_keywords: [
          "random split",
          "borrowers have multiple accounts",
          "loan level",
        ],
        match_scope: "pipeline",
        evidence: [
          "Pipeline notes say the split is random at the loan level.",
          "A single borrower can appear in both train and test through multiple accounts.",
        ],
        why_it_matters:
          "The model can memorize borrower-level behavior and overstate how well it generalizes to new applications.",
        fix_recommendation: [
          "Group validation by borrower_id.",
          "Recompute global portfolio features inside each training fold only.",
        ],
      },
      {
        object_name: "portfolio_avg_default_rate_full_quarter",
        title: "Quarterly portfolio averages are using future outcomes",
        macro_bucket: "Time leakage",
        fine_grained_type: "aggregation_lookahead",
        severity: "medium",
        confidence: "high",
        match_keywords: [
          "portfolio_avg_default_rate_full_quarter",
          "full quarter",
          "recomputed globally",
        ],
        match_scope: "feature",
        evidence: [
          "The feature uses the full quarter rather than the value available at application time.",
          "That lets later defaults leak backward into earlier predictions.",
        ],
        why_it_matters:
          "Even subtle portfolio aggregates can distort validation if they are not aligned to the decision timestamp.",
        fix_recommendation: [
          "Lag portfolio aggregates so they only use historical quarters.",
          "Materialize time-aware aggregates before splitting and training.",
        ],
      },
    ],
  },
];
