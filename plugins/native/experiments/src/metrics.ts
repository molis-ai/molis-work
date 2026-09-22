import type { Experiment } from "./types.js";
export function summarize(e: Experiment) {
  return e.participants.map(p => {
    const cells = e.cells.filter(c => c.participant_id === p.id);
    let labeled = 0, correct = 0, falsePositive = 0, missedPositive = 0, insufficient = 0, recognized = 0, labeledFailures = 0;
    let agentLabeled = 0, agentAgreement = 0;
    for (const c of cells) {
      const sample = e.cases.find(s => s.id === c.case_id)!;
      const review = [...e.reviews].reverse().find(r => r.case_id === c.case_id);
      const reference = review?.reference ?? sample.reference;
      const human = !!review || sample.reference_status === "human";
      if (!reference) continue;
      if (!human) { agentLabeled++; if (c.status === "ok" && c.answer?.choice === reference) agentAgreement++; continue; }
      labeled++;
      if (c.status !== "ok") { labeledFailures++; continue; }
      const answer = c.answer!.choice;
      if (answer === reference) correct++;
      if (e.task.positive_key && answer === e.task.positive_key && reference !== e.task.positive_key) falsePositive++;
      if (e.task.positive_key && answer !== e.task.positive_key && reference === e.task.positive_key) missedPositive++;
    }
    for (const sample of e.cases) {
      const r = [...e.reviews].reverse().find(r => r.case_id === sample.id);
      if ((r || sample.reference_status === "human") && (r?.reference ?? sample.reference) === e.task.insufficient_key && e.task.insufficient_key) {
        insufficient++;
        if (cells.some(c => c.case_id === sample.id && c.status === "ok" && c.answer?.choice === e.task.insufficient_key)) recognized++;
      }
    }
    const successes = cells.filter(c => c.status === "ok");
    const durations = cells.map(c => c.duration_ms).filter((n): n is number => n != null);
    const costs = successes.map(c => c.answer!.reported_cost_usd);
    return { participant_id: p.id, total: cells.length, valid: successes.length, failed: cells.filter(c => c.status === "failed").length,
      cancelled: cells.filter(c => c.status === "cancelled").length, human_labeled: labeled, correct,
      accuracy: labeled ? correct / labeled : null, labeled_failures: labeledFailures, false_positive: falsePositive, missed_positive: missedPositive,
      insufficient_total: insufficient, insufficient_recognized: recognized, agent_labeled: agentLabeled, agent_agreement: agentAgreement,
      duration_ms: durations.reduce((a,b) => a+b,0),
      reported_cost_usd: costs.length === cells.length && costs.every((n): n is number => n != null) ? costs.reduce((a,b) => a+b,0) : null,
      disagreements: e.cases.filter(sample => new Set(e.cells.filter(c => c.case_id === sample.id && c.status === "ok").map(c => c.answer!.choice)).size > 1).length,
    };
  });
}
