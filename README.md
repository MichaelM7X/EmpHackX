# Olarion — ML Pipeline Data Leakage Auditor Agent

An audit agent that detects data leakage in machine learning pipelines before models go to production. Built for EmpireHacks 2026 (Track 2: The Auditor).

---

## The Problem

Data leakage occurs when information from outside the prediction boundary—future data, downstream proxies, or repeated entities—flows into training features. The result is models that look strong offline and collapse in production. The Epic Sepsis Model, deployed at hundreds of US hospitals with a claimed AUC of 0.76–0.83, was externally validated at 0.63 (Wong et al., JAMA Internal Medicine, 2021). One contributing factor: antibiotic orders, a feature that leaked the outcome. Olarion is the tool that would have caught this before deployment.

---

## What Olarion Detects

| Type | Example |
|------|---------|
| **Target Proxy Leakage** | Using `days_on_market` to predict whether a listing rents in 7 days — the feature is causally downstream of the label. |
| **Temporal Look-ahead** | Computing neighborhood average rent with full-year data when predicting January listings — future information leaks in. |
| **Structural / Group Leakage** | Random split placing the same `building_id` or `patient_id` in both train and test — entity-level leakage. |

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 1 (Fixed Pipeline)                                               │
│  ───────────────────────                                                │
│  Rule-based: pipeline scan, metadata check, structural check            │
│  LLM-powered: proxy detector, temporal detector, code auditor           │
│  Optional: model training code auditor (if user provides training code) │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 2 (Review Agent)                                                  │
│  ─────────────────────                                                  │
│  OpenAI Function Calling: cross_check_feature, deep_dive_feature,       │
│  check_feature_interaction, finalize_review. Max 3 rounds.               │
│  If Review Agent fails → Phase 1 results still returned (fail-safe).    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 3                                                                 │
│  ───────                                                                │
│  Aggregate findings, compute risk level, generate executive summary     │
│  + full narrative report via LLM                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## User Input / Output

**Input (required):** prediction task description, CSV dataset (header read for column names), preprocessing code (.py or .ipynb).  
**Input (optional):** model training code.

**Output:**
- Overall risk badge (CRITICAL / HIGH / MEDIUM / LOW)
- Executive summary (3–5 bullet points)
- Full narrative audit report (expandable)
- Structured findings with evidence citations — each citation traces to source (code line numbers, CSV columns, or LLM reasoning). Citations are clickable and expand to show the original code snippet or column list.
- Interactive chat panel for follow-up questions about the audit

---

## Tech Stack

- **Frontend:** React, Vite, Tailwind CSS
- **Backend:** Express (TypeScript)
- **LLM:** OpenAI GPT-4o
- **Storage:** None — stateless API

---

## Getting Started

```bash
git clone <repo-url>
cd EmpHackX
npm install
```

Create `.env` in the project root:

```
OPENAI_API_KEY=sk-your-key-here
PORT=3001
```

Start both frontend and backend:

```bash
npm run dev:full
```

Then open the frontend URL printed in the terminal — by default **`http://localhost:5173`** (set in `vite.config.ts`). If that port is already in use, Vite may pick the next free port; use whatever URL the dev server logs.

Or run them separately:
- `npm run dev` — frontend (Vite; default port **5173** in this repo)
- `npm run server` — backend (Express, port 3001)

---

## Demo Cases (`test dataset/`)

Each folder under **`test dataset/`** is a self-contained audit bundle:

| Files | Purpose |
|--------|---------|
| **`*.zip`** | `dataset.csv` + `preprocessing_code.py` — upload/extract for the app |
| **`Prediction task description.txt`** | Paste into the prediction-task field |
| **`Target column name.txt`** | Single line: binary target column name |

Below matches what those zips actually contain (synthetic data for demos only).

### `finance-leaky` / `finance-clean`

- **Task:** Predict loan default from financial profile and credit history.  
- **Target:** `loan_defaulted`

| Variant | CSV / pipeline highlights |
|--------|---------------------------|
| **finance-leaky** | Adds post-origination-style fields (`collection_recovery_fee`, `last_payment_amount`, `total_late_fees`), `avg_applicant_default_rate` from `groupby(applicant_id)` on the label, **StandardScaler fit on full data before split**, random `train_test_split` (same applicant can straddle train/test). |
| **finance-clean** | Features limited to pre-origination-style inputs (e.g. income, credit score, loan amount, DTI, accounts, savings, expenses). **GroupKFold** on `applicant_id`, scaler **fit on train folds only**. |

### `legal-leaky` / `legal-clean`

- **Task:** Predict whether a defendant is found guilty in a criminal case.  
- **Target:** `found_guilty`

| Variant | CSV / pipeline highlights |
|--------|---------------------------|
| **legal-leaky** | Includes outcome-adjacent fields (`sentence_length_months`, `appeal_filed`, `judge_leniency_score`), `avg_defendant_guilt_rate` from a label-based `groupby` transform, global scaling before split, random split (no grouping by `case_id`). |
| **legal-clean** | Pretrial-style features only (`evidence_strength_score`, `pretrial_detention_days`, etc.). **GroupKFold** on `case_id`, scaler fit on training data only. |

### `health-leaky` / `health-clean`

- **Task:** Predict `sepsis_within_24h` from early ED-era information only (as stated in the task txt).  
- **Target:** `sepsis_within_24h`

| Variant | CSV / pipeline highlights |
|--------|---------------------------|
| **health-leaky** | Adds stay-wide / operational proxies: `lactate_peak_encounter`, `broad_spectrum_abx_within_6h`, `icu_transfer_24h`, `sepsis_icd_documented_discharge`, plus `avg_ward_sepsis_rate` from `groupby(ward_id)` on the label; global scaler + random split (patient can repeat across train/test). |
| **health-clean** | Only early vitals and first-window labs (`map_triage`, RR/HR/temp, `wbc_first_4h`, `lactate_first_4h`). **GroupShuffleSplit** grouped by `patient_mrn`, scaler fit on train then transform test. |

### `leaky-demo` / `clean-demo`

- **leaky-demo — hospital readmission:** Target `readmitted_30d`. Includes `post_discharge_er_visit`, `readmission_flag`, `total_charges`, `avg_patient_readmit_rate` (label leakage via `groupby(patient_id)`), global scaler, random split ignoring `patient_id`.  
- **clean-demo — student exam pass:** Target `passed_final_exam`. Tabular student features only. **GroupKFold** on `student_id`, scaler fit on train only.

> **Landing-page presets** may still use shorter NYC rental / sepsis narrative examples; use the folders above when you want demos that line up **exactly** with the committed zip + txt artifacts.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/audit` | Runs full audit pipeline, returns AuditReport JSON |
| POST | `/api/chat` | Multi-turn conversation about audit results |

---

## Team

*Team member names*

---

## Built For

**EmpireHacks 2026** — Track 2: The Auditor (Regulated Agents for Trust)
