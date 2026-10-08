# StackPeak — Supplement Intelligence

> Know exactly what your supplements do together — and what to watch out for.

StackPeak is a full-stack supplement interaction analysis platform. Users input their supplement stack, and the app runs it against a proprietary rule engine of 556 clinically-referenced pairwise interaction rules, surfaces conflicts, cautions, synergies, and timing guidance, then generates AI-powered insights via the Groq API.

Live: [web-production-65084.up.railway.app](https://web-production-65084.up.railway.app)

---

## What it does

- **Interaction analysis** — detects conflicts, cautions, and synergies across any combination of 173 supplements using 556 pairwise rules with PubMed citations
- **Domain stacking detection** — flags when multiple supplements push the same physiological system (e.g. sedation, liver load, blood pressure) beyond a safe threshold — a novel approach not present in any existing supplement database
- **AI insights** — synthesises rule engine output into structured, actionable plain-English guidance via Groq's Llama 3.1 API
- **Barcode scanning** — looks up supplement products via Open Food Facts and UPC Item Database APIs and maps ingredients to canonical names
- **My Stack** — localStorage-based saved stack that persists between sessions
- **Analytics** — server-side logging of every analysis to Google Sheets via Apps Script webhook, with a live summary dashboard

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python, Flask, Gunicorn |
| Rule engine | Pandas, openpyxl (Excel-based rules database) |
| AI layer | Groq API (Llama 3.1 8B Instant) |
| Frontend | Vanilla JS, HTML5, CSS3 — single file, no framework |
| Barcode lookup | Open Food Facts API, UPC Item Database API |
| Analytics | Google Sheets via Apps Script webhook |
| Deployment | Railway (with environment variable injection) |
| Version control | GitHub |

---

## Architecture

```
User (browser)
    │
    ▼
index.html (vanilla JS SPA)
    │
    ▼
Flask backend (app.py)
    ├── /api/analyse    → rule engine → pandas lookup against 556-rule Excel DB
    ├── /api/insights   → Groq API (Llama 3.1) grounded in rule engine output
    ├── /api/barcode    → Open Food Facts + UPC Item DB
    ├── /api/feedback   → Google Sheets webhook
    └── /api/request    → ingredient request logging
```

The rule engine runs pairwise lookups across all ingredient combinations in the submitted stack, scores domain stacking across 5 physiological domains, and returns structured JSON consumed by the frontend.

---

## Running locally

**Requirements:** Python 3.10+, pip

```bash
git clone https://github.com/StackSafee/stacksafe.git
cd stacksafe
pip install flask flask-cors pandas openpyxl requests pillow
python app.py
```

Open `http://localhost:5000`

**Environment variables (for AI insights):**
```
GROQ_API_KEY=your_key_from_console.groq.com
```

---

## Database

The rules database (`Pairwise rules.xlsx`) contains 556 pairwise interaction rules across 173 ingredients, covering:

- Mineral absorption conflicts
- Fat-soluble vitamin antagonisms
- Bleeding risk combinations
- Serotonin/monoamine risks
- Stimulant/CNS stacking
- Blood sugar interactions
- Hormonal interactions
- Sports performance combinations
- Cognitive/nootropic stacking
- Gut health synergies
- Joint health combinations
- Immune synergies

Every rule includes a severity rating (High/Medium/Low), recommended spacing in minutes, a plain-English message, and a PubMed citation URL.

---

## Key design decisions

**No fine-tuning, no hallucination** — the AI layer is grounded entirely in the rule engine output. Groq only synthesises what the rule engine already found. This prevents the supplement interaction hallucinations common in general-purpose LLMs.

**Domain stacking as emergent risk detection** — pairwise rules catch known interactions. Domain stacking catches emergent risks that appear when three or four supplements push the same physiological system simultaneously — risks no pairwise database alone can surface.

**Single-file frontend** — the entire UI is one `index.html` file with no build step, no framework, and no dependencies beyond two barcode scanning libraries. Intentional: keeps deployment simple and load time fast on mobile.

---

## Author

Saleh Ghanem — [saleh@stackpeak.net](mailto:saleh@stackpeak.net)
