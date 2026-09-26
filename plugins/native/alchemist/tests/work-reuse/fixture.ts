import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { ArtifactsModule, createArtifactsSchema } from "../../../../../modules/artifacts/src/index.js";
import { createContextLedger, createContextLedgerSchema } from "../../../../../modules/context-ledger/src/index.js";
import { createLocalRuntime } from "../../src/studio/server/bootstrap/local-runtime.js";
import { alchemistActions as a } from "../../src/studio/shared/contracts/actions.js";
import type { AlchemistAiPort } from "../../src/studio/server/runtime/host-port.js";
import type { WorkReuseHostPort } from "../../src/work-reuse/contracts.js";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";

export async function fixture(options: { ai?: AlchemistAiPort; description?: string } = {}) {
  const home = mkdtempSync(join(tmpdir(), "work-reuse-"));
  const db = new Database(join(home, "artifacts.sqlite"));
  db.exec("CREATE TABLE boards (board_id TEXT PRIMARY KEY); INSERT INTO boards VALUES ('board-test')");
  db.exec("CREATE TABLE events (seq INTEGER PRIMARY KEY, board_id TEXT NOT NULL)");
  createArtifactsSchema(db); createContextLedgerSchema(db);
  let event = 0, denied = false, badOutput = false, linkFailure = false, writeAllowed = true;
  const artifacts = new ArtifactsModule({ db, appendEvent: input => { db.prepare("INSERT INTO events VALUES (?,?)").run(++event,input.boardId); return event; }, now: () => "2026-08-01T00:00:00.000Z" });
  const ledger = createContextLedger(db, { authorize: () => !denied });
  const scope = { kind: "personal" as const, id: "actor-local" }, access = { actor_id: "actor-local", scope };
  const requests: Parameters<AlchemistAiPort["generate"]>[0][] = [];
  const deniedReferences = new Set<string>();
  let beforeDispatch: ((phase: "prepare" | "credentials", input: Parameters<AlchemistAiPort["generate"]>[0]) => Promise<void>) | undefined;
  let afterGenerate: (() => void) | undefined;
  let transformOutput: ((input: Parameters<AlchemistAiPort["generate"]>[0], text: string) => string) | undefined;
  const ai: AlchemistAiPort = options.ai ?? {
    listModels: async () => [{ id: "test/model", label: "Controlled test model", runtimeLabel: "test double", costVisibility: "unobservable" }],
    search: async () => [{ url: "https://example.org/interviews", title: "Isolated interview fixture", excerpt: "People retain interview quotes. Willingness to pay is unknown." }],
    generate: async input => {
      await beforeDispatch?.("prepare", input);
      await beforeDispatch?.("credentials", input);
      await input.beforeModelDispatch?.();
      requests.push(input);
      const fields = input.jsonSchema.properties as any;
      let value: unknown;
      if (fields.recommendations) value = { recommendations: JSON.parse(input.userPrompt).candidates.map((item: any) => ({ key: item.key,
        suitability: "needs_review", reason: "相同研究场景，历史结论仍需重核。", applicableWhen: ["需求研究"], invalidWhen: ["目标用户已改变"], recheck: ["当前价格"] })) };
      else if (fields.summary) value = { summary: "原话可追溯，但付费意愿仍需新的访谈验证。" };
      else if (fields.judgments) value = { judgments: fields.judgments.items.properties.label.enum.map((label: string) => ({ label, status: "tentative",
        conclusion: "原话可追溯，意愿待验证。", rationale: "仅有隔离测试来源", supportingEvidenceIndexes: [0], counterEvidenceIndexes: [], unknowns: ["付费意愿"], changeConditions: ["新的用户访谈"] })) };
      else value = { understanding: { summary: "访谈整理", assumptions: ["保留原话"], unknowns: ["频率"], concreteness: "direction" }, cards: ["证据卡", "提案依据"].map(title => ({
        title, highlight: "保留原话", targetUser: "独立团队", scenario: "访谈后", problem: "证据散落", mechanism: "关联证据与判断", valueProposition: "研究可继续", whyItMayWork: "可追溯",
        assumptions: ["愿意记录"], unknowns: ["付费"], mvp: { inScope: ["证据整理"], outOfScope: ["自动发布"] } })), noCardsReason: null };
      afterGenerate?.();
      const body = badOutput ? "not valid JSON" : JSON.stringify(value);
      return { text: transformOutput ? transformOutput(input, body) : body, runtimeLabel: "test double (not Prologue validation)" };
    },
  };
  const host: WorkReuseHostPort = {
    projectId: "project-test", boardId: "board-test",
    callerFor: async (actor_id, signal) => ({ actor_id, project_id: "project-test", permissions: ["alchemist:read", ...(writeAllowed ? ["alchemist:write"] : []), "alchemist:generate"], audience: "user", signal }),
    listArtifacts: async () => artifacts.query.listArtifacts("board-test"),
    readArtifact: async (_caller, ref) => denied || deniedReferences.has(ref.artifact_id) ? null : artifacts.query.getArtifactVersion("board-test", ref),
    publishReport: async (caller, input) => {
      if (denied) throw new Error("denied");
      const reference = { artifact_id: `report:${input.report.id}`, version: input.report.revision };
      artifacts.commands.registerVersion({ ...reference, board_id: "board-test", actor_id: caller.actor_id,
        artifact_type_id: "alchemist.research", schema_version: 1, producer: { plugin_id: "alchemist", plugin_version: "1", binding_signature: "fixture" },
        content: { kind: "inline", payload: JSON.parse(JSON.stringify({ report: input.report, evidence: input.evidence })) }, metadata: { title: input.title } });
      return reference;
    },
    linkConsumption: async (caller, input) => {
      if (linkFailure) throw new Error("ledger unavailable");
      for (const ref of input.references) ledger.commands.put({ ...access, actor_id: caller.actor_id }, {
        key: `reuse:${input.runId}:${ref.artifact_id}:${ref.version}`, type: "work.reuse.consumed",
        source: { module: "artifacts", id: ref.artifact_id, version: ref.version, scope, project_id: "project-test" },
        target: { module: "projects", id: input.runId, version: null, scope, project_id: "project-test", object_type: "alchemist_research_run" }, cause: input.planId,
      });
    },
  };
  let runtime = createLocalRuntime({ databasePath: join(home, "studio.sqlite"), ai, workReuse: host, pulseSourceMode: "fixture" });
  const call = <I, O>(definition: Parameters<typeof runtime.actions.invoke<I,O>>[0], input: I) => runtime.actions.invoke(definition, input);
  const { direction } = await call(a.directionCreate, { title: "访谈研究", description: options.description ?? "为独立团队研究访谈整理与提案工具" });
  const started = await call(a.explorationStart, { id: direction.id }); await runtime.runPending();
  const { exploration } = await call(a.explorationGet, { id: started.runId });
  const ideas = [];
  for (const card of exploration.cards) ideas.push((await call(a.cardKeep, { id: card.id })).idea);
  const idea = ideas[0]!;
  const plan = (reuse?: { artifacts: { reference: ArtifactReference; reason: string }[]; methodIds: string[] }, lens: "market_space" | "build_cost" = "market_space", task = idea, budgetLimit = 3) => call(a.researchPlan, {
    id: task.id, ideaVersion: 1, lens, modelPolicy: "auto", budget: { kind: "calls", limit: budgetLimit }, ...(reuse ? { reuse } : {}),
  });
  const run = async (planId: string, lens: "market_space" | "build_cost" = "market_space", task = idea) => {
    const { run } = await call(a.researchStart, { id: task.id, lens, planId }); await runtime.runPending();
    return { run, workspace: await call(a.researchGet, { id: task.id, version: 1 }) };
  };
  const confirmMethod = async (reportId: string, summary: string) => {
    const { annotation } = await call(a.annotationCreate, { target: { kind: "lens_report", objectId: reportId, revision: 1, blockId: "summary" }, quotedSnapshot: summary, comment: "下次优先独立用户原话，保留反证" });
    const { proposal } = await call(a.playbookPropose, { id: annotation.id, methodChange: "先看用户原话，保留反证", positiveExamples: ["用户研究"], negativeExamples: ["仅有推广软文"], scopeKind: "direction" });
    return (await call(a.proposalApply, { id: proposal.id })).rule;
  };
  return { home, artifacts, ledger, access, requests, call, plan, run, confirmMethod, idea, ideas, direction,
    get runtime() { return runtime; }, host,
    beforeDispatch(callback?: typeof beforeDispatch) { beforeDispatch=callback; },
    denyReference(ref: ArtifactReference, value=true) { value ? deniedReferences.add(ref.artifact_id) : deniedReferences.delete(ref.artifact_id); },
    deny(value=true) { denied=value; }, bad(value=true) { badOutput=value; }, linkFailure(value=true) { linkFailure=value; },
    allowWrite(value: boolean) { writeAllowed=value; },
    afterGenerate(callback?: () => void) { afterGenerate=callback; },
    transformOutput(callback?: typeof transformOutput) { transformOutput=callback; },
    async restart() { await runtime.close(); runtime=createLocalRuntime({ databasePath: join(home,"studio.sqlite"), ai, workReuse:host,pulseSourceMode:"fixture" }); },
    async close() { await runtime.close(); db.close(); rmSync(home,{recursive:true,force:true}); },
  };
}
