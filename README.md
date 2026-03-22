# Clarion — ML Pipeline Data Leakage Auditor Agent

An audit agent that detects data leakage in machine learning pipelines before models go to production. Built for EmpireHacks 2026 (Track 2: The Auditor).

---

## The Problem

Data leakage occurs when information from outside the prediction boundary—future data, downstream proxies, or repeated entities—flows into training features. The result is models that look strong offline and collapse in production. The Epic Sepsis Model, deployed at hundreds of US hospitals with a claimed AUC of 0.76–0.83, was externally validated at 0.63 (Wong et al., JAMA Internal Medicine, 2021). One contributing factor: antibiotic orders, a feature that leaked the outcome. Clarion is the tool that would have caught this before deployment.

---

## What Clarion Detects

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

Then open http://localhost:5173.

Or run them separately:
- `npm run dev` — frontend (Vite, port 5173)
- `npm run server` — backend (Express, port 3001)

---

## Demo Cases

Pre-built demos are available from the landing page:

- **NYC rental prediction** — temporal leakage (`neighborhood_avg_rent`), proxy leakage (`days_on_market`, `final_lease_price`), structural leakage (`building_id`, `landlord_id` across splits)
- **Credit default audit** — post-origination features, portfolio averages, repeated borrowers
- **Sepsis early-warning audit** — inspired by the Epic Sepsis validation story; operational response variables and full-stay summaries
- **E-commerce return prediction** — deliberately broken showcase with all three leakage types firing at once

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
