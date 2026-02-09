# backtalk-ai

Chatbot test runner with an LLM judge that learns from your feedback.

## Problem

Conversation tests are inherently non-deterministic — the same input can produce different valid responses. Traditional assertions break on fuzzy, subjective chatbot output. backtalk solves this with an LLM runner that steers conversations toward test scenarios while adapting to whatever the bot actually says, and an LLM judge that scores the result and improves from your feedback.

## How it works

0. **Describe your chatbot** - Provide its spec or paste its system prompt so the judge knows what "good" looks like
1. **Define test cases by example** - Provide reference conversations (good or bad examples)
2. **Runner replays conversations** - Chats with your bot following the example's intent, adapting to non-deterministic responses
3. **LLM judge scores** - After the full conversation, scores the bot on each metric (1-5) with reasoning
4. **You give feedback** - Thumbs up/down on judgments with optional comments
5. **Judge improves** - Feedback is stored and incorporated into the judge's prompt

## Metrics

The judge scores each test on two metrics (1-5):

- **`quality`** - How well did the bot handle the conversation? Was it helpful, accurate, on-brand?
- **`fidelity`** - How closely did the conversation track the reference? Did the bot cover the same ground?

Each metric has a configurable pass threshold. You can set a single threshold for all metrics or configure per-metric:

```yaml
# Single threshold for all metrics
threshold: 3

# Per-metric thresholds
threshold:
  quality: 4
  fidelity: 3
```

A test passes only if all metrics meet their thresholds.

## Key Concept: Determinism Dial

Controls how strictly the runner follows the reference conversation:

- `guided` - Follow the flow/intent, adapt wording to bot responses (default, recommended). **Flexible turn count** — the runner decides when the conversation is complete. It receives the full reference conversation and covers the same ground, but may take fewer or more turns. Safety limit: 2× reference turn count.
- `intent` - Just the scenario intent (auto-summarized from reference), runner improvises as a user would (scenario testing). Flexible turn count with same 2× safety limit.
- `strict` - Replay exact messages regardless of bot response (regression testing). **Fixed turn count** — sends exactly the reference messages, one per turn.

Mode can be set globally, per suite, or per test case (most specific wins). Default: `guided`.

In guided/intent modes, the runner signals conversation completion via a `[DONE]` token. The judge evaluates fidelity based on intent coverage, not 1:1 turn matching.

## Architecture

### Two Agents

**Runner Agent** — Plays the user role in conversations. Plain function, not a class.
- In `strict` mode: sends exact messages from reference (no LLM call for user turns)
- In `guided` mode: LLM agent with full reference conversation, follows spirit + flow, adapts wording. Signals `[DONE]` when complete.
- In `intent` mode: LLM agent with auto-summarized scenario intent, improvises naturally. Signals `[DONE]` when complete.
- Multi-turn loop: one LLM call per user turn, adapts to actual bot responses each turn. The runner function owns the full loop (LLM call → chatbot call → repeat). Hard programmatic call limit at 2× reference turn count, enforced in code (not prompt).

**Judge Agent** — Evaluates the full conversation after it completes. Plain function, not a class.
- Has the chatbot spec + accumulated feedback baked into its system prompt
- Scores against metrics + reference conversation + optional custom judge instructions
- Returns scores as JSON in a markdown fence (provider-agnostic, no structured output needed)
- Await (non-streaming) LLM calls

### Module Structure

```
packages/core/src/
├── types.ts           # All shared types/interfaces (no deps)
├── config.ts          # YAML parsing, hierarchy resolution, env var interpolation
├── llm.ts             # LLM provider abstraction (Anthropic + OpenAI SDKs)
├── chatbot-client.ts  # HTTP client for target chatbots (OpenAI SDK with custom baseURL)
├── runner.ts          # Runner agent (guided/intent/strict modes)
├── judge.ts           # Judge agent (scores conversations)
├── feedback.ts        # Feedback retrieval + prompt building
├── engine.ts          # Orchestrator — wires everything together (composition root)
├── output.ts          # Formats results for display
├── db/
│   ├── schema.ts      # Drizzle ORM table definitions
│   ├── client.ts      # DB connection factory
│   └── migrations/    # Drizzle migration files
└── index.ts           # Public API barrel export
```

### Dependency Graph

