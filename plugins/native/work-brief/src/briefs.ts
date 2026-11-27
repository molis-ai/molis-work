import { createHash } from "node:crypto";
import { ActionError, bindActionHandler, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding, type ActionSubject, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { canonicalJsonText, draftActionCard } from "@molis-ai/molis-work-plugin-sdk";
import { workBriefActions, type BriefSaved, type BriefView } from "./actions.js";
import { workBriefErrors } from "./error.js";
import { BRIEF_LIMITS, compareBriefBodies, briefSubjectKey, sourceTurn, type AttentionItem, type BriefBody, type BriefRecord, type BriefVersion, type Cite, type Claim, type NextOption,
  type ProducedBy, type ProposalConflict, type SourceRow } from "./model.js";
import { settledMarks } from "./next.js";
import { overviewReaders, readBriefSources, readBriefSubjects, type BriefDirectory, type SubjectRead } from "./reading.js";
import type { BriefStore } from "./store.js";

/** What the brief actions need of the project half's start: its store, one transaction per write, the caller's directory, the clock. */
export interface BriefPorts {
  read<T>(run: (store: BriefStore) => T): T;
  write<T>(caller: ActionExecutionContext, run: (store: BriefStore) => T): Promise<T>;
  /** The directory as the running action's caller; absent when the installation does not hold `actions:delegate`. */
  directory(): BriefDirectory;
  now(): string;
  newId(prefix: string): string;
}

const EMPTY: BriefBody = { sources: [], claims: [], attention: [], next: [] };
const digest = (value: unknown) => createHash("sha256").update(canonicalJsonText(value, "null")).digest("hex");

/**
 * Who made a version: the person for their own call, the assistant for an agent's, the task when the caller names the one it runs
 * for. The task is the caller's word: it is kept only when the caller can read that object now (`readable`).
 */
function producedBy(caller: ActionExecutionContext, task: ActionSubject | undefined, readable: boolean): ProducedBy {
  if (task && readable && caller.audience !== "user") return { kind: "task", subject: { kind: task.kind, id: task.id } };
  return caller.audience === "user" ? { kind: "person" } : { kind: "assistant" };
}

function withTurns(sources: readonly SourceRow[], attention: readonly AttentionItem[], before: readonly SourceRow[]): SourceRow[] {
  const was = new Map(before.map(row => [row.plugin_id, row]));
  return sources.map(row => ({ ...row, turn: sourceTurn(row, attention, was.get(row.plugin_id)) }));
}

const frozen = (subject: ActionSubject, read: Extract<SubjectRead, { state: "ok" }>, at: string): Cite =>
  ({ subject: { kind: subject.kind, id: subject.id }, owner_plugin_id: read.owner_plugin_id, revision: read.context.revision, title: read.context.title, read_at: at });

type Draft = (typeof workBriefActions.save extends ActionDefinition<infer Input, unknown> ? Input : never)["draft"];

/** Every cite, attention object and action of the draft, checked as the caller: what cannot be read or run refuses the save, naming it (WBR-03). */
async function checkedDraft(draft: Draft, current: BriefVersion | null, views: readonly ActionView[], ports: BriefPorts, at: string): Promise<Omit<BriefBody, "sources">> {
  const directory = ports.directory();
  for (const [index, claim] of draft.claims.entries()) {
    if (claim.supplied_by === "owner" ? claim.cites?.length : !claim.cites?.length)
      throw workBriefErrors.invalid(claim.supplied_by === "owner" ? "本人口述的句子不带依据" : "每句话至少要有一条依据，或标为本人口述", { claim: index });
  }
  const subjects = [...draft.claims.flatMap(claim => claim.cites ?? []), ...(draft.attention ?? []).map(item => item.subject)];
  const reads = await readBriefSubjects(directory, views, subjects);
  const read = (subject: ActionSubject, where: Record<string, unknown>) => {
    const found = reads.get(briefSubjectKey(subject));
    if (found?.state !== "ok") throw workBriefErrors.cite_unreadable("有一条依据读不到，简报没有保存", { ...where, subject, state: found?.state ?? "unreadable" });
    return found;
  };
  const known = new Set(current?.claims.map(claim => claim.claim_id));
  const used = new Set<string>();
  const claims = draft.claims.map((claim, index): Claim => {
    const kept = claim.claim_id && known.has(claim.claim_id) && !used.has(claim.claim_id) ? claim.claim_id : ports.newId("c");
    used.add(kept);
    return { claim_id: kept, text: claim.text, cites: (claim.cites ?? []).map(subject => frozen(subject, read(subject, { claim: index }), at)),
      ...(claim.supplied_by ? { supplied_by: claim.supplied_by } : {}) };
  });
  const attention = (draft.attention ?? []).map((item, index): AttentionItem => ({ item_id: ports.newId("a"), subject: { kind: item.subject.kind, id: item.subject.id },
    owner_plugin_id: read(item.subject, { attention: index }).owner_plugin_id, why: item.why, ...(item.blocked ? { blocked: true as const } : {}) }));
  const next: NextOption[] = [];
  for (const [index, option] of (draft.next ?? []).entries()) {
    const base = { option_id: ports.newId("o"), text: option.text, why: option.why, ...(option.subject ? { subject: { kind: option.subject.kind, id: option.subject.id } } : {}) };
    if (option.act.kind === "assistant") { next.push({ ...base, act: { kind: "assistant" } }); continue; }
    const offer = option.act;
    const card = await draftActionCard(base.option_id, { title: option.text, summary: option.why, reference: offer.reference, input: offer.input }, views, {
      now: () => new Date(at), refuse: (_reason, message) => workBriefErrors.invalid("这条下一步的动作现在不可用或输入不对，简报没有保存", { next: index, message }),
      check: async (view, input) => {
        try { await directory.check({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, input); }
        catch (error) { throw error instanceof ActionError ? workBriefErrors.invalid("这条下一步的动作现在不可用或输入不对，简报没有保存", { next: index, code: error.code }) : error; }
      },
      readSubject: async subject => { const found = (await readBriefSubjects(directory, views, [subject])).get(briefSubjectKey(subject)); return found?.state === "ok" ? found.context : found?.state === "gone" ? "missing" : null; },
    });
    next.push({ ...base, act: { kind: "card", card } });
  }
  return { claims, attention, next };
}

/** Where a draft and the person's own changes disagree, sentence by sentence; an edit the draft already agrees with is not a conflict. */
function conflictsOf(store: BriefStore, briefId: string, claims: readonly Claim[]): { conflicts: ProposalConflict[]; agreed: string[] } {
  const drafted = new Map(claims.map(claim => [claim.claim_id, claim.text]));
  const conflicts: ProposalConflict[] = [], agreed: string[] = [];
  for (const edit of store.edits(briefId)) {
    const theirs = drafted.get(edit.claim_id) ?? null;
    if (theirs === edit.text) agreed.push(edit.claim_id); else conflicts.push({ claim_id: edit.claim_id, mine: edit.text, theirs });
  }
  return { conflicts, agreed };
}

/** What this caller may see of a stored version now: a source it cannot read keeps only its name, an object it cannot read only a gap. */
async function shownTo(version: BriefVersion, views: readonly ActionView[], reads: Map<string, SubjectRead>): Promise<BriefVersion> {
  const offered = overviewReaders(views);
  const readable = (subject: ActionSubject) => reads.get(briefSubjectKey(subject))?.state === "ok";
  // The gap keeps its kind (gone from the owner, or unreadable here); only the title and the frozen words are withheld.
  const gap = (subject: ActionSubject): "gone" | "unreadable" => reads.get(briefSubjectKey(subject))?.state === "gone" ? "gone" : "unreadable";
  return { ...version,
    sources: version.sources.map(row => offered.get(row.plugin_id)?.some(view => view.availability.available)
      ? { ...row, subjects: row.subjects.filter(readable) } : { plugin_id: row.plugin_id, name: row.name, read: "unauthorized", subjects: [], turn: "idle" }),
    claims: version.claims.map(claim => ({ ...claim, cites: claim.cites.map(cite => readable(cite.subject) ? cite
      : { subject: cite.subject, owner_plugin_id: "", revision: "", title: "", read_at: cite.read_at, gap: gap(cite.subject) }) })),
    attention: version.attention.filter(item => readable(item.subject)),
    next: version.next.map(option => option.subject && !readable(option.subject) ? { ...option, subject: undefined } : option) };
}
/**
 * A refresh by a caller other than the person does not write its own narrower reach into the brief everyone reads: a source it may
 * not read, or is not offered, stays as the version before had it.
 */
function keptSources(read: readonly SourceRow[], before: readonly SourceRow[]): SourceRow[] {
  const now = new Map(read.map(row => [row.plugin_id, row]));
  const kept = before.map(old => { const row = now.get(old.plugin_id); now.delete(old.plugin_id); return !row || row.read === "unauthorized" ? old : row; });
  return [...kept, ...now.values()].sort((a, b) => a.plugin_id < b.plugin_id ? -1 : a.plugin_id > b.plugin_id ? 1 : 0);
}
const subjectsOf = (version: BriefBody) => [...version.sources.flatMap(row => row.subjects), ...version.claims.flatMap(claim => claim.cites.map(cite => cite.subject)),
  ...version.attention.map(item => item.subject), ...version.next.flatMap(option => option.subject ? [option.subject] : [])];

export function createBriefHandlers(ports: BriefPorts): ActionHandlerBinding[] {
  const { read, write } = ports;
  const saved = (store: BriefStore, brief: BriefRecord): BriefSaved => ({ brief, version: store.version(brief), proposal: store.proposal(brief.brief_id) });
  const target = (store: BriefStore, briefId: string | undefined) => briefId ? store.get(briefId) : store.home();

  return [
    bindActionHandler(workBriefActions.list, () => read(store => ({ briefs: store.list() }))),

    bindActionHandler(workBriefActions.get, async ({ brief_id, version, compare_with }): Promise<BriefView> => {
      const stored = read(store => {
        const brief = target(store, brief_id);
        if (!brief) return null;
        const shown = store.version(brief, version ?? brief.current_version), compared = compare_with ? store.version(brief, compare_with) : null;
        if (version && !shown || compare_with && !compared) throw workBriefErrors.not_found("这一版已不存在", { brief_id: brief.brief_id, version: shown ? compare_with : version });
        return { brief, shown, compared, versions: store.versions(brief), proposal: store.proposal(brief.brief_id), edits: store.edits(brief.brief_id), marks: settledMarks(ports, brief.brief_id, store.marks(brief.brief_id)) };
      });
      if (!stored) return { brief: null, version: null, versions: [], proposal: null, edits: [], marks: [] };
      const { brief, shown, compared, versions, proposal, edits, marks } = stored;
      const directory = ports.directory(), views = await directory.discover();
      const reads = await readBriefSubjects(directory, views, [shown, compared, proposal?.body].flatMap(body => body ? subjectsOf(body) : []));
      const visible = shown && await shownTo(shown, views, reads), before = compared && await shownTo(compared, views, reads);
      return { brief, version: visible, versions, edits, marks,
        proposal: proposal && { ...proposal, body: await shownTo({ ...shown!, ...proposal.body }, views, reads).then(({ sources, claims, attention, next }) => ({ sources, claims, attention, next })) },
        ...(before && visible ? { compared: before, changes: compareBriefBodies(before, visible) } : {}) };
    }),

    bindActionHandler(workBriefActions.save, async (input, caller) => {
      const hash = digest(input), at = ports.now();
      const before = read(store => {
        const answered = store.answered<BriefSaved>(caller.actor_id, input.request_id, hash);
        if (answered) return { answered };
        const brief = input.new_topic ? null : target(store, input.brief_id);
        if (input.new_topic && (input.brief_id || !input.title)) throw workBriefErrors.invalid("新建专题简报要给标题，不带 brief_id");
        if (brief && store.proposal(brief.brief_id)) throw workBriefErrors.proposal_pending("还有一份提案没处理完，先处理它", { brief_id: brief.brief_id });
        if (brief && input.base_version !== undefined && input.base_version !== brief.current_version) throw workBriefErrors.conflict("简报刚被别处更新，请重新读取后再试", { brief_id: brief.brief_id });
        return { brief, current: brief && store.version(brief) };
      });
      if ("answered" in before) return before.answered!;
      const directory = ports.directory(), views = await directory.discover();
      const drafted = await checkedDraft(input.draft, before.current, views, ports, at);
      const sources = withTurns(await readBriefSources(directory, views, before.current?.sources ?? [], at), drafted.attention, before.current?.sources ?? []);
      const named = input.task ? (await readBriefSubjects(directory, views, [input.task])).get(briefSubjectKey(input.task))?.state === "ok" : false;
      const body: BriefBody = { sources, ...drafted }, made = producedBy(caller, input.task, named);
      return write(caller, store => {
        const again = store.answered<BriefSaved>(caller.actor_id, input.request_id, hash);
        if (again) return again;
        const existing = input.new_topic ? null : target(store, input.brief_id);
        if ((existing?.revision ?? 0) !== (before.brief?.revision ?? 0)) throw workBriefErrors.conflict("简报刚被别处更新，请重新读取后再试");
        if (existing && store.proposal(existing.brief_id)) throw workBriefErrors.proposal_pending("还有一份提案没处理完，先处理它", { brief_id: existing.brief_id });
        let brief = existing ?? store.create({ brief_id: input.new_topic ? ports.newId("brief") : store.singletonId("home"), scope: input.new_topic ? "topic" : "home", title: input.new_topic ? input.title! : input.title ?? "" }, at);
        const { conflicts, agreed } = conflictsOf(store, brief.brief_id, body.claims);
        if (conflicts.length) store.putProposal(brief.brief_id, { proposal_id: ports.newId("proposal"), base_version: brief.current_version, created_at: at, produced_by: made, body, conflicts });
        else {
          brief = store.append(brief, brief.revision, body, made, at, existing && input.title ? input.title : undefined);
          store.clearEdits(brief.brief_id, agreed);
        }
        const result = saved(store, brief);
        store.answer(caller.actor_id, input.request_id, hash, result, at);
        return result;
      });
    }),

    bindActionHandler(workBriefActions.refresh, async ({ brief_id, task }, caller) => {
      const at = ports.now(), person = caller.audience === "user";
      const before = read(store => { const brief = target(store, brief_id); return { brief, current: brief && store.version(brief) }; });
      const directory = ports.directory(), views = await directory.discover(), current = before.current;
      const reads = await readBriefSubjects(directory, views, [...current ? subjectsOf(current) : [], ...task ? [task] : []]);
      // What this caller gets back is what it may see (contract-design §5), whatever is stored.
      const shown = async (version: BriefVersion) => shownTo(version, views, version === current ? reads : await readBriefSubjects(directory, views, subjectsOf(version)));
      // What each sentence stands on, as it is now: a changed object is frozen anew, one gone or unreadable keeps its last words with the gap named.
      const claims = (current?.claims ?? []).map((claim): Claim => ({ ...claim, cites: claim.cites.map((cite): Cite => {
        const now = reads.get(briefSubjectKey(cite.subject));
        // Only the person's own refresh records a gap: another caller's narrower reach is not the brief's.
        if (now?.state !== "ok") return person ? { ...cite, gap: now?.state ?? "unreadable" } : cite;
        const { gap: _gap, ...rest } = cite;
        return now.context.revision === cite.revision && now.context.title === cite.title ? rest : frozen(cite.subject, now, at);
      }) }));
      const attention = current?.attention ?? [];
      const rows = await readBriefSources(directory, views, current?.sources ?? [], at);
      const body: BriefBody = { sources: withTurns(person ? rows : keptSources(rows, current?.sources ?? []), attention, current?.sources ?? []),
        claims, attention, next: current?.next ?? [] };
      if (before.brief && current && !compareBriefBodies(current, body).length) return { brief: before.brief, version: await shown(current), changed: false, changes: [] };
      const made = producedBy(caller, task, task ? reads.get(briefSubjectKey(task))?.state === "ok" : false);
      const stored = await write(caller, store => {
        const existing = target(store, brief_id);
        if ((existing?.revision ?? 0) !== (before.brief?.revision ?? 0)) throw workBriefErrors.conflict("简报刚被别处更新，请重新读取后再试");
        const brief = store.append(existing ?? store.create({ brief_id: store.singletonId("home"), scope: "home", title: "" }, at), existing?.revision ?? 1, body, made, at);
        return { brief, version: store.version(brief)! };
      });
      const version = await shown(stored.version);
      return { brief: stored.brief, version, changed: true, changes: compareBriefBodies(current && await shown(current), version) };
    }),

    bindActionHandler(workBriefActions.edit, ({ brief_id, expected_revision, version, claim_id, text }, caller) => write(caller, store => {
      const brief = store.get(brief_id), at = ports.now();
      if (version !== undefined && version !== brief.current_version) {
        if (brief.fixed[String(version)]) throw workBriefErrors.fixed("固定过的版本只读；改动请在现行版上做", { brief_id, version });
        throw workBriefErrors.conflict("这一版已不是现行版，请重新读取后再改", { brief_id, version });
      }
      const current = store.version(brief) ?? { ...EMPTY };
      const existing = claim_id ? current.claims.find(claim => claim.claim_id === claim_id) : undefined;
      if (claim_id ? !existing : text === null) throw workBriefErrors.invalid(claim_id ? "这句话已不在现行版里" : "要补的句子不能为空", { claim_id });
      if (!claim_id && current.claims.length >= BRIEF_LIMITS.claims) throw workBriefErrors.invalid(`简报最多保留 ${BRIEF_LIMITS.claims} 条结论`, { brief_id });
      const id = claim_id ?? ports.newId("c");
      const claims = !claim_id ? [...current.claims, { claim_id: id, text: text!, cites: [], supplied_by: "owner" as const, edited: true as const }]
        : text === null ? current.claims.filter(claim => claim.claim_id !== id) : current.claims.map(claim => claim.claim_id === id ? { ...claim, text, edited: true as const } : claim);
      const next = store.append(brief, expected_revision, { sources: current.sources, attention: current.attention, next: current.next, claims }, { kind: "person" }, at);
      store.recordEdit(brief_id, { edit_id: ports.newId("edit"), claim_id: id, text, base_version: next.current_version, actor_id: caller.actor_id, at });
      // A proposal that waits is measured against the person's changes as they are now, so this one is neither lost nor an old wording (WBR-05).
      const waiting = store.proposal(brief_id);
      if (waiting) { store.dropProposal(brief_id); store.putProposal(brief_id, { ...waiting, conflicts: conflictsOf(store, brief_id, waiting.body.claims).conflicts }); }
      return saved(store, next);
    })),

    bindActionHandler(workBriefActions.resolve, ({ brief_id, proposal_id, expected_revision, discard, choices }, caller) => write(caller, store => {
      const brief = store.get(brief_id), proposal = store.proposal(brief_id), at = ports.now();
      if (!proposal || proposal.proposal_id !== proposal_id) throw workBriefErrors.not_found("这份提案已不存在", { proposal_id });
      if (brief.revision !== expected_revision) throw workBriefErrors.conflict("简报刚被别处更新，请重新读取后再试", { brief_id });
      // Every change of the person since the draft is in `conflicts` (an edit re-measures the proposal); one that is not would be lost, so it is refused.
      const open = conflictsOf(store, brief_id, proposal.body.claims);
      if (JSON.stringify(open.conflicts) !== JSON.stringify(proposal.conflicts)) throw workBriefErrors.conflict("简报刚被别处更新，请重新读取后再试", { brief_id });
      if (discard) {
        store.dropProposal(brief_id);
        return saved(store, brief);
      }
      const taken = new Map((choices ?? []).map(choice => [choice.claim_id, choice.take]));
      if (taken.size !== proposal.conflicts.length || proposal.conflicts.some(conflict => !taken.has(conflict.claim_id)))
        throw workBriefErrors.invalid("每一处冲突都要选保留哪一种写法", { conflicts: proposal.conflicts.map(conflict => conflict.claim_id) });
      const current = store.version(brief) ?? { ...EMPTY };
      let claims = proposal.body.claims;
      for (const conflict of proposal.conflicts) {
        if (taken.get(conflict.claim_id) === "theirs") continue;
        const mine = current.claims.find(claim => claim.claim_id === conflict.claim_id);
        if (conflict.mine === null) claims = claims.filter(claim => claim.claim_id !== conflict.claim_id);
        else if (claims.some(claim => claim.claim_id === conflict.claim_id)) claims = claims.map(claim => claim.claim_id === conflict.claim_id ? { ...claim, text: conflict.mine!, edited: true as const } : claim);
        else claims = [...claims, { ...(mine ?? { claim_id: conflict.claim_id, cites: [], supplied_by: "owner" as const }), text: conflict.mine, edited: true as const }];
      }
      if (claims.length > BRIEF_LIMITS.claims) throw workBriefErrors.invalid(`简报最多保留 ${BRIEF_LIMITS.claims} 条结论`, { brief_id, count: claims.length });
      store.dropProposal(brief_id);
      // The sources are the newest read, not the proposal's: a refresh may have run while it waited.
      const next = store.append(brief, expected_revision, { ...proposal.body, sources: withTurns(current.sources, proposal.body.attention, []), claims }, proposal.produced_by, at);
      store.clearEdits(brief_id, [...open.agreed, ...proposal.conflicts.filter(conflict => taken.get(conflict.claim_id) === "theirs").map(conflict => conflict.claim_id)]);
      return saved(store, next);
    })),
  ];
}
