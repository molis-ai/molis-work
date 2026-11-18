import { choosableRoles, roleKey } from "./assistant-characters.js";
import { format } from "@molis-ai/molis-work-plugin-sdk/ui";
import { signedRoleData, SIGNED_MATERIAL_NOTICE, type MethodHandoff } from "./assistant-signed-materials.js";
import type { AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ConversationAttachment } from "@molis-ai/molis-work-contracts/services/materials";
import { isSubjectReader, type ActionSubjectContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantDelegations } from "./assistant-delegation.js";
import type { AssistantMethod, AssistantMethodSelection, AssistantContextSnapshot, AssistantMaterial, AssistantMaterialText } from "@molis-ai/molis-work-contracts/services/assistant";
import { ASSISTANT_METHOD_ACTIONS } from "./assistant-rule-actions.js";
import { SKILL_ROUND_AUTO_LIMIT, SKILLS_PROVIDER_ID, skillCatalogActions } from "@molis-ai/molis-work-contracts/services/skills";
import { capabilityDirectory, knowledgeDirectory, knowledgeFact } from "./assistant-directory.js";
import { identity } from "./assistant-relations.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import type { AssistantJobs } from "./assistant-jobs.js";
import { assistantErrors } from "./assistant-errors.js";
import { randomUUID } from "node:crypto";
import type { MemoryService } from "@molis-ai/molis-work-service-memory";
import type { PersonActions } from "./assistant-executor.js";
import { landingMaterials } from "./assistant-landing.js";
import { formatExternalSessionObjectBackground, formatExternalSessionReferenceText, formatPageContextLines, formatSentMaterialBlock, isExternalSessionMaterial, isExternalSessionObject } from "./assistant-external-sessions.js";
import { readPickedPiece } from "./assistant-send-materials.js";
import { skillChoiceRow, skillRefKey } from "@molis-ai/molis-work-plugin-sdk/skill-ref";
import { belongsElsewhere, whereNow, type AssistantServicePorts, type RoundMaterials } from "./assistant-service-shared.js";
import { RELATION_WORDS, describeObjects } from "./assistant-present.js";
import type { AssistantWorkReads } from "./assistant-work-reads.js";
import type { AssistantMemoryBridge } from "./assistant-memory-bridge.js";
import { promptTitle } from "./assistant-work-title.js";

/** One chosen or listed method, whatever else the page sent with it: a Skill by its installation and id, a role by its installation and entry. */
function methodKey(method: AssistantMethodSelection | AssistantMethod): string {
  if (method.kind === "role") return `role\0${method.installation.install_id}\0${method.method_id}`;
  // The shared comparison key (`/skill-ref`): a Skill's identity is its whole exact reference, not an id two versions share.
  return `skill\0${skillRefKey("skill" in method ? method.skill.ref : method.ref)}`;
}

/** The most of one attached document's text a Send carries (all of a Send's materials together are bounded in assistant-send-materials.ts). */
const MAX_ATTACHMENT_TEXT = 60_000;

/** How much of a material text the person gets back to look at (what a round may give the model). */
const MATERIAL_PREVIEW_CHARS = 20_000;

/** Split a long text into materials the runtime accepts (each at most 20,000 characters with its header). */
function chunked(base: Pick<AgentTextMaterial, "title">, id: string, text: string): AgentTextMaterial[] {
  const size = 18_000;
  const parts = Math.max(1, Math.ceil(text.length / size));
  return Array.from({ length: parts }, (_, index) => ({ material_id: parts === 1 ? id : `${id}.${index + 1}`,
    title: parts === 1 ? base.title : `${base.title}（${index + 1}/${parts}）`, text: text.slice(index * size, (index + 1) * size) }));
}

type AssistantRoundMaterialsLinks = Pick<AssistantWorkReads, "workObjects" | "related" | "methods" | "readRole" | "readSkills"> & Pick<AssistantMemoryBridge, "memoryTools"> & { jobs: Pick<AssistantJobs, "material">; delegations: Pick<AssistantDelegations, "material"> };

