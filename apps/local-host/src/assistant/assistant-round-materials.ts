import type { AgentDocumentCapability, AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import { isSubjectReader, type ActionSubjectContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantDelegations } from "./assistant-delegation.js";
import type { AssistantMethod, AssistantContextSnapshot, AssistantMaterial, AssistantMaterialText } from "@molis-ai/molis-work-contracts/services/assistant";
import { ASSISTANT_RULES_PROVIDER } from "./assistant-rule-actions.js";
import { capabilityDirectory, knowledgeDirectory, knowledgeFact } from "./assistant-directory.js";
import { identity } from "./assistant-relations.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import type { AssistantJobs } from "./assistant-jobs.js";
import { assistantErrors } from "./assistant-errors.js";
import { randomUUID } from "node:crypto";
import type { MemoryService } from "@molis-ai/molis-work-service-memory";
import type { PersonActions } from "./assistant-executor.js";
import { landingMaterials } from "./assistant-landing.js";
import { readPickedPiece } from "./assistant-send-materials.js";
import { RUNTIME, belongsElsewhere, whereNow, type AssistantServicePorts, type RoundMaterials } from "./assistant-service-shared.js";
import { RELATION_WORDS, describeObjects } from "./assistant-present.js";
import type { AssistantWorkReads } from "./assistant-work-reads.js";
import type { AssistantMemoryBridge } from "./assistant-memory-bridge.js";

/** Bytes per image, within what the model providers take; how many per Send is in assistant-send-materials.ts. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** How much of a material text the person gets back to look at (what a round may give the model). */
const MATERIAL_PREVIEW_CHARS = 20_000;

/** PNG, JPEG, GIF or WebP, by the bytes themselves. */
function looksLikeImage(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 12).toString("latin1");
  return head.startsWith("\x89PNG\r\n\x1a\n") || bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff || head.startsWith("GIF8") || head.startsWith("RIFF") && head.slice(8, 12) === "WEBP";
}

/** Split a long text into materials the runtime accepts (each at most 20,000 characters with its header). */
function chunked(base: Omit<AgentTextMaterial, "text" | "material_id">, id: string, text: string): AgentTextMaterial[] {
  const size = 18_000;
  const parts = Math.max(1, Math.ceil(text.length / size));
  return Array.from({ length: parts }, (_, index) => ({ ...base, material_id: parts === 1 ? id : `${id}.${index + 1}`,
    title: parts === 1 ? base.title : `${base.title}（${index + 1}/${parts}）`, text: text.slice(index * size, (index + 1) * size) }));
}

export type AssistantRoundMaterialsLinks = Pick<AssistantWorkReads, "workObjects" | "related" | "methods" | "readMethod"> & Pick<AssistantMemoryBridge, "memoryTools"> & { jobs: Pick<AssistantJobs, "material">; delegations: Pick<AssistantDelegations, "material"> };

/**
 * What a round is given and what the person brings: the round's situation as marked data, objects read again from
 * their owners, “@” references and “/” methods, attachments and pictures. Only its ports reach the Host; the other
 * collaborators come through `link`.
 */
export class AssistantRoundMaterials {
  constructor(private readonly store: Pick<AssistantStore, "cards" | "confirmAlways" | "delegatedBy" | "get" | "relations" | "rounds" | "undos" | "unsettled">, private readonly ports: AssistantServicePorts, private readonly actorId: string, private readonly now: () => Date, private readonly starting: Map<string, string>, private readonly chosenMemory: Map<string, Awaited<ReturnType<MemoryService["forRun"]>>>, private readonly link: AssistantRoundMaterialsLinks) {}

  /** Images this person brought while this runtime lives: a Send may only name one of these. */
  readonly images = new Map<string, { revision: number; media_type: string }>();

