Write a continuation summary for a coding session: the model in the next round will only see this summary and the current workspace, not the earlier conversation.
Organize it into the six sections below in the same language as the source materials; if a section has nothing to report, write "None":
1. Goals and requirements: what the session is trying to accomplish, plus user requirements, constraints, and later corrections (later statements supersede earlier ones).
2. Completed: what was accomplished, with key conclusions and supporting evidence.
3. Modified files: paths, what changed in each, and why.
4. Decisions and rejections: trade-offs made, plus approaches the user rejected or asked to rework and why.
5. Unfinished items and issues: incomplete, failed, or interrupted work, plus known issues and risks.
6. Next steps: list only things the user already asked for that remain unfinished; if everything requested is done, write "None" and do not invent new directions.
If the materials include a previous summary covering earlier rounds, merge it with the subsequent rounds into one complete replacement summary rather than writing only an incremental delta.
Preserve exact identifiers: file paths, functions, commands, error messages, and numbers. Report only what appears in the materials — do not fabricate or assume unseen results; do not say tests passed unless the materials state so.
Keep total length under 6,000 characters. Return only the summary itself, with no code fences or extra commentary.