/**
 * What a round is given and what the person brings: the round's situation as marked data, objects read again from
 * their owners, “@” references and “/” methods, attachments and pictures. Only its ports reach the Host; the other
 * collaborators come through `link`.
 */
export class AssistantRoundMaterials {
  constructor(private readonly store: Pick<AssistantStore, "cards" | "confirmAlways" | "delegatedBy" | "get" | "relations" | "rounds" | "undos" | "unsettled">, private readonly ports: AssistantServicePorts, private readonly actorId: string, private readonly now: () => Date, private readonly starting: Map<string, string>, private readonly chosenMemory: Map<string, Awaited<ReturnType<MemoryService["forRun"]>>>, private readonly link: AssistantRoundMaterialsLinks) {}

  /** The round's situation and the person's materials, as marked data. Changing facts travel here, not in the role. */
  async roundMaterials(work: StoredWork, materials: AssistantMaterial[], context: AssistantContextSnapshot | null, offered: readonly ActionView[], unavailable: readonly ActionView[], previousWaitWithdrawn: boolean,
    /** False for 「这次不用技能」: the automatic Skills are not listed, as the catalog would refuse them. */
    autoSkills = true): Promise<RoundMaterials> {
    const zone = this.ports.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = this.now();
    const local = format.date(now.toISOString(), "datetime", { time_zone: zone });
    const where = work.scope.kind === "personal" ? "个人工作（不属于任何项目，使用个人范围的能力）"
      : `项目「${(await this.ports.projectTitle?.(work.scope.project_id).catch(() => null)) ?? work.scope.project_id}」中的工作（只使用这个项目的能力与资料）`;
    // Pictures ride only on the round they came with; history keeps the words, so say what the model saw back then.
    const pictured = [...new Set(this.store.rounds(work.work_id).flatMap(round => round.materials.filter(item => item.kind === "image").map(item => item.title)))];
    const situation = [`现在是 ${local}（时区 ${zone}，${now.toISOString()}）。`, `这项工作：「${promptTitle(work)}」，${where}。`,
      work.origin ? `工作最初从「${work.origin.title ?? work.origin.surface}」页面发起。` : "",
      pictured.length ? `之前的轮次里用户附过图片（${pictured.slice(0, 5).map(title => `「${title}」`).join("、")}），你当时看到了图；图片只在附带的那一轮可见，现在看不到。` : "", knowledgeFact(this.ports, work.scope.kind === "project" ? work.scope.project_id : null, offered)].filter(Boolean).join("\n");
    const setup = this.ports.setupMaterial?.(work, offered, previousWaitWithdrawn), out: AgentTextMaterial[] = [{ material_id: "situation", title: "本轮情况", text: situation }, ...(setup ? [setup] : [])];
    // What this round tells that is told only once: marked after the round has started, not before (a start that fails tells nothing).
    const told = { undos: [] as string[], unsettled: [] as string[] };
    // What the person did with earlier suggestions since the last round: the next round goes on from there.
    const since = this.store.rounds(work.work_id).at(-1)?.started_at ?? "";
    const handled = this.store.cards(work.work_id).filter(card => card.updated_at > since && ["done", "failed", "unknown", "dismissed", "stale"].includes(card.status));
    if (handled.length) out.push(...chunked({ title: "用户对建议的处理" }, "cards", handled.map(card => `- 「${card.title}」：${{ done: "已执行", failed: "执行失败", unknown: "结果未确认", dismissed: "用户忽略", stale: "已失效" }[card.status as "done"]}${card.outcome ? `（${card.outcome.slice(0, 300)}）` : ""}`).join("\n")));
    // Changes the person took back since (the base says what follows from that).
    const undone = this.store.undos(this.actorId, work.work_id).filter(item => item.state === "undone" && !item.told);
    if (undone.length) {
      out.push(...chunked({ title: "用户撤销的修改" }, "undone", ["下面这些你做过的修改，用户已经撤销：",
        ...undone.map(item => `- 「${item.title}」（${item.undone_at ?? ""}）`)].join("\n")));
      told.undos = undone.map(item => item.undo_id);
    }
    // Sub-tasks the person took back since the last round (the work layer says this work finishes those parts itself).
    const takenBack = this.store.delegatedBy(this.actorId, work).filter(child => (child.delegated_by?.taken_back_at ?? "") > since);
    if (takenBack.length) {
      const lines = takenBack.map(child => {
        const made = this.store.relations.forWork(identity(child)).filter(row => row.relation === "result").map(row => `${row.object.kind} ${row.object.id}`);
        return `- 「${child.title}」（验收标准：${child.delegated_by!.acceptance.slice(0, 300)}）${made.length ? `；它已产出：${made.slice(0, 5).join("、")}` : "；它还没有产出"}`;
      });
      out.push(...chunked({ title: "用户收回的子任务" }, "taken-back", ["用户把下面的子任务收回到这项工作，它们已停下，已产出的成果保留：",
        ...lines].join("\n")));
    }
    // Background work it started: those still running, and those that ended since its latest round began.
    const jobs = await this.link.jobs.material(work).catch(() => undefined);
    if (jobs) out.push(...chunked({ title: "后台任务" }, "jobs", jobs));
    // What its sub-tasks handed back that it has not had yet (marked with the rest once the round has started).
    const handed = await this.link.delegations.material(work);
    if (handed) out.push(handed);
    // Professional roles this work may hand a part to (choosable here now): delegation names one by its id.
    if (!work.delegated_by && this.ports.characters && work.executor.kind !== "plugin") {
      const catalog = await this.ports.characters(work.project_ref ?? null).catch(() => null), roles = catalog ? choosableRoles(catalog) : [];
      if (roles.length) out.push(...chunked({ title: "可委托的专业角色" }, "roles",
        roles.map(item => `- 「${item.title}」（id：${roleKey(item.ref)}）`).join("\n")));
    }
    // What the person selected on a page when it prepared a card here: kept for the rounds that follow.
    const selected = this.store.cards(work.work_id).filter(card => card.from && card.materials?.length).slice(-2);
    if (selected.length) out.push(...chunked({ title: "用户在页面上选中的内容" }, "page-selection", selected.map(card =>
      [`「${card.from!.title ?? card.from!.surface}」页面为操作卡「${card.title}」带来的选中内容：`,
        ...card.materials!.map(item => `《${item.title}》\n${item.text.slice(0, 4000)}`)].join("\n")).join("\n\n")));
    // What the person asked to be remembered reaches the round as Prologue memory-recall data (memoryForRound), not here;
    // only what did not come along is said, so the round can tell the person honestly.
    const left = this.chosenMemory.get(work.work_id)?.omitted ?? [];
    if (left.length) {
      const budget = left.filter(item => item.reason !== "conflict").length, conflicts = left.length - budget;
      out.push(...chunked({ title: "没有带上的记忆" }, "memory-left",
        `和这一轮相关的记忆里，${budget ? `有 ${budget} 条因为篇幅没有带上` : ""}${budget && conflicts ? "，" : ""}${conflicts ? `有 ${conflicts} 条和另一条互相矛盾、带上的是用户明确说过的那条` : ""}。`));
    }
    // Forming memories switched off: the round is told, and where the person turns it on (the work layer says what follows).
    if (!work.delegated_by && this.ports.memory?.() && !this.link.memoryTools(work)?.remember) out.push(...chunked({ title: "记忆设置" }, "memory-off",
      "用户关闭了“允许记住”（在 设置 · 个人 · 记忆 打开），这一轮不能保存长期记忆或留下建议。"));
    // Changes a stopped round left running, and how each ended (the base says not to submit an unsettled one again blindly).
    const unsettled = this.store.unsettled(this.actorId, work.work_id, true);
    if (unsettled.length) {
      const words = { pending: "还没有结果", completed: "停止后已完成", failed: "停止后失败", "not-run": "停止时还没开始，没有执行" };
      out.push(...chunked({ title: "上一轮停止时仍在执行的修改" }, "unsettled", unsettled.map(change => `- 「${change.title}」：${words[change.state]}${change.detail ? `（${change.detail}）` : ""}`).join("\n")));
      told.unsettled = unsettled.filter(change => change.state !== "pending").map(change => change.change_id);
    }
    const objects = await this.link.workObjects(work);
    if (objects.length) out.push(...chunked({ title: "这项工作的对象" }, "objects", describeObjects(objects)));
    // Work a professional Agent did for this work comes back here: its session, as its owner reports it.
    for (const object of objects.filter(item => item.relation === "session" && item.state !== "missing")) {
      const progress = await this.objectBackground(work, { kind: object.subject.kind, id: object.subject.id });
      if (progress) out.push(...chunked({ title: `专业会话的进展：${object.title}` }, `session-${object.subject.id}`, progress));
    }
    const directory = await knowledgeDirectory(this.ports, work.scope.kind === "project" ? work.scope.project_id : null, offered, `${work.title}\n${this.starting.get(work.work_id) ?? ""}`);
    try {
    for (const [title, id, text] of [["可用能力目录", "capabilities", capabilityDirectory(offered, unavailable, this.store.confirmAlways(this.actorId))], ["项目资料目录", "knowledge", directory.text]] as const) if (text) out.push(...chunked({ title }, id, text));
    // Methods Plugins offer: listed, not loaded. A round that needs one reads it; one the person chose is already here.
    // A manual Skill nobody chose is not listed (the catalog refuses it unnamed); only an auto one is readable by this round.
    const methods = work.executor.kind === "plugin" ? [] : await this.link.methods(work).catch(() => [] as AssistantMethod[]);
    const chosen = new Set(materials.flatMap(item => item.kind === "method" && item.method ? [methodKey(item.method)] : []));
    const listed: object[] = [];
    for (const method of methods.filter(item => !chosen.has(methodKey(item)) && (item.kind !== "skill" || (autoSkills && item.skill.state === "auto"))).slice(0, 20)) {
      const row = method.kind === "skill" ? { kind: "skill", ...skillChoiceRow(method.skill), plugin_title: method.skill.pack.title } : method;
      if (JSON.stringify([...listed, row]).length > 18_000) break;
      listed.push(row);
    }
    const skillRead = skillCatalogActions.readBodies;
    if (listed.length) out.push({ material_id: "methods", title: "可用角色资料与方法", text:
      `按需读取资料：方法（kind 为 skill）用 read-capability，capability_id 为 ${skillRead.capability_id}，version 为 ${skillRead.version}，provider_id 为 ${SKILLS_PROVIDER_ID}，input 是对象，例如 {"refs":[目录中的完整 ref]}。` +
      `方法由你按这一轮的任务自己挑：对照 description、when_to_use 和 when_not_to_use，只读真正用得上的，一轮最多 ${SKILL_ROUND_AUTO_LIMIT} 个（再多会被拒绝为 over_limit）；都不合适就不读。用户点名的方法已经在这一轮里，优先按它做，不占这个名额。` +
      `角色资料（kind 为 role）用 read-capability 的 capability_id 为 ${ASSISTANT_METHOD_ACTIONS.read.capability_id}，version 为 ${ASSISTANT_METHOD_ACTIONS.read.version}，provider_id 为 ${ASSISTANT_METHOD_ACTIONS.read.provider_id}。input 是对象，例如 {"method_id":"signed/role-id"}，必须附目录中的完整 default_ref 和 installation。\n` +
      SIGNED_MATERIAL_NOTICE + "\n" + JSON.stringify(listed) });
    // The object the person is on, as its owner has it: where it stands and what it belongs to. The page's claim is
    // only a pointer; this is read again from the owner, so a work started in the plugin continues with its background.
    if (context?.object) {
      const background = await this.objectBackground(work, context.object);
      if (background) out.push(...chunked({ title: "当前对象（所有者提供）" }, "object", background));
    }
    if (context) {
      const page = formatPageContextLines(context);
      out.push(...chunked({ title: page.title }, "page", page.text), ...await landingMaterials(this.ports, work.scope.kind === "personal" ? null : work.scope.project_id, context));
    }
    for (const material of materials) {
      if (material.method?.kind === "role") {
        if (!material.text || material.text.length > 20_000) throw assistantErrors.invalid("签名资料正文超过单份材料预算，请减少内容后重发");
        out.push({ material_id: `signed-${material.material_id}`, title: material.title, text: material.text }); continue;
      }
      const formatted = formatSentMaterialBlock(material);
      out.push(...chunked({ title: formatted.title }, `material-${material.material_id}`, formatted.text));
    }
    const signed = out.filter(item => item.material_id.startsWith("signed-"));
    const assembled = [...out.filter(item => !item.material_id.startsWith("signed-")).slice(0, 30 - signed.length), ...signed];
    const knowledgeDispatch = assembled.some(item => item.material_id === "knowledge" || item.material_id.startsWith("knowledge.")) ? directory.control : undefined;
    if (!knowledgeDispatch) directory.control?.dispose();
    return { materials: assembled, told, ...(knowledgeDispatch ? { knowledgeDispatch } : {}) };
    } catch (error) { directory.control?.dispose(); throw error; }
  }

