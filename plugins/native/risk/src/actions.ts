import { arraySchema as array, createActionDefinition, nullableSchema, objectSchema as object } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, ACTION_SUBJECT_SCHEMA, bindActionHandler, type ActionCallContext, type ActionExecutionContext, type ActionHandlerBinding, type ActionSchema,
  type ActionReference, type ActionSubject, type ActionSubjectContext, type InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseTransaction } from "@molis-ai/molis-work-contracts/platform/plugin";
import { riskErrors } from "./error.js";
import { RISK_KIND } from "./identity.js";
import { RISK_LIMITS, type RiskEvent, type RiskLink, type RiskRecord, type RiskRow } from "./model.js";
import { archiveRiskReviews, createRiskReviewHandlers } from "./review.js";
import { RISK_PAGE, type RiskStore } from "./store.js";

export const RISK_READ = ["risk:read"], RISK_WRITE = ["risk:read", "risk:write"];

const text = (maxLength: number) => ({ type: "string", maxLength } as const);
const id = { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" } as const;
const revision = { type: "integer", minimum: 1 } as const;
const level = { enum: ["high", "medium", "low"] } as const;
const status = { enum: ["open", "mitigating", "accepted", "closed"] } as const;
const timestamp = { type: "string" } as const;
const subject = object({ kind: { ...id, maxLength: 100 }, id: { ...id, maxLength: 400 } });

const riskFields = { risk_id: id, title: text(RISK_LIMITS.title), statement: text(RISK_LIMITS.statement), impact: level, likelihood: level,
  treatment: text(RISK_LIMITS.treatment), owner_name: nullableSchema(text(RISK_LIMITS.owner_name)), status, revision, created_by: id,
  created_at: timestamp, updated_at: timestamp, closed_at: nullableSchema(timestamp) } as const;
const risk = object(riskFields);
const row = object({ ...riskFields, links: array(ACTION_SUBJECT_SCHEMA) });
const link = object({ subject: ACTION_SUBJECT_SCHEMA, added_by: id, added_at: timestamp });
const event = object({ event_id: id, kind: { enum: ["created", "updated", "status", "note", "linked", "unlinked"] }, detail: { type: "object" }, actor_id: id, at: timestamp });
const changed = object({ risk });

/** `define<Output>()(…)`: the input type comes from the schema, so no handler below writes an input type of its own. */
const define = <O>() => <const S extends ActionSchema>(name: string, version: number, title: string, description: string, operation: "query" | "command",
  input: S, output: ActionSchema, extra: { concurrent?: true; result?: true } = {}) => {
  const definition = createActionDefinition<InferActionInput<S>, O>(`risk.${name}`, operation, {
    title, description, audiences: ["user", "agent", "workflow", "mcp", "plugin"], subject_kinds: [RISK_KIND], input_schema: input, output_schema: output,
    permissions: operation === "query" ? RISK_READ : RISK_WRITE, ...(extra.concurrent ? { scheduling: "concurrent" as const } : {}),
    ...(extra.result ? { result_subject: { id: "risk.risk_id", revision: "risk.revision" } } : {}),
  }, version);
  return definition;
};

const listInput = object({ status: { enum: ["open", "closed", "all"] }, impact: level, owner_name: text(RISK_LIMITS.owner_name), linked: subject, unlinked: { type: "boolean" },
  limit: { type: "integer", minimum: 1, maximum: RISK_PAGE.max }, cursor: text(400) }, []);
const editable = { title: text(RISK_LIMITS.title), statement: text(RISK_LIMITS.statement), impact: level, likelihood: level, treatment: text(RISK_LIMITS.treatment),
  owner_name: nullableSchema(text(RISK_LIMITS.owner_name)) } as const;

export const riskActions = {
  list: define<{ risks: RiskRow[]; owners: string[]; next_cursor: string | null }>()("list", /* @version action.risk.list */ 1, "风险列表",
    `读当前项目的风险，默认只列未关闭的（status: open 含缓解中与已接受），可按影响、负责人、关联的某个对象（linked：kind 与 id，如一个 Goal）、没关联任何对象（unlinked: true）或有关联（unlinked: false）筛；owners 是本项目可选的负责人。每页默认 ${RISK_PAGE.default} 条、最多 ${RISK_PAGE.max} 条，next_cursor 取下一页。`,
    "query", listInput, object({ risks: array(row), owners: array(text(RISK_LIMITS.owner_name)), next_cursor: nullableSchema(text(400)) })),
  get: define<{ risk: RiskRecord; links: RiskLink[]; events: RiskEvent[] }>()("get", /* @version action.risk.get */ 1, "读取风险",
    "读一条风险的内容、关联对象和进展时间线（新的在前）。", "query", object({ risk_id: id }), object({ risk, links: array(link), events: array(event) })),
  create: define<{ risk: RiskRecord }>()("create", /* @version action.risk.create */ 1, "记一条风险",
    `在当前项目记一条风险：标题、描述、影响与可能性（high／medium／low），可带应对、负责人（自由文字）和关联对象（最多 ${RISK_LIMITS.links} 个）。新风险是「打开」状态。`,
    "command", object({ ...editable, links: { ...array(subject), maxItems: RISK_LIMITS.links } }, ["title", "statement", "impact", "likelihood"]), changed, { result: true }),
  update: define<{ risk: RiskRecord }>()("update", /* @version action.risk.update */ 1, "修改风险",
    "按读到的 revision 改风险的字段，只改给出的；风险刚被别处改过时以 risk.conflict 拒绝，details.current 带当前内容；已关闭的风险以 risk.closed 拒绝，重新打开后再改。",
    "command", object({ risk_id: id, expected_revision: revision, ...editable }, ["risk_id", "expected_revision"]), changed, { result: true }),
  setStatus: define<{ risk: RiskRecord; review_left?: { task_id: string | null } }>()("status.set", /* @version action.risk.status.set */ 1, "改风险状态",
    "按读到的 revision 把风险改成打开、缓解中、已接受或已关闭，可附一句说明记进进展；关闭后这条风险的复查任务一并归档，没归档成的在 review_left 里返回（task_id 为 null 表示读不到它的复查）。",
    "command", object({ risk_id: id, expected_revision: revision, status, note: text(RISK_LIMITS.note) }, ["risk_id", "expected_revision", "status"]),
    object({ risk, review_left: object({ task_id: nullableSchema(id) }) }, ["risk"]), { concurrent: true, result: true }),
  addLink: define<{ links: RiskLink[] }>()("links.add", /* @version action.risk.links.add */ 1, "给风险关联对象",
    "把一个对象（Goal、Coding 会话、Feed 消息、成果……，任何有对象读取器的种类）关联到风险；先用它主人的读取器核对它在、调用者读得到，已关联的不重复。",
    "command", object({ risk_id: id, subject }), object({ links: array(link) }), { concurrent: true }),
  removeLink: define<{ links: RiskLink[] }>()("links.remove", /* @version action.risk.links.remove */ 1, "取消风险的关联",
    "去掉风险关联的一个对象；本来就没关联的不报错。", "command", object({ risk_id: id, subject }), object({ links: array(link) }), { concurrent: true }),
  addNote: define<{ event: RiskEvent }>()("notes.add", /* @version action.risk.notes.add */ 1, "记一笔风险进展",
    "在风险的进展时间线上记一笔人写的话，原话保存。", "command", object({ risk_id: id, text: text(RISK_LIMITS.note) }), object({ event })),
};

/** What the actions need of the plugin's start: its store for reads and for one transaction per write, and the readers of other kinds. */
export interface RiskActionPorts {
  read<T>(run: (store: RiskStore) => T): T;
  write<T>(caller: ActionExecutionContext, run: (store: RiskStore, transaction: PluginDatabaseTransaction) => T): Promise<T>;
  readSubject(subject: ActionSubject, caller: ActionCallContext): Promise<ActionSubjectContext>;
  /** Schedule's actions as the caller, for a risk's reviews (review.ts). */
  schedule<Output>(reference: ActionReference, input: unknown): Promise<Output>;
  now(): string;
}

export function createRiskActionHandlers(ports: RiskActionPorts): ActionHandlerBinding[] {
  const { read, write } = ports;
  return [
    bindActionHandler(riskActions.list, ({ limit, cursor, ...filter }) => read(store => ({ ...store.list(filter, { limit, cursor }), owners: store.owners() }))),
    bindActionHandler(riskActions.get, ({ risk_id }) => read(store => ({ risk: store.get(risk_id), links: store.links(risk_id), events: store.events(risk_id) }))),
    bindActionHandler(riskActions.create, ({ links, ...fields }, caller) => write(caller, (store, tx) => ({
      risk: store.create(tx, { ...fields, treatment: fields.treatment ?? "", owner_name: fields.owner_name ?? null, links: links ?? [] }, caller.actor_id, ports.now()) }))),
    bindActionHandler(riskActions.update, ({ risk_id, expected_revision, ...changes }, caller) => write(caller, (store, tx) => ({
      risk: store.update(tx, risk_id, expected_revision, changes, caller.actor_id, ports.now()) }))),
    bindActionHandler(riskActions.setStatus, async ({ risk_id, expected_revision, status: next, note }, caller) => {
      const before = read(store => store.get(risk_id)).status;
      const risk = await write(caller, (store, tx) => store.setStatus(tx, risk_id, expected_revision, next, note ?? null, caller.actor_id, ports.now()));
      // Once the close has committed: its reviews go too, so nothing wakes about a closed risk.
      const left = risk.status === "closed" && before !== "closed" ? await archiveRiskReviews(ports, risk_id) : undefined;
      return { risk, ...(left ? { review_left: left } : {}) };
    }),
    bindActionHandler(riskActions.addLink, async ({ risk_id, subject: linked }, caller) => {
      if (linked.kind === RISK_KIND && linked.id === risk_id) throw riskErrors.invalid("风险不能关联它自己");
      read(store => store.get(risk_id));
      try { await ports.readSubject(linked, caller); }
      catch (error) {
        if (error instanceof ActionError && (error.code === "actions.forbidden" || error.code === "actions.dependency_missing" || error.code.endsWith(".not_found")))
          throw riskErrors.invalid("要关联的对象不存在或读不到", { subject: linked });
        throw error;
      }
      return write(caller, (store, tx) => { store.link(tx, risk_id, linked, caller.actor_id, ports.now()); return { links: store.links(risk_id, tx) }; });
    }),
    bindActionHandler(riskActions.removeLink, ({ risk_id, subject: linked }, caller) => write(caller, (store, tx) => {
      store.unlink(tx, risk_id, linked, caller.actor_id, ports.now());
      return { links: store.links(risk_id, tx) };
    })),
    bindActionHandler(riskActions.addNote, ({ risk_id, text: note }, caller) => write(caller, (store, tx) => ({ event: store.addNote(tx, risk_id, note, caller.actor_id, ports.now()) }))),
    ...createRiskReviewHandlers(ports),
  ];
}
