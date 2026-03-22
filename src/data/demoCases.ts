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
      csv_columns: [
        "listing_id",
        "building_id",
        "landlord_id",
        "listing_date",
        "lease_signed_date",
        "bedrooms",
        "distance_to_subway",
        "days_on_market",
        "final_lease_price",
        "neighborhood_avg_rent",
        "broker_fee_flag",
        "leased_within_7_days",
      ],
      preprocessing_code: `import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

df = pd.read_csv("listings.csv")

# Compute neighborhood average rent using ALL data (including future months)
df["neighborhood_avg_rent"] = df.groupby("neighborhood")["rent"].transform("mean")

# Scale features globally before splitting
scaler = StandardScaler()
feature_cols = ["bedrooms", "distance_to_subway", "days_on_market",
                "final_lease_price", "neighborhood_avg_rent", "broker_fee_flag"]
df[feature_cols] = scaler.fit_transform(df[feature_cols])

X = df[feature_cols]
y = df["leased_within_7_days"]

# Random split — ignores building_id and landlord_id
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)`,
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
      csv_columns: [
        "patient_id",
        "encounter_id",
        "admission_time",
        "measurement_time",
        "outcome_time",
        "heart_rate_last_6h",
        "lactate_initial",
        "rapid_response_team_called",
        "antibiotic_escalation_after_suspicion",
        "full_stay_max_lactate",
        "icu_transfer_order",
        "deterioration_within_12h",
      ],
      preprocessing_code: `import pandas as pd
from sklearn.model_selection import train_test_split

df = pd.read_csv("sepsis_encounters.csv")

feature_cols = ["heart_rate_last_6h", "lactate_initial",
                "rapid_response_team_called", "antibiotic_escalation_after_suspicion",
                "full_stay_max_lactate", "icu_transfer_order"]

X = df[feature_cols]
y = df["deterioration_within_12h"]

# Encounter-random split rather than patient-grouped temporal validation
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)`,
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
      csv_columns: [
        "loan_id",
        "borrower_id",
        "application_date",
        "origination_date",
        "chargeoff_date",
        "fico_at_application",
        "debt_to_income",
        "delinquency_60d_after_origination",
        "collections_status",
        "recovery_amount_30d",
        "portfolio_avg_default_rate_full_quarter",
        "default_within_90_days",
      ],
      preprocessing_code: `import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

df = pd.read_csv("loans.csv")

# Compute portfolio default rate using ALL rows (including future observations)
df["portfolio_avg_default_rate_full_quarter"] = df.groupby("quarter")["default_within_90_days"].transform("mean")

le = LabelEncoder()
df["collections_status"] = le.fit_transform(df["collections_status"])

feature_cols = ["fico_at_application", "debt_to_income",
                "delinquency_60d_after_origination", "collections_status",
                "recovery_amount_30d", "portfolio_avg_default_rate_full_quarter"]

X = df[feature_cols]
y = df["default_within_90_days"]

# Random split at the loan level even when borrowers have multiple accounts
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)`,
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
  {
    case_id: "ecommerce-return",
    domain: "E-commerce",
    title: "⚠️ Bad Case: Customer return prediction",
    story:
      "An e-commerce team built a model to predict whether a customer will return a product within 7 days of purchase. The model scored 97% AUC in offline testing and completely collapsed in production. LeakGuard reveals why: the preprocessing code leaks the answer through three separate channels simultaneously.",
    narrator_line:
      "This is the deliberately broken showcase case — all three leakage types fire at once. Perfect for demonstrating why 97% offline AUC should raise suspicion, not confidence.",
    default_inputs: {
      prediction_goal:
        "Predict whether a customer will return a purchased product within 7 days of the order date.",
      target_column: "returned_within_7_days",
      csv_columns: [
        "order_id",
        "customer_id",
        "order_date",
        "return_requested_date",
        "product_category",
        "cart_value",
        "discount_pct",
        "days_since_last_purchase",
        "support_ticket_opened_within_3d",
        "refund_amount_received",
        "avg_customer_return_rate_all_orders",
        "return_reason_code",
        "returned_within_7_days",
      ],
      preprocessing_code: `import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder

df = pd.read_csv("orders.csv")

# [BUG 1 - TIME LEAKAGE] Compute each customer's return rate using ALL their orders,
# including orders placed after this one.
df["avg_customer_return_rate_all_orders"] = (
    df.groupby("customer_id")["returned_within_7_days"].transform("mean")
)

# [BUG 2 - PROXY LEAKAGE] refund_amount_received is only non-zero when a return
# was processed — it directly encodes the outcome.
# return_reason_code is filled in by the warehouse only after a return is confirmed.
feature_cols = [
    "cart_value", "discount_pct", "days_since_last_purchase",
    "support_ticket_opened_within_3d",
    "refund_amount_received",           # post-return signal
    "avg_customer_return_rate_all_orders",
    "return_reason_code",               # filled after return confirmed
]

le = LabelEncoder()
df["return_reason_code"] = le.fit_transform(df["return_reason_code"].fillna("none"))

# [BUG 3 - STRUCTURE LEAKAGE] Fit scaler on ALL data before splitting.
# Same customer can appear in both train and test.
scaler = StandardScaler()
df[["cart_value", "discount_pct", "days_since_last_purchase"]] = scaler.fit_transform(
    df[["cart_value", "discount_pct", "days_since_last_purchase"]]
)

X = df[feature_cols]
y = df["returned_within_7_days"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)`,
      model_training_code: `from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import roc_auc_score

model = GradientBoostingClassifier(n_estimators=200, max_depth=5, random_state=42)
model.fit(X_train, y_train)

y_pred_proba = model.predict_proba(X_test)[:, 1]
auc = roc_auc_score(y_test, y_pred_proba)
print(f"AUC: {auc:.4f}")  # prints ~0.97 — suspiciously high`,
    },
    expected_findings: [
      "refund_amount_received directly encodes the return outcome — pure label leakage.",
      "return_reason_code is filled post-return and is unavailable at prediction time.",
      "avg_customer_return_rate_all_orders uses future orders to compute a per-customer rate.",
      "StandardScaler is fit on the full dataset before the train/test split.",
      "Same customer_id can appear in both train and test sets.",
    ],
    prompt_starters: [
      "Why did this model get 97% AUC but fail in production?",
      "Which single feature is the worst offender?",
      "What features are actually safe to keep?",
    ],
  },
];
