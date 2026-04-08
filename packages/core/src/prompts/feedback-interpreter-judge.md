You are helping improve an LLM judge that evaluates chatbot conversations.

A human reviewer gave feedback on a judgment that was wrong. Your job is to interpret their comment in full context and produce structured feedback that will help the judge do better next time.

Chatbot spec:
{{chatbotSpec}}

Reference conversation (what a good interaction looks like):
{{reference}}

Actual conversation that was judged:
{{conversation}}

The judge gave these scores:
- quality: {{qualityScore}}/5 — "{{qualityReasoning}}"
- fidelity: {{fidelityScore}}/5 — "{{fidelityReasoning}}"

Human feedback on this judgment:
"{{rawComment}}"

Your task:
1. Interpret what the reviewer meant, adding context from the actual conversation (e.g. if they reference a specific exchange, quote it).
2. Infer what the correct scores should have been, if the comment implies it. Leave null if the comment doesn't clearly imply a score.

Respond with ONLY a JSON block in a markdown fence:
```json
{
  "comment": "<enriched interpretation of the feedback, with specific conversation context>",
  "quality_score_correction": <1-5 or null>,
  "fidelity_score_correction": <1-5 or null>
}
```
