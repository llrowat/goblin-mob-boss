# Planning Questions Feature — Design Plan

## Problem

During ideation, Claude runs non-interactively (`--print` mode) and is told "no questions, just explore and plan." This means Claude must make assumptions when it encounters ambiguity — which architecture pattern to use, what the user's preferences are, how to handle edge cases, etc. The resulting plan may not match what the user actually wants, leading to revision cycles via the existing "Request Changes" button.

## Proposed Solution

Allow Claude to **pause planning to ask clarifying questions**, which the user answers in the UI before planning resumes with those answers as context.

### File-Based Protocol

Fits the existing pattern: Claude writes files to `.gmb/features/<id>/`, frontend polls for them.

```
.gmb/features/<feature_id>/
├── system-prompt.md
├── user-prompt.md
├── questions.json          ← NEW: Claude writes questions here
├── answers.json            ← NEW: App writes user answers here
└── tasks/
    └── plan.json
```

### Flow

```
1. User creates feature, ideation starts (same as today)
2. Claude explores codebase, encounters ambiguity
3. Claude writes questions.json instead of (or before) plan.json
4. Claude process exits (still non-interactive --print mode)
5. Frontend detects questions.json via polling (same 3s interval)
6. UI transitions to "questions" state — renders questions with input fields
7. User answers questions, clicks "Submit Answers"
8. Backend writes answers.json to the feature directory
9. Backend spawns a NEW ideation process with answers included in prompt
10. Claude reads prior context + answers, continues planning
11. Claude may ask MORE questions (repeat from step 3) or write plan.json
12. Frontend detects plan.json → shows plan (same as today)
```

### Why Two-Phase (Not Interactive)

The current architecture runs Claude in `--print` mode (fire-and-forget background process). Making it interactive would require a PTY session during ideation, which is a much larger change. The two-phase approach fits naturally:
- Reuses the existing `spawn_ideation_process()` → poll → detect output pattern
- Similar to how `reviseIdeation()` already works (re-run with extra context)
- Each round is a clean process — no long-lived process management needed

---

## Data Model Changes

### `questions.json` Format
```json
{
  "questions": [
    {
      "id": "q1",
      "question": "Should the dark mode preference persist across sessions?",
      "context": "I found existing localStorage usage in settings, but there's also a backend preferences store.",
      "options": ["LocalStorage only", "Backend preferences store", "Both with sync"],
      "type": "single_choice"
    },
    {
      "id": "q2",
      "question": "Which components should support theming?",
      "context": "There are 12 components. Some are internal-only.",
      "options": ["All components", "Only public-facing components"],
      "type": "single_choice"
    },
    {
      "id": "q3",
      "question": "Any specific color palette or design system to follow?",
      "type": "free_text"
    }
  ]
}
```

### `answers.json` Format
```json
{
  "answers": [
    {
      "id": "q1",
      "question": "Should the dark mode preference persist across sessions?",
      "answer": "Backend preferences store"
    },
    {
      "id": "q2",
      "question": "Which components should support theming?",
      "answer": "All components"
    },
    {
      "id": "q3",
      "question": "Any specific color palette or design system to follow?",
      "answer": "Use the existing Tailwind dark: variants, match the current brand colors"
    }
  ]
}
```

