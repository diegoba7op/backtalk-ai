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
