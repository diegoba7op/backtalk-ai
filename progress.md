# backtalk-ai — Progress

## Current State

Phases 1 and 2 complete. `pnpm backtalk run` works end-to-end against a real YAML config.

### What's working

| Area | Detail |
|------|--------|
| **Core pipeline** | Runner → Chatbot → Judge loop, sequential tests |
| **YAML config** | `backtalk.yaml` with chatbots, suites, tests |
| **Hierarchy resolution** | model/mode/threshold cascade: test → suite → global |
| **Env var interpolation** | `${VAR}` in url / api_key |
| **CLI** | `pnpm backtalk run [--suite] [--test] [--mode] [--verbose]` |
| **Output** | Colored, real-time: ora spinner per test, `◆◇` per exchange, ✓/✗ result |
| **Verbose mode** | Streams conversation turns as they happen |

### Key design decisions made

- `chatbotSpec` — context for runner (what it's simulating against) + judge (eval standard). **Not** the system prompt.
- `mock_chatbot_system_prompt` — optional, only for raw APIs with no deployed bot. `true` reuses spec; string overrides.
- `runner.include_chatbot_spec` — whether to include spec in runner prompt (more context, more tokens). Default: true.
- `Reporter` interface in `types.ts` — hooks called by engine/runner; chalk+ora implementation lives in CLI only.

### Packages

```
packages/core/src/
  types.ts          # shared types + Reporter interface
  config.ts         # loadConfig, resolveTests (hierarchy resolution)
  llm.ts            # Anthropic + OpenAI abstraction
  chatbot-client.ts # OpenAI-compatible HTTP client
  runner.ts         # guided mode, DONE sentinel, onTurn callback
  judge.ts          # scores quality + fidelity, parses JSON fence
  engine.ts         # composition root, fires Reporter hooks
  output.ts         # (legacy, unused by CLI — reporter handles output)
  prompts/runner.md # runner system prompt template
  prompts/judge.md  # judge system prompt template

packages/cli/src/
  index.ts          # backtalk run command + flags
  reporter.ts       # chalk + ora colored reporter
```

## Next Steps

### Phase 3: Storage + Feedback Loop
- SQLite + Drizzle ORM (`db/schema.ts`, `db/client.ts`, migrations)
- Store runs and test results (runs + test_results tables)
- Feedback storage (approve/reject with comments)
- Feedback incorporated into judge system prompt (`feedback.ts`)
- CLI: `backtalk feedback <test-id> --approve/--reject`, `backtalk history`, `backtalk results`

### Phase 4: Intent Mode
- Auto-summarize reference conversation into scenario intent
- Runner improvises from intent only (no reference turns)

### Phase 5: Polish
- `strict` mode (replay exact messages, no LLM runner)
- Error handling (API failures, malformed judge output)
- `output.ts` cleanup or removal

### Known issues / small debt
- `output.ts` is unused (reporter owns all output) — remove or repurpose
- No error handling if judge returns malformed JSON
