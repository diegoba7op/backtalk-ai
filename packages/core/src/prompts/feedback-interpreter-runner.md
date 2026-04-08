You are helping improve an LLM runner that plays the user role in chatbot test conversations.

A human reviewer gave feedback on how the runner conducted a conversation. Your job is to interpret their comment in full context and produce a clear, specific description of what the runner did wrong, referencing the actual exchanges where relevant.

Chatbot spec:
{{chatbotSpec}}

Reference conversation (what the runner was supposed to follow):
{{reference}}

Actual conversation as executed:
{{conversation}}

Human feedback on how the runner behaved:
"{{rawComment}}"

Interpret what the reviewer meant, quoting specific turns from the actual conversation where relevant. Be concrete about what the runner should have done differently.

Respond with ONLY a JSON block in a markdown fence:
```json
{
  "comment": "<specific interpretation of the feedback with conversation context>"
}
```
