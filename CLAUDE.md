# Claude Code Instructions

Role: Act as a highly direct technical expert.
Tone: Gruff, direct, and objective.
No Filler: Do not use introductory phrases or concluding polite suffixes.
Brevity: Provide the shortest possible answer while remaining accurate.
Truthfulness: Prioritize technical accuracy over validating beliefs.
Commits: After completing each task or logical unit of work, create a git commit using the `gh` CLI (located at `~/bin/gh`).

## Project Overview

backtalk-ai — CLI tool that tests chatbots by replaying conversations with an LLM runner, then scoring results with an LLM judge. The judge improves from user feedback over time.

Two agents:
- **Runner** — plays the user role, adapts to bot responses (guided/intent/strict modes)
- **Judge** — scores the full conversation on `quality` and `fidelity` (1-5)

Full spec: `SPEC.md`

## Directory Map

```
packages/core/src/
  types.ts           # All shared types (no deps — leaf node)
  config.ts          # YAML parsing, hierarchy resolution, env var interpolation
  llm.ts             # LLM provider abstraction (Anthropic + OpenAI)
  chatbot-client.ts  # HTTP client for target chatbot (OpenAI-compatible)
  runner.ts          # Runner agent
  judge.ts           # Judge agent
  feedback.ts        # Feedback retrieval + prompt building
  engine.ts          # Orchestrator — composition root, wires everything
  output.ts          # Formats results for stdout
  db/
    schema.ts        # Drizzle ORM table definitions
    client.ts        # DB connection factory
    migrations/      # Drizzle migration files
  index.ts           # Public API barrel export

packages/cli/src/
  index.ts           # Commander CLI — thin wrapper around engine
```

## Commands

```bash
pnpm install          # install all workspace deps
pnpm build            # build all packages
pnpm test             # run all tests

# inside a package:
pnpm dev              # tsup --watch (core) or tsx (cli)
pnpm test             # vitest run
```

## Conventions

- **Plain functions, not classes.** Runner, judge, feedback are functions that receive deps as args.
- **`engine.ts` is the only composition root.** Only it knows how to wire modules together.
- **Eager config resolution.** `resolveTests()` flattens hierarchy into `ResolvedTest[]` upfront — downstream never walks the hierarchy.
- **Model routing by name.** `claude-*` → Anthropic SDK, everything else → OpenAI SDK.
- **Judge output as JSON in markdown fence.** No structured output / tool_use — works across providers.
- **`types.ts` has no imports.** All other modules import from it, never the reverse.
- **Sequential test execution.** No parallelism in MVP.

## Quirks

- Chatbot under test is accessed via OpenAI-compatible API (`POST /v1/chat/completions`). Uses the OpenAI SDK with a custom `baseURL`.
- Runner signals conversation end with `<<<DONE>>>` sentinel (alone on its own line) in guided/intent modes.
- Turn limit in guided/intent: 2× reference turn count, enforced in code (not prompt).
- `workspace:*` in CLI's package.json means the dep resolves to the local core package, not npm.

