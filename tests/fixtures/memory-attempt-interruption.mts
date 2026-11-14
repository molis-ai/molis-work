import { createEvaluationAttemptJournal, observeEvaluationRequests } from "../../scripts/memory-evaluation/network-observation.mjs";
const journal = await createEvaluationAttemptJournal(process.argv[2]!);
const observer = observeEvaluationRequests(process.argv[3]!, 1, () => ({ maxOutputTokens: 12, maxRequestBytes: 1000 }), { beforeDispatch: journal.beforeDispatch });
try { await fetch(process.argv[3]!, { method: "POST", body: JSON.stringify({ model: "fixture", max_tokens: 12, messages: [] }) }); }
finally { observer.restore(); await journal.close(); }