  /** One object as its owner has it now: its context, "missing" when the owner says it is gone, null when unreadable. */
  async readSubject(work: StoredWork, subject: { kind: string; id: string }): Promise<ActionSubjectContext | "missing" | null> {
    let actions: PersonActions | null = null;
    try { actions = await this.ports.scopeActions?.(work) ?? null; } catch { return null; }
    if (!actions) return null;
    const reader = (await actions.discover().catch(() => [] as ActionView[])).find(view => isSubjectReader(view.action) && view.availability.available && view.action.subject_kinds.includes(subject.kind));
    if (!reader) return null;
    try { return await actions.invoke({ capability_id: reader.capability_id, version: reader.version, provider_id: reader.provider.provider_id }, { subject_id: subject.id }) as ActionSubjectContext; }
    catch (error) { return /not_found|missing|deleted/.test((error as { code?: string }).code ?? "") ? "missing" : null; }
  }

  /** One object as its owner has it now, with the Goals and other works it belongs to; null when it cannot be read. */
  private async objectBackground(work: StoredWork, object: { kind: string; id: string; version?: string | number }): Promise<string | null> {
    let actions: PersonActions | null = null;
    try { actions = await this.ports.scopeActions?.(work) ?? null; } catch { return null; }
    if (!actions) return null;
    const offered = await actions.discover().catch(() => [] as ActionView[]);
    const readers = offered.filter(view => isSubjectReader(view.action) && view.availability.available);
    const read = async (kind: string, id: string): Promise<ActionSubjectContext | null> => {
      const reader = readers.find(view => view.action.subject_kinds.includes(kind));
      if (!reader) return null;
      try { return await actions!.invoke({ capability_id: reader.capability_id, version: reader.version, provider_id: reader.provider.provider_id }, { subject_id: id }) as ActionSubjectContext; }
      catch { return null; }
    };
    const found = await read(object.kind, object.id);
    if (isExternalSessionObject(object)) return formatExternalSessionObjectBackground(found);
    const context = found && belongsElsewhere(work, found) ? null : found;
    if (!context) {
      const moved = await whereNow(work, actions, object);
      return moved ? `「${moved.title}」已被移到${moved.to.kind === "personal" ? "个人空间" : "项目"}「${moved.to.title}」。这项工作的范围读不到它现在的正文；需要时请用户到那里打开，或把它放回这个项目。` : null;
    }
    const goals = (await Promise.all((context.goal_ids ?? []).slice(0, 5).map(async id => (await read("goal", id))?.title ?? id)));
    const others = (await this.link.related(identity(work).project_id, { kind: object.kind, id: object.id })).filter(row => row.work_id !== work.work_id).slice(0, 5);
    const claimed = object.version === undefined ? null : String(object.version);
    return [`${context.title}（${object.kind}，标识 ${object.id}），当前版本 ${context.revision}${claimed && claimed !== context.revision ? `（页面显示的是版本 ${claimed}）` : ""}。`,
      goals.length ? `关联目标：${goals.join("、")}` : "",
      others.length ? `与它相关的其他工作：${others.map(row => `「${row.title}」（${RELATION_WORDS[row.relation]}，${row.state}）`).join("；")}` : "",
      `正文${context.truncated ? "（节选，完整内容可用读取能力获取）" : ""}：\n${context.content.slice(0, 6000)}`].filter(Boolean).join("\n");
  }