```
types.ts (leaf — no deps)
  ↑
config.ts, llm.ts, chatbot-client.ts, db/schema.ts
  ↑
feedback.ts, runner.ts, judge.ts (receive deps via function args)
  ↑
output.ts
  ↑
engine.ts (composition root — wires all modules, owns execution flow)
  ↑
packages/cli (thin wrapper, calls engine)
```

Key principle: runner, judge, and feedback are plain functions that receive their dependencies as arguments. Only `engine.ts` knows how to wire things together. This keeps modules testable and decoupled.

### Data Flow

```
CLI → engine.resolveConfig()
       → config.loadConfig() → config.resolveTests() → ResolvedTest[]
       → for each test (sequential):
           → runner(test, chatbotClient, llm) → Conversation
           → judge(conversation, test, feedback, llm) → JudgeResult
           → output.formatResult(test, judgeResult) → stdout
       → output.formatSummary(allResults) → stdout
```

### Model Routing

Model name determines which SDK to use:
- `claude-*` → Anthropic SDK
- Everything else → OpenAI SDK (works with any OpenAI-compatible provider)

### Agentic Judge (post-MVP)
Judge can use tools mid-evaluation:
- Search feedback history
- Check previous test results
- Call user-provided MCP tools to verify facts

## Chatbot Communication

Chatbots are accessed via **OpenAI-compatible chat completions API** (`POST /v1/chat/completions`). backtalk sends the full `messages[]` array and reads `choices[0].message.content`.

For bots that don't speak this format, users should put a thin adapter/proxy in front.

Post-MVP: custom adapter support (raw HTTP templates, non-JSON responses, etc.)

## Database Schema (Phase 3)

SQLite + Drizzle ORM. Three tables:

**runs** — one row per `backtalk run` invocation
- `id` (text, primary key, ULID)
- `started_at`, `finished_at` (timestamps)
- `total_tests`, `passed`, `failed` (integers)
- `config_snapshot` (JSON — full resolved config at time of run)

**test_results** — one row per test per run
- `id` (text, primary key, ULID)
- `run_id` (foreign key → runs)
- `suite_id`, `test_id` (text — from config)
- `quality_score`, `fidelity_score` (integer, 1-5)
- `quality_reasoning`, `fidelity_reasoning` (text)
- `passed` (boolean)
- `conversation` (JSON — full message array as-executed)
- `reference_conversation` (JSON — from config)
- `config_snapshot` (JSON — resolved test config)
- `created_at` (timestamp)

**feedback** — one row per feedback action
- `id` (text, primary key, ULID)
- `test_result_id` (foreign key → test_results)
- `action` (text — `approve` or `reject`)
- `comment` (text, nullable)
- `created_at` (timestamp)

## Model Configuration

Models follow a hierarchy — most specific wins, with runner and judge resolved independently:

```
runner: test.runner_model ?? test.model ?? suite.runner_model ?? suite.model ?? runner.model ?? model
judge:  test.judge_model  ?? test.model ?? suite.judge_model  ?? suite.model ?? judge.model  ?? model
```

This lets you use a cheap model by default, a smarter model for the judge, and override per-test when needed. The `model` shorthand at any level sets both runner and judge, but `runner_model`/`judge_model` take precedence when specified.

## Config format

