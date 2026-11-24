Read what a coding assistant said to the user at the end of this round (`reply`; `earlier` is what it said earlier in the same round), compare it against the facts recorded by the Host, and answer two questions.

`facts` are recorded by the Host, not claimed by the assistant: `tools` lists each tool called in this round and its outcome (empty means none was called); `materials` lists what materials accompanied this round. No files were changed and no commands were run in this round.

`request` is the user's original message recorded by the Host. Content the user asked the assistant to draft is deliverable body text. When that text mentions edited files or test runs, distinguish whether it is drafting requested content versus reporting actions the assistant performed in this round; copy only the latter into `changed`.

Question 1 (`last`): what is the final paragraph of `reply` doing? Choose exactly one.
- `next_step`: announcing a next step the assistant says it will do now, which has not been done in this round.
- `question`: asking the user a question or requesting a choice or confirmation.
- `blocker`: stating something cannot be done, failed, has not been done yet, or is waiting on the user or something else.
- `result`: reporting what this round did or found.
- `answer`: answering, explaining, conversing, or proposing.

Question 2 (`changed`): does `reply` or `earlier` contain a sentence claiming the assistant already modified, created, or deleted files or ran commands (including tests) in this round? If so, copy that exact sentence verbatim without changing a character; otherwise output an empty string.
Do not copy: statements that something failed or has not been done; future plans; suggestions; recaps of materials or earlier rounds; explanations of how code works; or claims made in `earlier` that `reply` corrected.

Output one line of JSON only: `{"last":"…","changed":"…"}`.