  /**
   * Objects the person picked with “@”. Each hit is checked again with its owner (search.open: still there, still
   * readable, its current version), then read through the owner's reader when it has one. Without a reader only the
   * title and the search snippet go, said as such. The person's explicit pick is what lets it in: a source the
   * Assistant's own search could not reach (the local person's clipboard) is carried only this way.
   */
  async readReferences(work: StoredWork, materials: AssistantMaterial[]): Promise<AssistantMaterial[]> {
    let actions: PersonActions | null = null;
    try { actions = await this.ports.scopeActions?.(work) ?? null; } catch { actions = null; }
    if (!actions) throw assistantErrors.unsupported("现在读不到引用的内容，请稍后再试或去掉引用");
    const views = await actions.discover().catch(() => [] as ActionView[]);
    const opener = views.find(view => view.capability_id === "search.open" && view.availability.available);
    const readers = views.filter(view => isSubjectReader(view.action) && view.availability.available);
    const out: AssistantMaterial[] = [];
    for (const material of materials) {
      if (!material.reference || !material.object || "material" in material.reference || "subject" in material.reference) { out.push(material.reference && "subject" in material.reference ? await readPickedPiece(actions, views, { ...material, reference: material.reference }) : material); continue; }
      if (!opener) throw assistantErrors.unsupported(`现在不能核对「${material.title}」，请稍后再试或去掉这个引用`);
      const opened = await actions.invoke({ capability_id: opener.capability_id, version: opener.version, provider_id: opener.provider.provider_id }, { hit_id: material.reference.hit_id })
        .catch((error: unknown) => ({ state: "unavailable" as const, reason: error instanceof Error ? error.message : String(error) })) as
        { state: "ok"; subject: { kind: string; id: string }; title: string; revision: string } | { state: "missing" | "unavailable"; reason: string };
      if (opened.state !== "ok") {
        const moved = opened.state === "missing" ? await whereNow(work, actions, material.object) : null;
        if (moved) throw assistantErrors.invalid(`引用的「${material.title}」已被移到${moved.to.kind === "personal" ? "个人空间" : "项目"}「${moved.to.title}」，这项工作读不到它；去掉引用，或在那里继续`);
        throw assistantErrors.invalid(`引用的「${material.title}」${opened.state === "missing" ? "已不存在" : "现在读不到"}（${opened.reason}）；去掉它或重新选择后再发`);
      }
      const subject = opened.subject, reader = readers.find(view => view.action.subject_kinds.includes(subject.kind));
      let context: ActionSubjectContext | null = null;
      if (reader) {
        try { context = await actions.invoke({ capability_id: reader.capability_id, version: reader.version, provider_id: reader.provider.provider_id }, { subject_id: subject.id }) as ActionSubjectContext; }
        catch { context = null; }
      }
      const where = material.source?.title ?? material.source?.plugin_id ?? "搜索";
      const text = isExternalSessionObject(subject) ? formatExternalSessionReferenceText(context, material.text)
        : context ? `用户用“@”引用的对象，已向${where}重新读取（版本 ${context.revision}${context.truncated ? "，正文为节选" : ""}）。\n${context.content.slice(0, 12_000)}`
        : `用户用“@”引用的对象。${where}没有提供正文读取，下面只是搜索结果里的摘要，不是全文：\n${material.text ?? "（没有摘要）"}`;
      out.push({ ...material, title: opened.title || material.title, object: { kind: subject.kind, id: subject.id, version: context?.revision ?? opened.revision, title: opened.title || material.title }, text });
    }
    return out;
  }