```yaml
# backtalk.yaml

# Default model for both runner and judge (can be overridden below)
model: claude-haiku-4-5-20251001

chatbots:
  support-bot:
    spec: |
      Customer support bot for an e-commerce store.
      Should be helpful, empathetic, accurate about policies.
      Should de-escalate angry customers.
    url: http://localhost:3000/v1/chat/completions
    model: gpt-4o-mini           # optional, passed in request body
    api_key: ${SUPPORT_BOT_KEY}  # optional, env var interpolation

  sales-bot:
    spec: |
      Sales qualification bot.
      Should identify needs and recommend products.
    url: http://localhost:3001/v1/chat/completions
    api_key: ${SALES_BOT_KEY}

judge:
  model: claude-sonnet-4-5-20250929  # overrides default model for judge

runner:
  mode: guided  # guided | intent | strict (default for all tests)
  model: claude-sonnet-4-5-20250929  # overrides default model for runner

# Single threshold for all metrics, or per-metric (see Metrics section)
threshold: 3

suites:
  - id: customer-support
    chatbot: support-bot  # references named chatbot
    description: "Core customer support scenarios"
    # Suite-level overrides (optional)
    # mode: strict
    # model: claude-sonnet-4-5-20250929       # shorthand: sets both runner + judge
    # runner_model: claude-haiku-4-5-20251001 # override runner only
    # judge_model: claude-sonnet-4-5-20250929 # override judge only
    # threshold: 4
    tests:
      - id: refund-happy-path
        description: "Customer asks for refund on recent order"
        # Test-level overrides (optional)
        # mode: strict
        # model: claude-sonnet-4-5-20250929       # shorthand: sets both runner + judge
        # runner_model: claude-haiku-4-5-20251001 # override runner only
        # judge_model: claude-sonnet-4-5-20250929 # override judge only
        # threshold:
        #   quality: 4
        #   fidelity: 3
        conversation:
          - user: "Hi, I'd like a refund for my last order"
          - bot: "I'd be happy to help with that. Could you provide your order number?"
          - user: "Order #12345"
          - bot: "I found your order. Since it's within our 30-day window, I can process a full refund."
        judge: "Bot should ask for order number, confirm eligibility, process refund"  # optional custom judge instructions
        runner: "Use a random 5-digit order number"  # optional custom runner instructions

      - id: angry-customer
        description: "Angry customer demanding money back"
        conversation:
          - user: "This is TERRIBLE. Your product broke after ONE day. I want my money back NOW."
          - bot: "I'm really sorry to hear that. That's frustrating. Let me look into this right away."
        # No custom instructions — judge infers from chatbot spec

      - id: out-of-scope
        description: "Customer asks something the bot shouldn't answer"
        conversation:
          - user: "What's the meaning of life?"
          - bot: "Great question! But I'm best suited to help with orders and products."
        judge: "Bot must not attempt to answer philosophical questions"

  - id: sales-scenarios
    chatbot: sales-bot  # different chatbot
    description: "Sales qualification scenarios"
    tests:
      - id: product-recommendation
        description: "Customer asks for product advice"
        conversation:
          - user: "I need a laptop for video editing"
          - bot: "I'd recommend looking at our Pro series. What's your budget?"

# Tests can also live at top level (implicit default suite)
tests:
  - id: smoke-test
    chatbot: support-bot  # must specify chatbot when not in a suite
    description: "Basic greeting"
    conversation:
      - user: "Hello"
```

## CLI Commands

```bash
# Run all suites and tests
backtalk run

# Run a specific suite
backtalk run --suite customer-support

# Run a specific test
backtalk run --test refund-happy-path

# Run with mode override
backtalk run --mode strict

# Give feedback on a judgment
backtalk feedback refund-happy-path --approve
backtalk feedback angry-customer --reject "Bot was actually fine here, tone was appropriate"

# View feedback history
backtalk history

# View last run results
backtalk results
```

## Output

```
backtalk run

customer-support:
  refund-happy-path .... PASS  quality: 5  fidelity: 4  "Correctly identified order, confirmed policy"
  angry-customer ....... FAIL  quality: 2  fidelity: 3  "Responded defensively instead of empathizing"
  out-of-scope ......... PASS  quality: 4  fidelity: 5  "Politely redirected to its domain"

sales-scenarios:
  product-recommendation PASS  quality: 4  fidelity: 4  "Good needs assessment"

smoke-test ............. PASS  quality: 4  fidelity: 5  "Friendly greeting"

4/5 passed (threshold: 3)

Details:
  angry-customer:
    quality: 2/5 - "Bot said 'We can't help with that' instead of empathizing.
                    Doesn't match expected de-escalation behavior from spec."
    fidelity: 3/5 - "Conversation covered the right topic but tone diverged significantly."
```

## Project Structure (monorepo)

```
backtalk-ai/
├── packages/
│   ├── core/           # All business logic
│   │   ├── src/
│   │   │   ├── types.ts           # Shared types/interfaces (no deps)
│   │   │   ├── config.ts          # YAML parsing, hierarchy resolution, env var interpolation
│   │   │   ├── llm.ts             # LLM provider abstraction (Anthropic + OpenAI SDKs)
│   │   │   ├── chatbot-client.ts  # HTTP client for target chatbots (OpenAI SDK)
│   │   │   ├── runner.ts          # Runner agent (guided/intent/strict)
│   │   │   ├── judge.ts           # Judge agent (scores conversations)
│   │   │   ├── feedback.ts        # Feedback retrieval + prompt building
│   │   │   ├── engine.ts          # Orchestrator (composition root)
│   │   │   ├── output.ts          # Formats results for display
│   │   │   ├── db/
│   │   │   │   ├── schema.ts      # Drizzle ORM table definitions
│   │   │   │   ├── client.ts      # DB connection factory
│   │   │   │   └── migrations/    # Drizzle migration files
│   │   │   └── index.ts           # Public API barrel export
│   │   └── package.json
│   ├── cli/            # CLI interface (thin wrapper around core)
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── package.json
│   └── web/            # Frontend (later)
│       └── package.json
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.json
└── backtalk.yaml       # Example config
```

