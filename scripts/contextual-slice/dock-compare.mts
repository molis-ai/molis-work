/**
 * Before/after check of the Home / Dock recommendations on a real Home (specs/contextual-interaction §6.4.3): binds the
 * built-in Home rule, prepares every open Inbox entry's offers and judges them with the Home's own Jev connection, then
 * prints the offers, their rule keys and the rule's picks. Run it on each build and compare the two outputs. It writes
 * judgment records into that Home, so point it at an isolated copy, never at the Home in daily use.
 *
 *   pnpm exec tsx scripts/contextual-slice/dock-compare.mts --home <isolated home> --project <id> --out <file> [--board <id>] [--jev-from <home>]
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, createLocalFeedApplication } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { SYSTEM_HOME_DOCK_FUNCTION_KEY } from "@molis-ai/molis-work-contracts/modules/functions";
import { homeActions } from "../../apps/local-host/dist/home-actions.js";
import { localWebActionContext } from "../../apps/local-host/dist/local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "../../apps/local-host/dist/local-owner-permissions.js";
import { projectActionAvailability } from "../../apps/local-host/dist/project-action-availability.js";
import { typeSafeCredential } from "../../apps/local-host/src/typesafe-connection.js";

const arg = (name: string) => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : undefined; };
const home = arg("--home"), projectId = arg("--project"), out = arg("--out");
if (!home || !projectId || !out) throw new Error("需要 --home（隔离 Home）、--project 与 --out");
const homeDirectory = path.resolve(home);
const boardId = arg("--board") ?? "molis-work-v1-demo";
// The judgment runs on the named Home's TypeSafe connection; the key stays in this process's memory, never printed.
const jevFrom = arg("--jev-from");
if (jevFrom) {
  const key = typeSafeCredential(path.resolve(jevFrom), "functions");
  if (!key) throw new Error("--jev-from 指定的 Home 没有可用的 TypeSafe 连接");
  process.env.TYPESAFE_API_KEY = key;
}

const host = new MolisWorkLocalHost({ homeDirectory, actionAvailability: projectActionAvailability(withMolisWorkProjectCatalog, homeDirectory) });
try {
  const reference = molisWorkHostProjectReference({ databasePath: path.join(homeDirectory, "projects", projectId, "molis-work.db"), boardId, projectId });
  const caller = await localWebActionContext(host, reference, LOCAL_OWNER_PERMISSIONS);
  const actions = bindActionClient(host.actionClient(reference), () => caller);
  const entries = await host.withProject(reference, runtime => createLocalFeedApplication(runtime.store.db).listInboxEntries(boardId))
    .then(rows => rows.filter(entry => entry.status === "open").sort((a, b) => a.entry_id.localeCompare(b.entry_id)));
  const subjects = entries.map(entry => ({ kind: "inbox_entry", id: entry.entry_id }));
  const prepared = [];
  for (const subject of subjects) {
    const result = await actions.invoke(homeActions.offers, { subject, request_id: `dock-compare-${subject.id}` });
    prepared.push({ subject: subject.id, issues: result.issues, offers: result.offers.map(offer => ({ offer_id: offer.offer_id, title: offer.title,
      key: offer.recommendation_key ?? null, action: offer.action, input: offer.input, available: offer.availability.available })) });
  }
  await actions.invoke(homeActions.writeJudgment, { function_key: SYSTEM_HOME_DOCK_FUNCTION_KEY });
  const judged = await actions.invoke(homeActions.evaluate, { subjects });
  const titles = new Map(prepared.flatMap(row => row.offers.filter(offer => offer.key).map(offer => [offer.key!, offer.title] as const)));
  const picks = judged.judgments.map(judgment => ({ subject: judgment.subject.id, outcome: judgment.outcome,
    picked: judgment.suggested_behavior_ids.map(key => ({ key, title: titles.get(key) ?? null })), error: judgment.error_code }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
  const recommended = (await actions.invoke(homeActions.recommendations, {})).judgments.map(judgment => judgment.subject.id).sort();
  const report = { subjects: subjects.map(subject => subject.id), prepared, picks, recommended };
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ subjects: subjects.length, picks: picks.map(pick => [pick.subject.slice(-8), pick.outcome, pick.picked.map(item => item.title)]), recommended: recommended.length }));
} finally {
  await host.close();
}