  /** The round's situation and the person's materials, as marked data. Changing facts travel here, not in the role. */
  async roundMaterials(work: StoredWork, materials: AssistantMaterial[], context: AssistantContextSnapshot | null, offered: readonly ActionView[], unavailable: readonly ActionView[], previousWaitWithdrawn: boolean): Promise<RoundMaterials> {
    const knowledgeGuards: Array<(views: readonly ActionView[]) => Promise<void>> = [];
    const zone = this.ports.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = this.now();
    const local = new Intl.DateTimeFormat("zh-CN", { timeZone: zone, dateStyle: "full", timeStyle: "short" }).format(now);
    const where = work.scope.kind === "personal" ? "个人工作（不属于任何项目，使用个人范围的能力）"
      : `项目「${(await this.ports.projectTitle?.(work.scope.project_id).catch(() => null)) ?? work.scope.project_id}」中的工作（只使用这个项目的能力与资料）`;
    // Pictures ride only on the round they came with; history keeps the words, so say what the model saw back then.
    const pictured = [...new Set(this.store.rounds(work.work_id).flatMap(round => round.materials.filter(item => item.kind === "image").map(item => item.title)))];
    const situation = [`现在是 ${local}（时区 ${zone}，${now.toISOString()}）。`, `这项工作：「${work.title}」，${where}。`,
      work.origin ? `工作最初从「${work.origin.title ?? work.origin.surface}」页面发起。` : "",
      pictured.length ? `之前的轮次里用户附过图片（${pictured.slice(0, 5).map(title => `「${title}」`).join("、")}），你当时看到了图；图片只在附带的那一轮可见，现在看不到。` : "", await knowledgeFact(this.ports, work.scope.kind === "project" ? work.scope.project_id : null, offered, knowledgeGuards)].filter(Boolean).join("\n");
    const base = { source_artifact_id: work.work_id, source_version: 1 };
    const setup = this.ports.setupMaterial?.(work, offered, previousWaitWithdrawn), out: AgentTextMaterial[] = [{ ...base, material_id: "situation", title: "本轮情况", text: situation }, ...(setup ? [setup] : [])];
    // What this round tells that is told only once: marked after the round has started, not before (a start that fails tells nothing).
    const told = { undos: [] as string[], unsettled: [] as string[] };
    // What the person did with earlier suggestions since the last round: the next round goes on from there.
    const since = this.store.rounds(work.work_id).at(-1)?.started_at ?? "";
    const handled = this.store.cards(work.work_id).filter(card => card.updated_at > since && ["done", "failed", "unknown", "dismissed", "stale"].includes(card.status));
    if (handled.length) out.push(...chunked({ ...base, title: "用户对建议的处理" }, "cards", handled.map(card => `- 「${card.title}」：${{ done: "已执行", failed: "执行失败", unknown: "结果未确认", dismissed: "用户忽略", stale: "已失效" }[card.status as "done"]}${card.outcome ? `（${card.outcome.slice(0, 300)}）` : ""}`).join("\n")));
    // Changes the person took back since (the base says what follows from that).
    const undone = this.store.undos(this.actorId, work.work_id).filter(item => item.state === "undone" && !item.told);
    if (undone.length) {
      out.push(...chunked({ ...base, title: "用户撤销的修改" }, "undone", ["下面这些你做过的修改，用户已经撤销：",
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
      out.push(...chunked({ ...base, title: "用户收回的子任务" }, "taken-back", ["用户把下面的子任务收回到这项工作，它们已停下，已产出的成果保留：",
        ...lines].join("\n")));
    }
    // Background work it started: those still running, and those that ended since its latest round began.
    const jobs = await this.link.jobs.material(work).catch(() => undefined);
    if (jobs) out.push(...chunked({ ...base, title: "后台任务" }, "jobs", jobs));
    // What its sub-tasks handed back that it has not had yet (marked with the rest once the round has started).
    const handed = await this.link.delegations.material(work, base);
    if (handed) out.push(handed);
    // Professional roles this work may hand a part to (published here, runnable now): delegation names one by its id.
    if (!work.delegated_by && work.project_ref && this.ports.characters && work.executor.kind !== "plugin") {
      const roles = (await this.ports.characters(work.project_ref).catch(() => [])).filter(item => item.available);
      if (roles.length) out.push(...chunked({ ...base, title: "可委托的专业角色" }, "roles",
        roles.map(item => `- 「${item.title}」 v${item.reference.version}（id：${item.reference.artifact_id}）`).join("\n")));
    }
    // What the person selected on a page when it prepared a card here: kept for the rounds that follow.
    const selected = this.store.cards(work.work_id).filter(card => card.from && card.materials?.length).slice(-2);
    if (selected.length) out.push(...chunked({ ...base, title: "用户在页面上选中的内容" }, "page-selection", selected.map(card =>
      [`「${card.from!.title ?? card.from!.surface}」页面为操作卡「${card.title}」带来的选中内容：`,
        ...card.materials!.map(item => `《${item.title}》\n${item.text.slice(0, 4000)}`)].join("\n")).join("\n\n")));
    // What the person asked to be remembered reaches the round as Prologue memory-recall data (memoryForRound), not here;
    // only what did not come along is said, so the round can tell the person honestly.
    const left = this.chosenMemory.get(work.work_id)?.omitted ?? [];
    if (left.length) {
      const budget = left.filter(item => item.reason !== "conflict").length, conflicts = left.length - budget;
      out.push(...chunked({ ...base, title: "没有带上的记忆" }, "memory-left",
        `和这一轮相关的记忆里，${budget ? `有 ${budget} 条因为篇幅没有带上` : ""}${budget && conflicts ? "，" : ""}${conflicts ? `有 ${conflicts} 条和另一条互相矛盾、带上的是用户明确说过的那条` : ""}。`));
    }
    // Forming memories switched off: the round is told, and where the person turns it on (the work layer says what follows).
    if (this.ports.memory?.() && !this.link.memoryTools(work)?.remember && !work.delegated_by) out.push(...chunked({ ...base, title: "记忆设置" }, "memory-off",
      "用户关闭了“允许记住”（在 设置 · 个人 · 记忆 打开），这一轮不能长期记住新内容；读取和停用是否可用，以本轮提供的工具为准。"));
    // Changes a stopped round left running, and how each ended (the base says not to submit an unsettled one again blindly).
    const unsettled = this.store.unsettled(this.actorId, work.work_id, true);
    if (unsettled.length) {
      const words = { pending: "还没有结果", completed: "停止后已完成", failed: "停止后失败", "not-run": "停止时还没开始，没有执行" };
      out.push(...chunked({ ...base, title: "上一轮停止时仍在执行的修改" }, "unsettled", unsettled.map(change => `- 「${change.title}」：${words[change.state]}${change.detail ? `（${change.detail}）` : ""}`).join("\n")));
      told.unsettled = unsettled.filter(change => change.state !== "pending").map(change => change.change_id);
    }
    const objects = await this.link.workObjects(work);
    if (objects.length) out.push(...chunked({ ...base, title: "这项工作的对象" }, "objects", describeObjects(objects)));
    // Work a professional Agent did for this work comes back here: its session, as its owner reports it.
    for (const object of objects.filter(item => item.relation === "session" && item.state !== "missing")) {
      const progress = await this.objectBackground(work, { kind: object.subject.kind, id: object.subject.id });
      if (progress) out.push(...chunked({ ...base, title: `专业会话的进展：${object.title}` }, `session-${object.subject.id}`, progress));
    }
    for (const [title, id, text] of [["可用能力目录", "capabilities", capabilityDirectory(offered, unavailable, this.store.confirmAlways(this.actorId))], ["项目资料目录", "knowledge", await knowledgeDirectory(this.ports, work.scope.kind === "project" ? work.scope.project_id : null, offered, `${work.title}\n${this.starting.get(work.work_id) ?? ""}`, knowledgeGuards)]] as const) if (text) out.push(...chunked({ ...base, title }, id, text));
    // Methods Plugins offer: listed, not loaded. A round that needs one reads it; one the person chose is already here.
    const methods = work.executor.kind === "plugin" ? [] : await this.link.methods(work).catch(() => [] as AssistantMethod[]);
    const chosen = new Set(materials.filter(item => item.kind === "method").map(item => item.method?.method_id));
    const listed = methods.filter(method => !chosen.has(method.method_id)).slice(0, 20);
    if (listed.length) out.push(...chunked({ ...base, title: "可用的方法" }, "methods", [`插件提供的做事方法，这里只列出名称和摘要。方法的步骤经 read-capability 读取：capability_id 为 assistant.methods.read，version 为 1，provider_id 为 ${ASSISTANT_RULES_PROVIDER}，input 是对象，例如 {"method_id": "${listed[0]!.method_id}"}。`,
      ...listed.map(method => `- 「${method.name}」（${method.plugin_title}，method_id ${method.method_id}，v${method.version}）：${method.summary}`)].join("\n")));
    // The object the person is on, as its owner has it: where it stands and what it belongs to. The page's claim is
    // only a pointer; this is read again from the owner, so a work started in the plugin continues with its background.
    if (context?.object) {
      const background = await this.objectBackground(work, context.object);
      if (background) out.push(...chunked({ ...base, title: "当前对象（所有者提供）" }, "object", background));
    }
    if (context) {
      const lines = [`页面：${context.source.title ?? context.source.surface}${context.source.plugin_id ? `（${context.source.plugin_id}）` : ""}`,
        context.object ? `正在看的对象：${context.object.title ?? context.object.id}（${context.object.kind}${context.object.version !== undefined ? `，版本 ${context.object.version}` : ""}）` : "",
        context.unsaved ? "对象有未保存的修改：选区来自草稿，不是已保存版本。" : "",
        context.selection ? `选中的内容${context.selection.truncated ? "（已截断）" : ""}：\n${context.selection.text}` : ""].filter(Boolean).join("\n");
      out.push(...chunked({ ...base, title: "当前页面（发送时）" }, "page", lines), ...await landingMaterials(this.ports, work.scope.kind === "personal" ? null : work.scope.project_id, context, base));
    }
    for (const material of materials) {
      const head = [`${material.explicit ? "用户明确添加" : "来自当前页面，用户保留"}；类型：${material.kind}${material.draft ? "；未保存草稿" : ""}`,
        material.source ? `来源：${material.source.title ?? material.source.surface}` : "",
        material.object ? `对象：${material.object.title ?? material.object.id}（${material.object.kind}${material.object.version !== undefined ? `，版本 ${material.object.version}` : ""}）` : ""].filter(Boolean).join("\n");
      out.push(...chunked({ ...base, title: `材料：${material.title}` }, `material-${material.material_id}`, `${head}\n\n${material.text ?? "（没有可读正文）"}`));
    }
    return { materials: out.slice(0, 30), told, beforeDispatch: async views => { for (const guard of knowledgeGuards) await guard(views); } };
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
      if (!material.reference || !material.object || "subject" in material.reference) { out.push(material.reference && "subject" in material.reference ? await readPickedPiece(actions, views, { ...material, reference: material.reference }) : material); continue; }
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
      const text = context
        ? `用户用“@”引用的对象，已向${where}重新读取（版本 ${context.revision}${context.truncated ? "，正文为节选" : ""}）。\n${context.content.slice(0, 12_000)}`
        : `用户用“@”引用的对象。${where}没有提供正文读取，下面只是搜索结果里的摘要，不是全文：\n${material.text ?? "（没有摘要）"}`;
      out.push({ ...material, title: opened.title || material.title, object: { kind: subject.kind, id: subject.id, version: context?.revision ?? opened.revision, title: opened.title || material.title }, text });
    }
    return out;
  }

  /** Methods the person chose with “/”: the registered body goes with this round, said as their choice. */
  async chosenMethods(work: StoredWork, materials: AssistantMaterial[]): Promise<AssistantMaterial[]> {
    const out: AssistantMaterial[] = [];
    for (const material of materials) {
      if (material.kind !== "method" || !material.method) { out.push(material); continue; }
      const method = await this.link.readMethod(work, material.method.method_id);
      out.push({ ...material, title: `方法：${method.name}`, method: { method_id: method.method_id, version: method.version, name: method.name, plugin_title: method.plugin_title },
        text: `用户为这一轮选定的方法「${method.name}」（${method.plugin_title} 提供，v${method.version}）。这一轮按它的步骤做：\n${method.body}` });
    }
    return out;
  }

  /**
   * A document the person brings (PDF), read by the runtime's own parser into bounded text for this Send's materials;
   * a picture (PNG, JPEG, GIF, WebP) is taken in by the runtime instead, for the model to see in the round it goes with.
   * What cannot be read says why (scanned, encrypted, damaged); nothing is guessed.
   */
  async readAttachment(input: { name: string; data: string }): Promise<AssistantMaterial & { pages?: number; truncated?: boolean }> {
    const name = typeof input?.name === "string" ? input.name.trim().slice(0, 200) : "";
    if (!name || typeof input.data !== "string" || !input.data) throw assistantErrors.invalid("没有收到文件");
    const bytes = Buffer.from(input.data, "base64");
    if (bytes.byteLength > 8 * 1024 * 1024) throw assistantErrors.invalid("文件超过 8 MB，请只带需要的部分");
    const documents = (await this.ports.host()).adapter(RUNTIME).documents;
    if (!documents) throw assistantErrors.unsupported("当前运行时不能读取这类文件");
    if (looksLikeImage(bytes) || /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?|svg)$/i.test(name)) return this.takeImage(name, bytes, documents);
    let parsed: { text: string; truncated: boolean; pages?: number };
    try { parsed = await documents.parse({ bytes: new Uint8Array(bytes), name }); }
    catch (error) {
      const code = (error as { code?: string }).code ?? "";
      throw assistantErrors.invalid(code === "RESOURCE_PARSER_UNAVAILABLE" ? "暂时只能读取文本文件、PDF 和图片" : (error instanceof Error ? error.message : String(error)).replace(/^[A-Z_]+:\s*/, ""));
    }
    return { material_id: `file-${randomUUID()}`, kind: "file", title: name + (parsed.pages ? `（${parsed.pages} 页${parsed.truncated ? "，只取了前面一部分" : ""}）` : ""),
      text: parsed.text, explicit: true, ...(parsed.pages ? { pages: parsed.pages } : {}), ...(parsed.truncated ? { truncated: true } : {}) };
  }

  /** A picture the person brings: taken in by the runtime (its bytes stay there) and named by reference in the Send. */
  private async takeImage(name: string, bytes: Buffer, documents: AgentDocumentCapability): Promise<AssistantMaterial> {
    if (!looksLikeImage(bytes)) throw assistantErrors.invalid("只能带 PNG、JPEG、GIF 或 WebP 图片");
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw assistantErrors.invalid("图片超过 5 MB，请压缩或截取需要的部分");
    if (!documents.intakeImage) throw assistantErrors.unsupported("当前运行时还不能接收图片");
    let taken: Awaited<ReturnType<NonNullable<AgentDocumentCapability["intakeImage"]>>>;
    try { taken = await documents.intakeImage({ bytes: new Uint8Array(bytes), name }); }
    catch (error) { throw assistantErrors.invalid((error instanceof Error ? error.message : String(error)).replace(/^[A-Z_]+:\s*/, "")); }
    this.images.set(taken.resource.id, { revision: taken.resource.revision, media_type: taken.media_type });
    return { material_id: `image-${randomUUID()}`, kind: "image", title: name, explicit: true,
      image: { resource_id: taken.resource.id, revision: taken.resource.revision, media_type: taken.media_type, byte_length: taken.byte_length } };
  }

  /** One material a round of this work brought, with its text (bounded), for the person to look at again. */
  material(workId: string, materialId: string): AssistantMaterialText {
    const work = this.store.get(this.actorId, workId);
    const found = this.store.rounds(work.work_id).flatMap(round => round.materials).find(item => item.material_id === materialId);
    if (!found) throw assistantErrors.not_found("这项工作里没有这份材料");
    const text = typeof found.text === "string" ? found.text : undefined;
    // A page brought from the browser says where it came from on its first line.
    const url = text?.match(/^来源：\s*(https?:\/\/\S+)/u)?.[1];
    return { material_id: found.material_id, kind: found.kind, title: found.title,
      ...(text !== undefined ? { text: text.slice(0, MATERIAL_PREVIEW_CHARS), ...(text.length > MATERIAL_PREVIEW_CHARS ? { truncated: true } : {}) } : {}),
      ...(url ? { url } : {}), ...(found.source ? { source: { ...found.source } } : {}), ...(found.object ? { object: { ...found.object } } : {}), ...(found.draft ? { draft: true } : {}) };
  }

  /** A picture a work carried, read back for the side panel; gone once the app restarted (the runtime keeps no copy). */
  async materialImage(workId: string, materialId: string): Promise<{ media_type: string; data: string }> {
    const work = this.store.get(this.actorId, workId);
    const found = this.store.rounds(work.work_id).flatMap(round => round.materials).find(item => item.material_id === materialId && item.kind === "image" && item.image);
    if (!found?.image) throw assistantErrors.not_found("这项工作里没有这张图片");
    const gone = assistantErrors.expired("这张图片已失效：应用重启后不再保留。需要时请重新添加这张图片。");
    if (!this.holdsImage(found.image)) throw gone;
    const bytes = await (await this.ports.host()).adapter(RUNTIME).documents?.readImage?.({ id: found.image.resource_id, revision: found.image.revision });
    if (!bytes) throw gone;
    return { media_type: found.image.media_type, data: Buffer.from(bytes).toString("base64") };
  }

  holdsImage(image: NonNullable<AssistantMaterial["image"]>): boolean {
    return this.images.get(image.resource_id)?.revision === image.revision;
  }
}