## Stack

- TypeScript
- pnpm workspaces (monorepo)
- Commander (CLI framework)
- tsx (dev runner)
- tsup (build/bundle)
- vitest (tests)
- Anthropic SDK + OpenAI SDK (configurable judge/runner models)
- YAML (config)
- SQLite + Drizzle ORM (storage — feedback, results, history)

## MVP Scope

### Phase 1: Vertical Slice — Guided Mode End-to-End
Single end-to-end flow: one hardcoded test, guided mode, one LLM provider, judge scores it, prints output. Prove the core loop works.
- LLM provider abstraction (start with one provider)
- Runner in guided mode (LLM follows reference conversation intent)
- Chatbot client (OpenAI-compatible endpoint)
- Judge evaluates full conversation, scores quality + fidelity (1-5)
- Scored output with reasoning to stdout
- CLI: `backtalk run` (minimal, no flags yet)

### Phase 2: Config + Multi-test
- YAML config parsing with full hierarchy resolution (model, mode, threshold)
- Named chatbots support
- Multiple suites and tests
- CLI flags: `--suite`, `--test`, `--mode`

### Phase 3: Storage + Feedback Loop
- SQLite + Drizzle ORM setup (schema, migrations)
- Store test results and run history
- Feedback storage (approve/reject with comments)
- Feedback incorporated into judge system prompt
- CLI: `backtalk feedback`, `backtalk history`, `backtalk results`

### Phase 4: Intent Mode
- Auto-summarize reference conversation into scenario intent
- Runner agent that improvises from intent only
- Mode selection: guided | intent | strict

### Phase 5: Polish
- Strict mode (replay exact messages)
- Error handling
- Better output formatting
- Example config + test cases

## Design Decisions

**Runner/Judge are plain functions, not classes.** They receive dependencies (LLM client, config, etc.) as arguments. This keeps them testable without mocking — pass a fake LLM in tests. Only `engine.ts` knows how to assemble the pieces.

**Chatbot client uses the OpenAI SDK with custom `baseURL`.** The chatbot under test speaks OpenAI-compatible HTTP — same protocol the SDK already handles. Since we already depend on the OpenAI SDK for runner/judge LLM calls, reusing it for chatbot communication avoids hand-building request/response types. Each chatbot gets its own `new OpenAI({ baseURL: chatbot.url })` instance.

**Eager config resolution.** `config.resolveTests()` flattens the hierarchy into `ResolvedTest[]` upfront — each test carries its fully resolved model, mode, threshold, etc. Downstream code never has to walk the hierarchy.

**Judge output as JSON in markdown fence.** Instead of using provider-specific structured output features (Anthropic's tool_use, OpenAI's response_format), the judge returns scores as a JSON block inside a markdown fence. This works identically across providers and is easy to parse.

**Model name routing.** `claude-*` → Anthropic SDK, everything else → OpenAI SDK. Simple string prefix check, no config needed.

**Sequential test execution.** Tests run one at a time for MVP. Keeps debugging straightforward and avoids rate limit complexity. Parallel execution is on the post-MVP backlog.

**Flexible turns in guided mode.** The runner decides when the conversation is complete rather than being locked to the reference turn count. The judge evaluates intent coverage, not turn-for-turn matching. This produces more natural conversations.

## Not in MVP
- Web UI (but monorepo structure supports it)
- MCP tool integration for judge
- CI/CD integration (GitHub Action)
- Conversation log import
- Custom endpoint adapters (non-OpenAI format)
- Configurable metrics (ships with quality + fidelity only)
- Non-JSON bot responses / streaming
- Stateful bot session management / conversation isolation / rollback

## Post-MVP
- Web frontend (React + Vite or Next.js) — migrate storage to PostgreSQL + Drizzle
- MCP server — expose `run_tests`, `give_feedback`, `view_results` as tools for AI assistants
- Agentic judge with MCP tools
- Intent mode runner
- GitHub Action for CI
- Dashboard with test history and trends
- Export/share test suites
- Parallel test execution (concurrent runs with rate limit handling)
- Custom endpoint adapters (A2A, raw HTTP templates, etc.)
