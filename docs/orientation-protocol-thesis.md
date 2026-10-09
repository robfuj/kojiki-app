**Orientation Protocol Thesis — Research-First Goal Clarification**

---

## Core Thesis

> **Don't ask template questions. Ask questions that only the user can answer, generated from live research on their specific goal.**

The protocol exists because **a goal statement is never complete** — it carries hidden assumptions about market, regulation, competition, and risk that only targeted research can surface. The user's answers to *research-driven* follow-ups produce a `refined_goal` with measurable confidence.

---

## 5-Phase Flow (Local Implementation)

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: CLARIFYING QUESTIONS (3-4)                            │
│  ─────────────────────────────────────────────────────────────  │
│  Input: Raw goal + industry                                     │
│  Method: Keyword-based question templates                       │
│  Output: User answers (structured)                              │
│                                                                 │
│  Example: "Build Kyarapu-style storytelling app"               │
│  → Q1: "Launch geography?" (market)                            │
│  → Q2: "B2C or B2B?" (business model)                          │
│  → Q3: "Revenue threshold for FY27 success?" (metrics)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: LIVE RESEARCH (parallel, per answer)                  │
│  ─────────────────────────────────────────────────────────────  │
│  For EACH answer → 4 research tracks:                           │
│  • Market: TAM, growth, forces                                  │
│  • Competition: Feature matrix, pricing, traction               │
│  • Regulation: Applicable laws, compliance, licensing           │
│  • Risk: Technical, market, regulatory derailers                │
│                                                                 │
│  Tool: Perplexity/Sonar web search with citations              │
│  Output: ResearchBrief (cited, structured)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: CONTEXTUAL FOLLOW-UPS (3-4) — KEY DIFFERENTIATOR      │
│  ─────────────────────────────────────────────────────────────  │
│  Input: ResearchBrief + user's clarifying answers               │
│  Method: Generate questions FROM findings, not templates        │
│                                                                 │
│  Algorithm:                                                       │
│  1. Extract key findings (metrics, risks, regulations)         │
│  2. For each finding → generate decision-forcing question      │
│  3. Prioritize by impact × uncertainty                          │
│  4. Deduplicate, limit to 3-4                                   │
│                                                                 │
│  Example from research:                                          │
│  Finding: "Interactive storytelling apps in NA: 40% D7         │
│  retention, $0.50 ARPU"                                         │
│  → Follow-up: "Given $0.50 ARPU benchmark, what ARPU           │
│  target makes your model viable?"                               │
│                                                                 │
│  Finding: "Apple rejects 'gambling mechanics' — time           │
│  pressure may trigger this"                                     │
│  → Follow-up: "How will you structure time pressure to         │
│  avoid App Store gambling classification?"                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 4: OPTIONAL RE-RESEARCH (1 loop max)                     │
│  ─────────────────────────────────────────────────────────────  │
│  If follow-up answers reveal new gaps → targeted research      │
│  Only on specific new questions, not full re-run                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 5: REFINED GOAL OUTPUT                                   │
│  ─────────────────────────────────────────────────────────────  │
│  {                                                               │
│    refined_goal: "Launch subscription-first interactive         │
│      storytelling app in North America targeting 10,000         │
│      paying users by FY27 Q2 with $5 ARPU, using exclusive      │
│      author IP partnerships to differentiate from free         │
│      alternatives, while structuring time-pressure mechanics   │
│      to comply with App Store guidelines.",                     │
│    confidence: 0.85,                                            │
│    phases_completed: ["clarifying","research","followups",     │
│      "re-research"],                                            │
│    evidence_bundle: {...},                                      │
│    timestamp: "2026-09-21T12:00:00Z"                            │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Vercel Repo Current State (3-Phase)

`lib/orientation/*` has:
1. **Clarify** — Questions from goal
2. **Research** — Web search (Perplexity)
3. **Intake** — Project-specific roster + clarifying questions

**Missing**: Phases 3-4 (contextual follow-ups generated FROM research, re-research loop)

---

## Why This Beats Template-Based Approaches

| Template Questions | Research-Driven Follow-ups |
|-------------------|---------------------------|
| "What's your budget?" | "Given $0.50 ARPU benchmark and $2.50 CAC, what payback period makes unit economics work?" |
| "Who are competitors?" | "Competitor X uses IP licensing + subscription hybrid. Will you pursue publisher partnerships or original IP?" |
| "Any regulations?" | "COPPA applies if users <13. Your time-pressure mechanic may trigger gambling review. How will you structure it?" |

**The user learns about their own problem while answering.**

---

## Integration Point

Output feeds directly into **SACCADE Framing** (Phase 2 of orchestration):
- `refined_goal` → `problem_id` (P-XXXXXXXXXX)
- `evidence_bundle` → EVIDENCE stage
- `confidence` → gates approval threshold

---

## Key Implementation Detail (Local)

```python
# engine/kojiki_core/orientation_protocol.py

def generate_contextual_followups(research_brief: ResearchBrief, 
                                   clarifying_answers: List[Answer]) -> List[FollowupQuestion]:
    # 1. Extract findings with citations
    findings = extract_key_findings(research_brief)
    
    # 2. For each finding, generate a question that forces a decision
    questions = []
    for finding in findings:
        q = generate_decision_question(finding, clarifying_answers)
        if q:
            questions.append(q)
    
    # 3. Prioritize by impact × uncertainty
    questions.sort(key=lambda q: q.impact * q.uncertainty, reverse=True)
    
    # 4. Deduplicate, limit
    return deduplicate(questions)[:4]
```

---

**The thesis**: Orientation is not a questionnaire — it's a **research collaboration** where the system discovers what it doesn't know, researches it, then asks the user only the decisions that research cannot make.