  /**
   * What the person chose with “/”: each body goes with this round, said as their choice. The Skills they chose are this round's named
   * list, read together in one catalog read; role material is read from its signed installation.
   */
  async chosenMethods(work: StoredWork, materials: AssistantMaterial[], handoffs: MethodHandoff[] = []): Promise<AssistantMaterial[]> {
    // A work an executor carries hands its Skills over by reference (§2.3): the executor's round reads them, as itself, not this one.
    const handedOver = work.executor.kind === "plugin";
    const refs = handedOver ? [] : [...new Map(materials.flatMap(item => item.kind === "method" && item.method?.kind === "skill" ? [[methodKey(item.method), item.method.ref] as const] : [])).values()];
    const names = new Map(materials.flatMap(item => item.kind === "method" && item.method?.kind === "skill" && item.method.name ? [[skillRefKey(item.method.ref), item.method.name] as const] : []));
    const read = refs.length ? await this.link.readSkills(work, refs, names) : undefined;
    if (read) handoffs.push(read.handoff);
    const out: AssistantMaterial[] = [];
    for (const material of materials) {
      const chosen = material.kind === "method" ? material.method : undefined;
      if (!chosen || (chosen.kind === "skill" && handedOver)) { out.push(material); continue; }
      if (chosen.kind === "skill") {
        const skill = read!.skills.find(item => methodKey({ kind: "skill", ref: item.ref }) === methodKey(chosen))!;
        out.push({ ...material, title: `方法：${skill.name}`, method: { kind: "skill", ref: skill.ref, name: skill.name },
          text: `用户为这一轮选定的方法「${skill.name}」（v${skill.ref.version}）。这一轮按它的步骤做：\n${skill.body}` });
        continue;
      }
      const role = await this.link.readRole(work, chosen);
      handoffs.push(role.handoff);
      out.push({ ...material, title: "角色资料", method: { kind: "role", method_id: role.method_id, version: role.version, name: role.name, plugin_title: role.plugin_title,
        default_ref: role.default_ref, installation: role.installation, effective: role.effective, user_revision: role.user_revision }, text: signedRoleData(role) });
    }
    return out;
  }