### Rust Models (models.rs)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanningQuestion {
    pub id: String,
    pub question: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<String>>,
    #[serde(rename = "type")]
    pub question_type: QuestionType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuestionType {
    SingleChoice,
    FreeText,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanningAnswer {
    pub id: String,
    pub question: String,
    pub answer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionsFile {
    pub questions: Vec<PlanningQuestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnswersFile {
    pub answers: Vec<PlanningAnswer>,
}
```

### TypeScript Types (frontend/types/index.ts)

```typescript
interface PlanningQuestion {
  id: string;
  question: string;
  context?: string;
  options?: string[];
  type: 'single_choice' | 'free_text';
}

interface PlanningAnswer {
  id: string;
  question: string;
  answer: string;
}
```

---

## Backend Changes

### New Commands (commands.rs)

**`poll_planning_questions(feature_id)`**
- Reads `.gmb/features/<id>/questions.json`
- Returns `Option<Vec<PlanningQuestion>>`
- Called by frontend on the same polling interval as plan.json
- Returns `None` if file doesn't exist (Claude hasn't asked questions yet)

**`submit_planning_answers(feature_id, answers: Vec<PlanningAnswer>)`**
- Writes `answers.json` to `.gmb/features/<id>/`
- Deletes `questions.json` (consumed)
- Spawns a new ideation process with answers included in prompt
- Similar to `revise_ideation()` but structured around Q&A

### Modified: `poll_ideation_result()`
- Add a new field to the return type indicating whether questions are pending
- Or: keep separate polling (simpler, less coupling)

**Decision: Use unified polling.** Modify `poll_ideation_result` to return an enum-like result:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdeationPollResult {
    // Existing — populated when plan.json is found
    pub tasks: Option<Vec<TaskSpec>>,
    pub execution_mode: Option<ExecutionRecommendation>,
    // New — populated when questions.json is found
    pub questions: Option<Vec<PlanningQuestion>>,
}
```

This way the frontend only needs one polling loop. If `questions` is `Some`, show the questions UI. If `tasks` is `Some`, show the plan UI. If both are `None`, still waiting.

### Modified: Prompt (prompts.rs)

Update `ideation_user_prompt()` to:
1. Remove "no questions" language
2. Add instructions for writing `questions.json` when Claude needs clarification
3. Include format specification for questions.json
4. When answers exist from a prior round, include them in the prompt

New function: `ideation_user_prompt_with_answers(description, tasks_dir, available_agents, prior_answers: Vec<PlanningAnswer>)`
- Includes the original prompt
- Appends: "The user has answered your previous questions:" + formatted answers
- Instructs Claude to proceed to plan.json (or ask follow-up questions if truly needed)

---

## Frontend Changes

### FeatureDetailPage State Machine

Current states: `idle → running → done/error`

New states: `idle → running → questions → running → (questions →  running →)* done/error`

Add new state: `"questions"` — displayed when polling detects questions.json.

### Questions UI Component

New component: `PlanningQuestions` (in `frontend/pages/FeatureDetailPage/` or `frontend/components/`)

- Renders each question with:
  - Question text (prominent)
  - Context text (subtle, below question)
  - For `single_choice`: radio buttons for options + optional "Other" free text
  - For `free_text`: textarea input
- "Submit Answers" button at bottom
- On submit: calls `tauri.submitPlanningAnswers(featureId, answers)`
- Transitions state back to `"running"`

### Polling Changes

Modify the polling in FeatureDetailPage to check the unified `IdeationPollResult`:
- If `result.questions` is present → set state to `"questions"`, display questions
- If `result.tasks` is present → set state to `"done"`, display plan (existing behavior)

### Answer History (Required)

Show all previously answered questions in the UI so the user always sees the full Q&A context that Claude is working with. Display as a visible section (not collapsed) above the current questions or plan. Each round of Q&A is shown chronologically — this gives the user confidence that Claude understood their answers and makes it easy to spot misunderstandings before the plan is finalized.

---

## Prompt Engineering

### Key Prompt Changes

The ideation prompt currently says:
> "You are in PLANNING MODE. This is non-interactive — you cannot ask questions."

Change to:
> "You are in PLANNING MODE. If you encounter important ambiguities or decisions that would significantly affect the plan, you may write a `questions.json` file to ask the user for clarification BEFORE writing `plan.json`. Only ask questions when the answer would materially change your approach — don't ask about things you can reasonably decide yourself."

Include the questions.json schema in the prompt so Claude knows the exact format.

### Guard Rails
- Instruct Claude to ask **at most 5 questions** per round
- Questions should be **high-impact** — things that genuinely change the plan direction
- Claude should provide `options` when there are clear alternatives (helps user decide faster)
- Claude should provide `context` explaining why this matters
- If no questions needed, go straight to plan.json (backwards compatible)
- **No cap on Q&A rounds** — let the conversation flow naturally; Claude will move to plan.json when it has enough clarity

---

## Implementation Order

1. **Models** — Add Rust + TS types for questions/answers
2. **Prompts** — Update ideation prompt to allow questions, add answer-aware variant
3. **Backend commands** — Modify `poll_ideation_result`, add `submit_planning_answers`
4. **Frontend polling** — Handle questions in the polling loop
5. **Frontend UI** — Build PlanningQuestions component
6. **Tests** — Unit tests for all new backend logic + frontend component tests
7. **README** — Update workflow documentation

---

## Resolved Decisions

1. **Question limit per round?** Max 5 questions per round to keep it focused.
2. **Max rounds of questions?** No cap — let it flow naturally. Claude moves to plan.json when it has enough clarity.
3. **Skip questions option?** TBD — could add a "Just plan it" button later if needed.
4. **Tone:** Questions only when truly needed — Claude should plan autonomously by default and only ask when the answer would materially change the approach.
5. **Answer visibility:** All prior Q&A context is always visible in the UI, not collapsed.
