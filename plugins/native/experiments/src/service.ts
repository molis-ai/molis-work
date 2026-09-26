import { createHash, randomUUID } from "node:crypto";
import type { PluginPrivateStorage } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { Cell, ExecutionPort, Experiment, ExperimentInput, ModelAnswer, Participant } from "./types.js";
import { requireText, validateInput, validateParticipant } from "./validation.js";
interface Data { experiments: Experiment[]; participants: Participant[] }
const KEY = "experiments.v1";
export class ExperimentsService {
  private active?: { id: string; controller: AbortController; done: Promise<void> };
  constructor(private storage: PluginPrivateStorage, private executor: () => ExecutionPort) {
    this.mutate(data => {
      for (const e of data.experiments) if (e.status === "running") {
        e.status = "interrupted"; e.finished_at = new Date().toISOString();
        for (const c of e.cells) if (["pending", "running"].includes(c.status)) {
          c.status = "failed"; c.error = "宿主中断；未自动重试，请复制实验后重跑";
        }
      }
    });
  }
  private read(): Data { return JSON.parse(this.storage.get(KEY) ?? '{"experiments":[],"participants":[]}') as Data; }
  private mutate<T>(fn: (data: Data) => T): T {
    const before = this.storage.get(KEY);
    const data: Data = JSON.parse(before ?? '{"experiments":[],"participants":[]}');
    const result = fn(data);
    if (!this.storage.compareAndSet) throw new Error("宿主未提供条件写入能力");
    if (!this.storage.compareAndSet(KEY, before, JSON.stringify(data))) throw new Error("实验数据已变化，请刷新后重试");
    return result;
  }
  list() { return this.read().experiments.map(({ id, name, status, created_at, hash }) => ({ id, name, status, created_at, hash })); }
  get(id: string): Experiment { const e = this.read().experiments.find(e => e.id === id); if (!e) throw new Error("实验不存在"); return e; }
  participants() { return this.read().participants; }
  deleteExperiment(id: string) {
    if (this.active?.id === id) throw new Error("请先取消运行中的实验，等待其停止后再删除");
    this.mutate(data => {
      const index = data.experiments.findIndex(e => e.id === id);
      if (index < 0) throw new Error("实验不存在");
      if (data.experiments[index]!.status === "running") throw new Error("请先等待实验停止后再删除");
      data.experiments.splice(index, 1);
    });
  }
  deleteParticipant(id: string) {
    this.mutate(data => {
      const index = data.participants.findIndex(p => p.id === id);
      if (index < 0) throw new Error("参试配置不存在");
      data.participants.splice(index, 1);
    });
  }
  saveParticipant(p: Participant) {
    const validated = validateParticipant(p);
    return this.mutate(data => { if(data.participants.length >= 12 && !data.participants.some(i => i.id === p.id)) throw new Error("最多保存 12 份参试配置"); data.participants = [...data.participants.filter(i => i.id !== p.id), validated]; return validated; });
  }
  create(input: ExperimentInput): Experiment {
    const frozen = validateInput(input);
    const e: Experiment = { ...frozen, id: randomUUID(), hash: createHash("sha256").update(JSON.stringify(frozen)).digest("hex"),
      created_at: new Date().toISOString(), status: "ready", reviews: [], cells: frozen.cases.flatMap(c => frozen.participants.map(p => ({
        case_id: c.id, participant_id: p.id, status: "pending", attempts: 0, duration_ms: null,
      }))) };
    return this.mutate(data => { data.experiments.unshift(e); return e; });
  }
  review(id: string, caseId: string, reference: string, note: string) {
    requireText(note, "复核依据", 2000);
    return this.mutate(data => {
      const e = data.experiments.find(e => e.id === id);
      if (!e || !e.cases.some(c => c.id === caseId) || !e.task.criteria.some(c => c.key === reference)) throw new Error("复核对象或答案无效");
      if (["ready", "running"].includes(e.status)) throw new Error("运行结束后才能人工复核");
      e.reviews.push({ case_id: caseId, reference, note, actor: "human", at: new Date().toISOString() }); return e;
    });
  }
  start(id: string): Experiment {
    if (this.active) throw new Error("已有实验正在运行；请等待或取消");
    const current = this.get(id); if (current.status !== "ready") throw new Error("快照只执行一次；重跑请复制为新实验");
    const controller = new AbortController();
    this.update(id, e => { e.status = "running"; e.started_at = new Date().toISOString(); });
    // Defer execution until the active guard is installed, including synchronous failures.
    const done = Promise.resolve().then(() => this.run(id, controller.signal)).finally(() => { this.active = undefined; });
    this.active = { id, controller, done }; return this.get(id);
  }
  cancel(id: string) { if (this.active?.id !== id) throw new Error("此实验未在运行"); this.active.controller.abort(); return this.get(id); }
  async idle() { await this.active?.done; }
  async close() { this.active?.controller.abort(); await this.idle(); }
  private update(id: string, fn: (e: Experiment) => void) { this.mutate(data => { const e = data.experiments.find(e => e.id === id); if (!e) throw new Error("实验不存在"); fn(e); }); }
  private async run(id: string, signal: AbortSignal) {
    let executor: ExecutionPort | undefined;
    try {
      executor = this.executor();
      const e = this.get(id);
      for (const c of e.cases) for (const p of e.participants) {
        if (signal.aborted) break;
        const change = (fn: (cell: Cell) => void) => this.update(id, v => fn(v.cells.find(x => x.case_id === c.id && x.participant_id === p.id)!));
        change(v => { v.status = "running"; v.attempts = 1; });
        const start = performance.now();
        try {
          // No references, provenance labels, reviews, other answers or function metadata cross this boundary.
          const answer = await executor.evaluate(p, { task: { instructions: e.task.instructions, criteria: e.task.criteria }, input: c.input }, signal);
          if (signal.aborted) throw new Error("已取消");
          validateAnswer(answer, e.task.criteria.map(c => c.key));
          change(v => { v.status = "ok"; v.answer = answer; v.duration_ms = performance.now() - start; });
        } catch (error) {
          change(v => { v.status = signal.aborted ? "cancelled" : "failed"; v.error = error instanceof Error ? error.message.slice(0, 500) : "运行失败"; v.duration_ms = performance.now() - start; });
        }
      }
      this.update(id, v => { v.status = signal.aborted ? "cancelled" : "completed"; v.finished_at = new Date().toISOString();
        for (const c of v.cells) if (c.status === "pending") c.status = "cancelled";
      });
    } catch {
      this.update(id, v => { v.status = "interrupted"; v.finished_at = new Date().toISOString(); for (const c of v.cells) if (["pending", "running"].includes(c.status)) { c.status = "failed"; c.error = "执行器或持久化中断"; } });
    } finally { executor?.close(); }
  }
}
function validateAnswer(answer: ModelAnswer, keys: string[]) {
  if (!keys.includes(answer.choice) || !answer.model) throw new Error("模型未返回有效选项或实际模型标识");
  for (const n of [answer.input_tokens, answer.output_tokens, answer.startup_ms, answer.model_ms, answer.reported_cost_usd]) {
    if (n != null && (typeof n !== "number" || !Number.isFinite(n) || n < 0)) throw new Error("模型度量无效");
  }
  if (answer.probabilities && Object.entries(answer.probabilities).some(([key, value]) => !keys.includes(key) || !Number.isFinite(value) || value < 0 || value > 1)) throw new Error("模型概率字段无效");
  if (answer.confidence != null && (!Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1)) throw new Error("模型置信值无效");
}