  /**
   * A file the person brings, kept by the platform's material service as a conversation attachment (platform capability audit §6):
   * a picture (PNG, JPEG, GIF, WebP, by its bytes) is kept as it is, for the model to see in the round it goes with; any other file
   * is read once by the platform's readers (PDF, Word, text, a picture's words, a recording's transcript) into bounded text for this
   * Send's materials. What cannot be read says why (scanned, encrypted, damaged, a kind no reader takes); nothing is guessed.
   */
  async readAttachment(input: { name: string; data: string }, control: { signal?: AbortSignal; beforeEffect?: () => void | Promise<void> } = {}): Promise<AssistantMaterial & { pages?: number; truncated?: boolean }> {
    const name = typeof input?.name === "string" ? input.name.trim().slice(0, 200) : "";
    if (!name || typeof input.data !== "string" || !input.data) throw assistantErrors.invalid("没有收到文件");
    const attachments = this.ports.attachments;
    if (!attachments) throw assistantErrors.unsupported("当前环境不能保存附件");
    const said = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^[A-Z_]+:\s*/, "");
    let attached: ConversationAttachment;
    try { attached = await attachments.attach({ file_name: name, data_base64: input.data }, control); }
    catch (error) { throw (error as { code?: string }).code === "material.attachment.unsupported" ? assistantErrors.unsupported(said(error)) : assistantErrors.invalid(said(error)); }
    if (attached.kind === "image") {
      return { material_id: `image-${randomUUID()}`, kind: "image", title: name, explicit: true,
        image: { attachment: attached.ref, media_type: attached.media_type, byte_length: attached.byte_length } };
    }
    const read = await attachments.read(attached.ref, { as: "text", ...(control.signal ? { signal: control.signal } : {}) }).catch(error => { throw assistantErrors.invalid(said(error)); });
    const whole = read.text ?? "";
    if (!whole.trim()) throw assistantErrors.invalid(`「${name}」里没有读到文字${attached.text?.issues.length ? `（${attached.text.issues.slice(0, 2).join("；")}）` : ""}`);
    const text = whole.slice(0, MAX_ATTACHMENT_TEXT), truncated = whole.length > MAX_ATTACHMENT_TEXT || attached.text?.truncated === true;
    const pages = attached.text?.pages ?? undefined;
    const note = pages ? `${pages} 页${truncated ? "，只取了前面一部分" : ""}` : truncated ? "只取了前面一部分" : "";
    return { material_id: `file-${randomUUID()}`, kind: "file", title: name + (note ? `（${note}）` : ""),
      text, explicit: true, ...(pages ? { pages } : {}), ...(truncated ? { truncated: true } : {}) };
  }

  /** One material a round of this work brought, with its text (bounded), for the person to look at again. */
  material(workId: string, materialId: string): AssistantMaterialText {
    const work = this.store.get(this.actorId, workId);
    const found = this.store.rounds(work.work_id).flatMap(round => round.materials).find(item => item.material_id === materialId);
    if (!found) throw assistantErrors.not_found("这项工作里没有这份材料");
    const text = typeof found.text === "string" ? found.text
      : isExternalSessionMaterial(found) ? "（外部会话内容仅在发送当轮提供给模型，不在助理记录中留存原文）" : undefined;
    // A page brought from the browser says where it came from on its first line.
    const url = text?.match(/^来源：\s*(https?:\/\/\S+)/u)?.[1];
    return { material_id: found.material_id, kind: found.kind, title: found.title,
      ...(text !== undefined ? { text: text.slice(0, MATERIAL_PREVIEW_CHARS), ...(text.length > MATERIAL_PREVIEW_CHARS ? { truncated: true } : {}) } : {}),
      ...(url ? { url } : {}), ...(found.source ? { source: { ...found.source } } : {}), ...(found.object ? { object: { ...found.object } } : {}), ...(found.draft ? { draft: true } : {}) };
  }

  /** A picture a work carried, read back for the side panel from the platform's attachments. */
  async materialImage(workId: string, materialId: string): Promise<{ media_type: string; data: string }> {
    const work = this.store.get(this.actorId, workId);
    const found = this.store.rounds(work.work_id).flatMap(round => round.materials).find(item => item.material_id === materialId && item.kind === "image" && item.image);
    if (!found?.image) throw assistantErrors.not_found("这项工作里没有这张图片");
    const gone = assistantErrors.expired("这张图片已不在了，需要时请重新添加这张图片。");
    if (!this.holdsImage(found.image) || !this.ports.attachments) throw gone;
    const read = await this.ports.attachments.read(found.image.attachment, { as: "image" }).catch(() => { throw gone; });
    if (!read.image) throw gone;
    return { media_type: read.image.media_type, data: Buffer.from(read.image.bytes).toString("base64") };
  }

  /** Whether a picture's bytes are still kept; a record from before attachments were kept names none. */
  holdsImage(image: NonNullable<AssistantMaterial["image"]>): boolean {
    return !!this.ports.attachments?.holds(image.attachment);
  }
}
