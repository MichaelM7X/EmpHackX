import { AuditRequest } from "../types";

export interface DemoCase {
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
}

export const demoCases: DemoCase[] = [
  {
    case_id: "nyc-rental",
    domain: "Housing",
    title: "NYC rental prediction",
    story:
      "We are New York students trying to predict listing rent and whether an apartment will be leased within 7 days. The flashy model looks amazing offline, but LeakGuard checks whether the model is learning pricing signals or quietly cheating with future information and repeated-building shortcuts.",
    narrator_line:
      "This is the main 2-minute walkthrough: a relatable housing dataset where time leakage, proxy leakage, and structure leakage all show up naturally.",
    default_inputs: {
      prediction_goal:
        "Predict monthly rent and whether a rental listing will be leased within 7 days.",
      target_column: "leased_within_7_days",
      prediction_time_point: "The moment a listing goes live on the platform",
      timestamp_fields: ["listing_date", "lease_signed_date"],
      entity_keys: ["listing_id", "building_id", "landlord_id"],
      feature_dictionary: [
        {
          name: "bedrooms",
          description: "Bedroom count visible when the listing goes live.",
        },
        {
          name: "distance_to_subway",
          description: "Nearest subway stop distance at listing time.",
        },
        {
          name: "days_on_market",
          description:
            "Number of days the listing stayed active before it was rented.",
        },
        {
          name: "final_lease_price",
          description:
            "Final signed price after negotiation, recorded after the deal closes.",
        },
        {
          name: "neighborhood_avg_rent",
          description:
            "Neighborhood average rent computed over the full dataset, including future months.",
        },
        {
          name: "broker_fee_flag",
          description: "Whether the unit had a broker fee at listing time.",
        },
      ],
      pipeline_notes:
        "Random split across listings. Multiple units from the same building and landlord appear in both train and test. Neighborhood average rent was computed with all available months, not just data available at listing time.",
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
      prediction_goal:
        "Audit a model that predicts sepsis or clinical deterioration within the next 12 hours.",
      target_column: "deterioration_within_12h",
      prediction_time_point:
        "The moment the model scores a patient (every 15 minutes during hospitalization)",
      timestamp_fields: ["admission_time", "measurement_time", "outcome_time"],
      entity_keys: ["patient_id", "encounter_id"],
      feature_dictionary: [
        {
          name: "heart_rate_last_6h",
          description: "Rolling heart-rate summary from the first 6 hours.",
        },
        {
          name: "lactate_initial",
          description: "Initial lactate value collected early in the stay.",
        },
        {
          name: "rapid_response_team_called",
          description:
            "Whether a rapid response team was called after clinicians noticed instability.",
        },
        {
          name: "antibiotic_escalation_after_suspicion",
          description:
            "Escalation to broader-spectrum antibiotics after sepsis concern was raised.",
        },
        {
          name: "full_stay_max_lactate",
          description:
            "Maximum lactate observed over the full hospitalization, not just before the cutoff.",
        },
        {
          name: "icu_transfer_order",
          description:
            "Order placed for ICU transfer after patient decline was recognized.",
        },
      ],
      pipeline_notes:
        "Encounter-random split rather than patient-grouped temporal validation. Some operational response variables remain in the feature list. Timestamp granularity is coarse for certain order events.",
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
      prediction_goal:
        "Predict whether a newly originated loan will default within 90 days.",
      target_column: "default_within_90_days",
      prediction_time_point:
        "The moment the loan is originated (funded and disbursed)",
      timestamp_fields: [
        "application_date",
        "origination_date",
        "chargeoff_date",
      ],
      entity_keys: ["loan_id", "borrower_id"],
      feature_dictionary: [
        {
          name: "fico_at_application",
          description: "Borrower FICO score available at application time.",
        },
        {
          name: "debt_to_income",
          description: "Debt-to-income ratio at application time.",
        },
        {
          name: "delinquency_60d_after_origination",
          description:
            "Missed-payment behavior observed after the loan has already been funded.",
        },
        {
          name: "collections_status",
          description:
            "Whether the account entered collections during servicing.",
        },
        {
          name: "recovery_amount_30d",
          description:
            "Recovered amount after delinquency management begins.",
        },
        {
          name: "portfolio_avg_default_rate_full_quarter",
          description:
            "Quarterly portfolio default average computed with the full quarter, including future observations.",
        },
      ],
      pipeline_notes:
        "Random split at the loan level even when borrowers have multiple accounts. Portfolio aggregates are recomputed globally each quarter using all rows. Collections features remain in the training matrix.",
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
  },
];
