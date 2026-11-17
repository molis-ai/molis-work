import { arraySchema as array, createActionDefinition, nullableSchema, objectSchema as object } from "@molis-ai/molis-work-plugin-sdk";
import { ACTION_SUBJECT_SCHEMA, type ActionAudience, type ActionSchema, type InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { BRIEF_KIND } from "./identity.js";
import type { OwnedTextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import { BRIEF_LIMITS, type BriefChange, type BriefEdit, type BriefProposal, type BriefRecord, type BriefVersion, type BriefVersionHead, type NextMark } from "./model.js";

export const WORK_BRIEF_READ = ["work-brief:read"], WORK_BRIEF_WRITE = ["work-brief:read", "work-brief:write"];

const text = (maxLength: number) => ({ type: "string", minLength: 1, maxLength, pattern: "\\S" } as const);
const id = text(BRIEF_LIMITS.id);
const revision = { type: "integer", minimum: 1 } as const;
const versionNumber = { type: "integer", minimum: 1 } as const;
const loose = { type: "object" } as const;
const reference = object({ capability_id: text(200), version: { type: "integer", minimum: 1 }, provider_id: text(400) });

/** A draft as the assistant (or the person) hands it in: sentences with what they stand on, what waits for the person, and next steps. */
const draft = object({
  claims: { ...array(object({ claim_id: id, text: text(BRIEF_LIMITS.claim_text), cites: { ...array(ACTION_SUBJECT_SCHEMA), maxItems: BRIEF_LIMITS.cites },
    supplied_by: { enum: ["owner"] } }, ["text"])), maxItems: BRIEF_LIMITS.claims },
  attention: { ...array(object({ subject: ACTION_SUBJECT_SCHEMA, why: text(BRIEF_LIMITS.why), blocked: { type: "boolean" } }, ["subject", "why"])), maxItems: BRIEF_LIMITS.attention },
  next: { ...array(object({ text: text(BRIEF_LIMITS.next_text), why: text(BRIEF_LIMITS.why), subject: ACTION_SUBJECT_SCHEMA,
    act: { oneOf: [object({ kind: { const: "assistant" } }), object({ kind: { const: "action" }, reference, input: loose })] } }, ["text", "why", "act"])), maxItems: BRIEF_LIMITS.next },
}, ["claims"]);

const stamp = { type: "string" } as const;
/** The brief's head: `brief_id` and `revision` are what a command's result points at. */
const brief = object({ brief_id: id, project_id: { type: "string" }, scope: { enum: ["home", "topic", "personal"] }, title: { type: "string" }, current_version: { type: "integer", minimum: 0 },
  revision, created_at: stamp, updated_at: stamp, fixed: loose });
const version = loose, changes = array(loose);

type Audiences = readonly ActionAudience[];
const PEOPLE_AND_TOOLS: Audiences = ["user", "agent", "plugin", "mcp"], WRITERS: Audiences = ["user", "agent"], PERSON: Audiences = ["user"];

/** `define<Output>()(…)`: the input type comes from the schema, so no handler writes an input type of its own. */
const define = <O>() => <const S extends ActionSchema>(name: string, version: number, title: string, description: string, operation: "query" | "command",
  audiences: Audiences, input: S, output: ActionSchema, extra: { concurrent?: true; result?: true; scope?: "home"; reach?: true; artifact?: true } = {}) =>
  createActionDefinition<InferActionInput<S>, O>(`work-brief.${name}`, operation, {
    title, description, audiences: [...audiences], subject_kinds: extra.scope ? [] : [BRIEF_KIND], input_schema: input, output_schema: output,
    permissions: [...(operation === "query" ? WORK_BRIEF_READ : WORK_BRIEF_WRITE), ...(extra.artifact ? ["artifact:write"] : [])], ...(extra.concurrent ? { scheduling: "concurrent" as const } : {}),
    ...(extra.scope ? { scope: extra.scope } : {}), ...(extra.reach ? { project_reach: "person" as const } : {}),
    ...(extra.result ? { result_subject: { id: "brief.brief_id", revision: "brief.revision" } } : {}),
  }, version);

export interface BriefView {
  brief: BriefRecord | null;
  version: BriefVersion | null;
  versions: BriefVersionHead[];
  proposal: BriefProposal | null;
  edits: BriefEdit[];
  marks: NextMark[];
  /** With `compare_with`: that version, and what differs from it to `version`. */
  compared?: BriefVersion;
  changes?: BriefChange[];
}
export interface BriefSaved { brief: BriefRecord; version: BriefVersion | null; proposal: BriefProposal | null }
export interface BriefRefreshed { brief: BriefRecord; version: BriefVersion; changed: boolean; changes: BriefChange[] }

const saved = object({ brief, version: nullableSchema(version), proposal: nullableSchema(loose) });

export const workBriefActions = {
  list: define<{ briefs: BriefRecord[] }>()("briefs.list", /* @version action.work-brief.briefs.list */ 1, "简报列表",
    "列出当前项目的简报与各自的现行版本号：项目自己的那一份（首页那一页）在前，其后是专题简报。不含正文与依据。", "query", PEOPLE_AND_TOOLS, object({}), object({ briefs: array(brief) })),
  get: define<BriefView>()("briefs.get", /* @version action.work-brief.briefs.get */ 1, "读取简报",
    "读一份简报的一版（不给 brief_id 读项目自己的那一份，不给 version 读现行版）：各来源当时的状态、每句话与它的依据、要你处理的、下一步，以及版本列表、人工修改、没处理完的提案和下一步的处置。带 compare_with 时同时给那一版和两版的差异。每条依据按调用者此刻读不读得到复核，读不到的只留缺口标记，不给当时的标题。项目还没有简报时 brief 为 null。",
    "query", PEOPLE_AND_TOOLS, object({ brief_id: id, version: versionNumber, compare_with: versionNumber }, []),
    object({ brief: nullableSchema(brief), version: nullableSchema(version), versions: array(loose), proposal: nullableSchema(loose), edits: array(loose), marks: array(loose),
      compared: version, changes }, ["brief", "version", "versions", "proposal", "edits", "marks"]), { concurrent: true }),
  save: define<BriefSaved>()("briefs.save", /* @version action.work-brief.briefs.save */ 1, "保存简报",
    `交一版草稿，存成简报新的一版。draft.claims 是一句句话（最多 ${BRIEF_LIMITS.claims} 句、每句 ${BRIEF_LIMITS.claim_text} 字）：每句用 cites 列出它依据的对象（kind 与 id，最多 ${BRIEF_LIMITS.cites} 条），保存时以调用者身份逐条读取并记下当时的标题与版本，读不到的以 work_brief.cite_unreadable 拒绝并指出是哪一句的哪一条；本人口述、没有对象可依的句子标 supplied_by: "owner"，不带 cites。draft.attention 是要本人处理的对象与一句原因；draft.next 是下一步（最多 ${BRIEF_LIMITS.next} 个）：act.kind 为 action 时给动作引用与准备好的输入（保存时核对动作在、输入合它的 schema，本人点了才执行），为 assistant 时表示交给助理继续。不给 brief_id 存到项目自己的那一份（没有就建）；new_topic 为 true 时用 title 建一份专题简报。沿用已有句子时带回它的 claim_id。本人改过的句子和草稿不一致时不覆盖：存成提案并在 proposal.conflicts 逐句列出，等本人处理。带 base_version（草稿依据的那一版的版本号）时，简报已不在那一版就以 work_brief.conflict 拒绝。request_id 相同的重复提交返回同一结果。`,
    "command", WRITERS, object({ brief_id: id, new_topic: { type: "boolean" }, title: text(BRIEF_LIMITS.title), base_version: { type: "integer", minimum: 0 }, request_id: text(BRIEF_LIMITS.request_id),
      task: ACTION_SUBJECT_SCHEMA, draft }, ["request_id", "draft"]), saved, { concurrent: true, result: true }),
  refresh: define<BriefRefreshed>()("briefs.refresh", /* @version action.work-brief.briefs.refresh */ 1, "刷新简报",
    "不调用模型：以调用者身份重读各来源的首页概况和现行版每条依据的现状。有变化才存成新的一版并在 changes 里只报变化（哪个来源、哪句话的哪条依据）；没有变化时 changed 为 false、不存新版。读不到的来源标过期（保留上次读到的内容与时间）或缺口，没有权限的标未授权，不编造。本人改过的句子原样保留，固定过的旧版本不动。不给 brief_id 刷新项目自己的那一份（没有就建）。",
    "command", ["user", "agent", "workflow"], object({ brief_id: id, task: ACTION_SUBJECT_SCHEMA }, []),
    object({ brief, version, changed: { type: "boolean" }, changes }), { concurrent: true, result: true }),
  edit: define<BriefSaved>()("briefs.edit", /* @version action.work-brief.briefs.edit */ 1, "修改简报的一句",
    "本人改现行版的一句话（claim_id 与新的 text）、去掉一句（text 为 null），或补一句自己的话（不给 claim_id，记为本人口述）。改动存成新的一版并记为人工修改：以后再生成的草稿与它不一致时不会覆盖它。version 不是现行版时拒绝：固定过的版本以 work_brief.fixed 拒绝。",
    "command", PERSON, object({ brief_id: id, expected_revision: revision, version: versionNumber, claim_id: id, text: nullableSchema(text(BRIEF_LIMITS.claim_text)) },
      ["brief_id", "expected_revision", "text"]), saved, { result: true }),
  resolve: define<BriefSaved>()("proposals.resolve", /* @version action.work-brief.proposals.resolve */ 1, "处理简报提案",
    "处理一份提案里与人工修改冲突的句子：choices 对每个冲突的 claim_id 选 mine（保留本人的写法）或 theirs（采用草稿的写法），必须每处都选；全部处理完，提案成为简报新的一版。discard 为 true 时放弃整份提案，简报不变。",
    "command", PERSON, object({ brief_id: id, proposal_id: id, expected_revision: revision, discard: { type: "boolean" },
      choices: array(object({ claim_id: id, take: { enum: ["mine", "theirs"] } })) }, ["brief_id", "proposal_id", "expected_revision"]), saved, { result: true }),
  fix: define<{ brief: BriefRecord; version: BriefVersion; artifact: { artifact_id: string; version: number } }>()("versions.fix", /* @version action.work-brief.versions.fix */ 1, "固定简报版本",
    "把简报的一版（默认现行版）固定下来并发成成果，供留存、引用和分享；之后这一版只读，后续刷新与修改都不改它。已固定的版本再固定返回原来的成果。",
    "command", PERSON, object({ brief_id: id, version: versionNumber, expected_revision: revision }, ["brief_id", "expected_revision"]),
    object({ brief, version, artifact: object({ artifact_id: id, version: versionNumber }) }), { concurrent: true, result: true, artifact: true }),
  runNext: define<{ mark: NextMark }>()("next.run", /* @version action.work-brief.next.run */ 1, "执行简报的下一步",
    "本人点了现行版里的一条下一步：以本人身份执行它准备好的那个动作，结果记在这条下一步上。它针对的对象在简报保存之后变过、或动作已不可用时不执行，以 work_brief.option_stale 拒绝。一条下一步只执行一次。",
    "command", PERSON, object({ brief_id: id, option_id: id }), object({ mark: loose }), { concurrent: true }),
  setNext: define<{ marks: NextMark[] }>()("next.set", /* @version action.work-brief.next.set */ 1, "处置简报的下一步",
    "标一条下一步「暂不」（later）、记下已交给助理（handed），或撤回这个标记（state 为 null）。已执行过的不能改；结果未确认的（unknown）只能在本人到原处核对后撤回。只记这条下一步在这份简报里怎么处置了，不改任何业务对象。",
    "command", PERSON, object({ brief_id: id, option_id: id, state: nullableSchema({ enum: ["later", "handed"] }) }), object({ marks: array(loose) })),
};

/** One line of the personal brief: something that waits for the person, with where it is from. */
export interface PersonalItem {
  label: "project" | "personal";
  kind: "attention" | "next" | "source";
  text: string;
  why?: string;
  /** For a project's line: the project and the brief it is in. The page links to that project's home; the shell opens it (S-47), nothing of the project is read from here. */
  project_id?: string;
  brief_id?: string;
  subject?: { kind: string; id: string };
  owner_plugin_id?: string;
  owner_name?: OwnedTextRef;
  blocked?: true;
}
export interface PersonalView { as_of: string | null; version: number; items: PersonalItem[]; sources: BriefVersion["sources"]; projects_complete: boolean }

export const workBriefPersonalActions = {
  get: define<PersonalView>()("personal.get", /* @version action.work-brief.personal.get */ 1, "读取个人简报",
    "个人事项的汇总：本人够得到的各项目简报里要你处理的和还没处置的下一步（每项带「项目」标签、所在项目与简报），加上个人范围的插件上次刷新时读到的事项（带「个人」标签）。只读已保存的内容，不重读来源。",
    "query", PERSON, object({}), loose, { scope: "home", reach: true, concurrent: true }),
  refresh: define<PersonalView & { changed: boolean; changes: BriefChange[] }>()("personal.refresh", /* @version action.work-brief.personal.refresh */ 1, "刷新个人简报",
    "不调用模型：以本人身份重读个人范围的各来源；有变化才存成个人简报新的一版，changes 只报变化。读不到的标过期或缺口。",
    "command", PERSON, object({}), loose, { scope: "home", reach: true, concurrent: true }),
};
