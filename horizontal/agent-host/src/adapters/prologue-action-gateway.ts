import { DEFAULT_TOOL_LIMITS, type ScenarioPack, type ToolRunner } from "@prologue/sdk";
import { ActionError, actionEffect, actionFieldLabel, actionFieldValue, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentActionClient, AgentFrozenRole } from "@molis-ai/molis-work-contracts/services/agent-host";

export const GATEWAY_TOOLS = { find: "find-capabilities", read: "read-capability", change: "change-capability", suggest: "suggest-action" } as const;
/** Tools for handing sub-tasks to separate works, present only where the caller offers delegation. */
export const DELEGATION_TOOLS = { start: "delegate-work", check: "check-delegated-work", follow: "follow-up-delegated-work", stop: "stop-delegated-work" } as const;
/** The person's memory, present only where the caller lets this round form memories. */
export const MEMORY_TOOLS = { remember: "remember", list: "list-memories", forget: "forget-memory" } as const;
const PACK_ID = "molis-action-gateway";
const FIND_LIMIT = 8;

type Gateway = NonNullable<AgentFrozenRole["action_gateway"]>;
interface CapabilityArgs { capability_id: string; version: number; provider_id: string; input?: unknown }

const describe = (view: ActionView) => {
  const effect = actionEffect(view.action, view.capability_id);
  return { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id, provider: view.provider.title,
    title: view.action.title, effect: effect === "read" ? "read" : effect === "irreversible" ? "irreversible-change" : "change",
    use: effect === "read" ? GATEWAY_TOOLS.read : GATEWAY_TOOLS.change, description: view.action.description.slice(0, 600), input_schema: view.action.input_schema };
};

/** The person's memory tools; each refuses when the round was not given memory. */
function memoryExecutors(given: AgentActionClient["memory"], guarded: (run: (args: Record<string, unknown>, signal: AbortSignal) => Promise<string>) => ToolRunner): Record<string, ToolRunner> {
  const available = () => { if (!given) throw new ActionError("actions.forbidden", "Forming memories is switched off here; tell the person you did not keep it."); return given; };
  const text = (value: unknown, field: string, max: number) => { if (typeof value !== "string" || !value.trim() || value.length > max) throw new ActionError("actions.reference_invalid", `"${field}" must be 1–${max} characters.`); return value.trim(); };
  return {
    [MEMORY_TOOLS.remember]: guarded(async args => {
      const scope = args.scope === "project" ? "project" : args.scope === "personal" ? "personal" : null;
      if (!scope) throw new ActionError("actions.reference_invalid", "\"scope\" must be personal or project.");
      return JSON.stringify(await available().remember({ text: text(args.text, "text", 400), scope, said: text(args.said, "said", 400) }));
    }),
    [MEMORY_TOOLS.list]: guarded(async () => JSON.stringify({ memories: await available().list() })),
    [MEMORY_TOOLS.forget]: guarded(async args => JSON.stringify(await available().forget(text(args.memory_id, "memory_id", 200)))),
  };
}

/**
 * Why a named capability cannot run now, and what the round may do about it. Upgraded: the same capability at another
 * version may be used, with a fresh confirmation. Otherwise it was switched off or removed on purpose: no stand-in.
 */
function notOffered(views: readonly ActionView[], args: Pick<CapabilityArgs, "capability_id" | "version" | "provider_id">, known: ReadonlySet<string>): string {
  const other = views.find(row => row.capability_id === args.capability_id && row.provider.provider_id === args.provider_id && row.version !== args.version && row.action.audiences.includes("agent"));
  if (other) return `That capability is not offered here any more at version ${args.version}; nothing ran. Its provider now offers version ${other.version}: read its input_schema with find-capabilities and, if the person still wants this, submit it again (they will be asked to confirm).`;
  if (!known.has(args.capability_id)) return "No capability with that exact identity is offered here (this round never found it; it may not exist under that name); nothing ran. Look it up with find-capabilities and use the identity it returns.";
  return "That capability is not offered here any more (switched off for you, removed, or no longer offered to agents); nothing ran. Do not use a different capability to do the same thing: tell the person it was not done and why, and let them decide.";
}

const abortedBy = (signal: AbortSignal) => new Promise<never>((_resolve, reject) => {
  if (signal.aborted) reject(signal.reason);
  else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
});

function parseCapability(args: Record<string, unknown>): CapabilityArgs {
  if (typeof args.capability_id !== "string" || !args.capability_id || typeof args.provider_id !== "string" || !args.provider_id
    || !Number.isSafeInteger(args.version)) throw new ActionError("actions.reference_invalid", "Name the capability exactly: capability_id, version and provider_id as find-capabilities returned them.");
  // Models sometimes put the capability's fields beside its identity instead of inside `input`: that is the input they meant.
  const { capability_id: _id, version: _version, provider_id: _provider, input, ...beside } = args;
  return { capability_id: args.capability_id, version: args.version as number, provider_id: args.provider_id,
    input: input !== undefined ? input : Object.keys(beside).length ? beside : undefined };
}

/**
 * The Host's action gateway as one SDK pack: three tools instead of one per action.
 *
 * Every call reads the directory again, so what a round may use is what is offered now: an action switched off,
 * uninstalled or changed since the round began is refused, and one installed since is found. Reads run at once;
 * a change is a separate tool whose every call is held for the person's review of its exact arguments.
 */
export function prologueActionGateway(gateway: Gateway, timeoutMs = DEFAULT_TOOL_LIMITS.maxTimeoutMs, runSignal?: AbortSignal) {
  // Capabilities this round has seen offered (found or used): one missing later was taken away, not guessed.
  const known = new Set<string>();
  const guarded = (run: (args: Record<string, unknown>, signal: AbortSignal) => Promise<string>): ToolRunner => async call => {
    const abort = new AbortController();
    const stop = () => abort.abort(new ActionError("actions.cancelled", "Agent action cancelled"));
    const unsubscribe = call.abort?.subscribe(stop);
    call.signal?.addEventListener("abort", stop, { once: true });
    runSignal?.addEventListener("abort", stop, { once: true });
    if (runSignal?.aborted || call.signal?.aborted || call.abort?.requested()) stop();
    try { abort.signal.throwIfAborted(); return await run(call.args as Record<string, unknown>, abort.signal); }
    finally { unsubscribe?.(); call.signal?.removeEventListener("abort", stop); runSignal?.removeEventListener("abort", stop); }
  };
  const current = async (args: CapabilityArgs, write: boolean): Promise<ActionView> => {
    const views = await gateway.client.discover();
    const view = views.find(row => row.capability_id === args.capability_id && row.version === args.version && row.provider.provider_id === args.provider_id);
    if (!view || !view.action.audiences.includes("agent")) throw new ActionError("actions.missing", notOffered(views, args, known));
    known.add(view.capability_id);
    if (!view.availability.available) throw new ActionError(view.availability.code, view.availability.reason);
    const reads = actionEffect(view.action, view.capability_id) === "read";
    if (write && reads) throw new ActionError("actions.gateway_mismatch", `This capability only reads; call it with ${GATEWAY_TOOLS.read}.`);
    if (!write && !reads) throw new ActionError("actions.gateway_mismatch", `This capability changes data; call it with ${GATEWAY_TOOLS.change}, which asks the person first.`);
    return view;
  };
  const invoke = async (args: CapabilityArgs, view: ActionView, signal: AbortSignal, write = false) => {
    const schema = view.action.input_schema;
    // A change stops being waited on a little before the runtime's own deadline, so the round hears why in words.
    const local = new AbortController();
    const follow = () => local.abort(signal.reason);
    if (signal.aborted) follow(); else signal.addEventListener("abort", follow, { once: true });
    const deadline = write && timeoutMs > 10_000 ? setTimeout(() => local.abort(new ActionError("actions.timeout", "ran out of time")), timeoutMs - 5_000) : undefined;
    try {
      const call = gateway.client.invoke({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id },
        normalizedInput(view, args.input), local.signal);
      call.catch(() => undefined);
      // A change is not waited on past a stop or deadline: its owner may still finish it, so it ends as "not known".
      const result = write ? await Promise.race([call, abortedBy(local.signal)]) : await call;
      local.signal.throwIfAborted();
      return JSON.stringify(result) ?? "null";
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      // Sent to its owner and not finished (stopped or out of time), or finished with an unusable result: it may have
      // happened. Said as such, so neither the person nor the model takes it for "nothing happened" and repeats it.
      if (write && (local.signal.aborted || code === "actions.output_invalid_after_effect")) {
        throw new ActionError("actions.outcome_unknown", `"${view.provider.title} · ${view.action.title}" was sent but did not finish (${local.signal.aborted ? "it ran out of time or was stopped" : "its result was invalid"}); it may or may not have taken effect. Do not submit it again: first read the object back with ${GATEWAY_TOOLS.read} and tell the person what actually happened.`);
      }
      // A contract mismatch is corrected in one step when the model sees the shape it must send.
      const message = error instanceof Error ? error.message : String(error);
      if (/输入不符合能力合同|input schema|does not match/i.test(message)) {
        throw new ActionError((error as { code?: string }).code ?? "actions.input_invalid", `${message}. The input must be a JSON value matching this schema: ${JSON.stringify(schema).slice(0, 2000)}`);
      }
      throw error;
    } finally { clearTimeout(deadline); signal.removeEventListener("abort", follow); }
  };
  const executors: Record<string, ToolRunner> = {
    [GATEWAY_TOOLS.find]: guarded(async args => {
      const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
      const terms = query.split(/\s+/).filter(Boolean);
      const views = (await gateway.client.discover()).filter(view => view.action.audiences.includes("agent") && view.availability.available);
      const scored = views.map(view => {
        const hay = `${view.provider.title} ${view.action.title} ${view.capability_id} ${view.action.description}`.toLowerCase();
        const head = `${view.provider.title} ${view.action.title}`.toLowerCase();
        const hits = terms.filter(term => hay.includes(term)).length;
        return { view, score: hits * 10 + terms.filter(term => head.includes(term)).length * 5 };
      }).filter(row => terms.length === 0 || row.score > 0).sort((a, b) => b.score - a.score);
      if (!scored.length) return JSON.stringify({ found: 0, note: "Nothing matches; try the provider's name or a shorter word from the capability directory." });
      for (const row of scored.slice(0, FIND_LIMIT)) known.add(row.view.capability_id);
      return JSON.stringify({ found: scored.length, shown: Math.min(scored.length, FIND_LIMIT), capabilities: scored.slice(0, FIND_LIMIT).map(row => describe(row.view)) });
    }),
    [GATEWAY_TOOLS.read]: guarded(async (args, signal) => { const parsed = parseCapability(args); return invoke(parsed, await current(parsed, false), signal); }),
    // A proposal for the person: recorded by the caller, checked against the capability as it is now; runs nothing.
    [GATEWAY_TOOLS.suggest]: guarded(async args => {
      if (!gateway.client.offer) throw new ActionError("actions.forbidden", "This round cannot offer actions.");
      const parsed = parseCapability(args);
      const view = (await gateway.client.discover()).find(row => row.capability_id === parsed.capability_id && row.version === parsed.version && row.provider.provider_id === parsed.provider_id);
      if (!view || !view.action.audiences.includes("agent") || !view.availability.available) throw new ActionError("actions.missing", "That capability is not available here; nothing was suggested. Search again with find-capabilities.");
      const text = (value: unknown, field: string, max: number) => { if (typeof value !== "string" || !value.trim() || value.length > max) throw new ActionError("actions.reference_invalid", `"${field}" must be 1–${max} characters.`); return value.trim(); };
      const editable = Array.isArray(args.editable) ? args.editable.filter((item): item is string => typeof item === "string").slice(0, 20) : undefined;
      const missing = Array.isArray(args.missing) ? args.missing.flatMap(item => item && typeof item === "object" && typeof (item as { field?: unknown }).field === "string" && typeof (item as { question?: unknown }).question === "string"
        ? [{ field: (item as { field: string }).field, question: (item as { question: string }).question.slice(0, 300) }] : []).slice(0, 10) : undefined;
      const recorded = await gateway.client.offer!({ title: text(args.title, "title", 40), summary: text(args.summary, "summary", 600),
        reference: { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, input: normalizedInput(view, parsed.input),
        ...(editable?.length ? { editable } : {}), ...(missing?.length ? { missing } : {}) });
      return JSON.stringify({ offered: recorded.offer_id, note: "Shown to the person as a button; nothing has run. Do not call change-capability for the same thing unless they ask you to." });
    }),
    ...delegationExecutors(gateway.client.delegate, guarded),
    ...memoryExecutors(gateway.client.memory, guarded),
    [GATEWAY_TOOLS.change]: guarded(async (args, signal) => {
      if (!gateway.operate) throw new ActionError("actions.forbidden", "This role may only read.");
      const parsed = parseCapability(args);
      const view = await current(parsed, true);
      return invoke(parsed, view, signal, true);
    }),
  };
  const capability = { type: "object", properties: {
    capability_id: { type: "string" }, version: { type: "integer" }, provider_id: { type: "string" },
    input: { description: "The capability's input as a JSON value (an object, not a string of JSON), shaped exactly by the input_schema find-capabilities returned; {} when that schema declares no properties." },
  }, required: ["capability_id", "version", "provider_id"] };
  const tool = (name: string, description: string, parameters: Record<string, unknown>, effectKind: "safe-read" | "mutate-external") => ({ executor: name,
    registration: { name, version: "1", description, parameters, effectKind, gate: "broker" as const, timeoutMs, idempotency: "none" as const } });
  const suggest = { type: "object", properties: {
    title: { type: "string", description: "The button's words, verb first, at most 40 characters, e.g. \"加入计划（3 项）\"." },
    summary: { type: "string", description: "What clicking does in the person's words: which object, which key values, dates with their day and time zone." },
    capability_id: { type: "string" }, version: { type: "integer" }, provider_id: { type: "string" },
    input: { description: "The prepared input as a JSON value matching the capability's input_schema." },
    editable: { type: "array", items: { type: "string" }, description: "Top-level input fields the person may adjust before running it." },
    missing: { type: "array", items: { type: "object", properties: { field: { type: "string" }, question: { type: "string" } }, required: ["field", "question"] }, description: "Required fields you could not fill, each with the question to ask." },
  }, required: ["title", "summary", "capability_id", "version", "provider_id", "input"], additionalProperties: false };
  const tools = [
    tool(GATEWAY_TOOLS.find, "Search the business capabilities available in this work's scope by provider and name (e.g. \"Pages 新建\"). Returns each match's exact identity, whether it reads or changes data, and its input schema.",
      { type: "object", properties: { query: { type: "string", description: "Words from the provider or capability name, separated by spaces." } }, required: ["query"], additionalProperties: false }, "safe-read"),
    tool(GATEWAY_TOOLS.read, "Run a capability that only reads data, with the exact identity from find-capabilities.", capability, "safe-read"),
    tool(GATEWAY_TOOLS.change, "Run a capability that changes data, with the exact identity from find-capabilities. The person reviews the exact capability and input before it runs; do not ask them separately.", capability, "mutate-external"),
    tool(GATEWAY_TOOLS.suggest, "Offer the person a ready-to-run action as a button, with its exact capability and prepared input, when you are suggesting something they may want done but have not asked you to do. Nothing runs until they click it.", suggest, "safe-read"),
    ...[
      tool(DELEGATION_TOOLS.start, "Hand one independent sub-task to a separate work that runs on its own (same person and scope, its own session). Give it a clear brief, the acceptance bar, and only the material it needs. Its changes still wait for the person's confirmation; it cannot delegate further. Use it for parts that can proceed independently; do small things yourself.",
        { type: "object", additionalProperties: false, required: ["title", "brief", "acceptance"], properties: {
          title: { type: "string", description: "Short name of the sub-task, as the person would recognise it." },
          brief: { type: "string", description: "What to do, with the context it needs. It does not see this conversation." },
          acceptance: { type: "string", description: "How to tell it is done and right: what must exist and hold." },
          materials: { type: "array", items: { type: "object", properties: { title: { type: "string" }, text: { type: "string" } }, required: ["title", "text"] }, description: "Only the text it needs (at most 4)." },
        } }, "safe-read"),
      tool(DELEGATION_TOOLS.check, "Read the delegated works (all, or given work_ids): state, latest reply, objects they produced. With wait_seconds (≤50) it waits for them to finish or to need the person. A work's own report is not proof: check its results against the acceptance bar before relying on them.",
        { type: "object", additionalProperties: false, properties: { work_ids: { type: "array", items: { type: "string" } }, wait_seconds: { type: "integer", minimum: 0, maximum: 50 } } }, "safe-read"),
      tool(DELEGATION_TOOLS.follow, "Tell a delegated work exactly what to fix or add (its next round). Only a few follow-ups per work are allowed; if it still falls short, stop it and report to the person.",
        { type: "object", additionalProperties: false, required: ["work_id", "text"], properties: { work_id: { type: "string" }, text: { type: "string" } } }, "safe-read"),
      tool(DELEGATION_TOOLS.stop, "Stop a delegated work that is no longer needed or keeps falling short.",
        { type: "object", additionalProperties: false, required: ["work_id"], properties: { work_id: { type: "string" } } }, "safe-read"),
    ],
  ];
  tools.push(
    tool(MEMORY_TOOLS.remember, "Keep something the person explicitly asked you to remember for later work (\"以后…\", \"记住…\", \"下次别…\"): a preference, a convention, a fact about their work. Never store something only because it happened once, and never credentials or secrets. scope: personal (all their work) or project (only this project). Tell them in your reply what you kept and where it applies.",
      { type: "object", additionalProperties: false, required: ["text", "scope", "said"], properties: {
        text: { type: "string", description: "What to remember, one short self-contained sentence in the person's language." },
        scope: { type: "string", enum: ["personal", "project"], description: "personal: all their work; project: only this project's work." },
        said: { type: "string", description: "The person's own words asking you to remember it." },
      } }, "safe-read"),
    tool(MEMORY_TOOLS.list, "List what you keep for the person here (personal and this project's), with ids and where each came from. Use it when they ask what you remember, or before forgetting something.",
      { type: "object", additionalProperties: false, properties: {} }, "safe-read"),
    tool(MEMORY_TOOLS.forget, "Delete one remembered item for good when the person asks you to forget it or it is no longer true (find its id with list-memories). A newer explicit request replaces an older one: forget the old one.",
      { type: "object", additionalProperties: false, required: ["memory_id"], properties: { memory_id: { type: "string" } } }, "safe-read"),
  );
  // The runtime keeps one declaration per pack and one per tool name, so every session declares the same full set;
  // what a round may call is its own list of names (and a tool outside it refuses in its executor anyway).
  const all = tools.map(one => one.registration.name);
  const names = all.filter(name => (name !== GATEWAY_TOOLS.suggest || gateway.client.offer) && (!(Object.values(DELEGATION_TOOLS) as string[]).includes(name) || gateway.client.delegate)
    && (!(Object.values(MEMORY_TOOLS) as string[]).includes(name) || gateway.client.memory));
  const pack: ScenarioPack = { id: PACK_ID, version: "2.1.0", source: { kind: "app-embedded" }, needs: { hostCapabilities: [], executors: all },
    permissions: { tools: all, network: [], paths: [] }, memory: { scope: "session", write: "deny" },
    roster: [{ role: "assistant", skills: [], writes: true }], planning: { plannedBy: "assistant", planFirst: false }, config: {}, tools };
  return { pack, executors, names, known };
}

/** The delegation tools, each a thin call into the caller's delegation (which owns limits and the works themselves). */
function delegationExecutors(given: Gateway["client"]["delegate"], guarded: (run: (args: Record<string, unknown>, signal: AbortSignal) => Promise<string>) => ToolRunner): Record<string, ToolRunner> {
  const available = () => { if (!given) throw new ActionError("actions.forbidden", "This work cannot hand out sub-tasks (a delegated work does not delegate further)."); return given; };
  const delegate = { start: (...args: Parameters<NonNullable<typeof given>["start"]>) => available().start(...args), status: (...args: Parameters<NonNullable<typeof given>["status"]>) => available().status(...args),
    follow_up: (...args: Parameters<NonNullable<typeof given>["follow_up"]>) => available().follow_up(...args), stop: (...args: Parameters<NonNullable<typeof given>["stop"]>) => available().stop(...args) };
  const text = (value: unknown, field: string, max: number) => {
    if (typeof value !== "string" || !value.trim() || value.length > max) throw new ActionError("actions.reference_invalid", `"${field}" must be 1–${max} characters.`);
    return value.trim();
  };
  return {
    [DELEGATION_TOOLS.start]: guarded(async args => {
      const materials = Array.isArray(args.materials) ? args.materials.flatMap(item => item && typeof item === "object" && typeof (item as { title?: unknown }).title === "string" && typeof (item as { text?: unknown }).text === "string"
        ? [{ title: (item as { title: string }).title.slice(0, 200), text: (item as { text: string }).text.slice(0, 20_000) }] : []).slice(0, 4) : [];
      const started = await delegate.start({ title: text(args.title, "title", 80), brief: text(args.brief, "brief", 8000), acceptance: text(args.acceptance, "acceptance", 2000), ...(materials.length ? { materials } : {}) });
      return JSON.stringify({ delegated: started, note: "It runs on its own now. Use check-delegated-work to follow it; do not redo its part yourself meanwhile." });
    }),
    [DELEGATION_TOOLS.check]: guarded(async (args, signal) => {
      const ids = Array.isArray(args.work_ids) ? args.work_ids.filter((id): id is string => typeof id === "string").slice(0, 20) : undefined;
      const wait = typeof args.wait_seconds === "number" ? Math.max(0, Math.min(50, Math.floor(args.wait_seconds))) * 1000 : 0;
      return JSON.stringify({ works: await delegate.status({ ...(ids ? { work_ids: ids } : {}), wait_ms: wait }, signal) });
    }),
    [DELEGATION_TOOLS.follow]: guarded(async args => JSON.stringify({ work: await delegate.follow_up(text(args.work_id, "work_id", 200), text(args.text, "text", 8000)) })),
    [DELEGATION_TOOLS.stop]: guarded(async args => JSON.stringify({ work: await delegate.stop(text(args.work_id, "work_id", 200)) })),
  };
}

/**
 * The input a capability receives. Models often send it as a JSON string; a capability that does not take a string
 * gets the value it meant, and an object capability given nothing gets `{}`.
 */
export function normalizedInput(view: ActionView, input: unknown): unknown {
  const schema = view.action.input_schema;
  let value = input;
  if (typeof value === "string" && schema.type !== "string") { try { value = JSON.parse(value); } catch { /* left as given; the contract says why */ } }
  return schema.type === "object" ? value ?? {} : value;
}

/**
 * Why a gateway call cannot go ahead, checked before any review: the capability is gone, switched off, unavailable,
 * or asked for through the wrong tool. Null when it may proceed (a change then still waits for the person).
 */
export async function gatewayProblem(gateway: Gateway, toolName: string, input: unknown, known?: Set<string>): Promise<string | null> {
  if (toolName !== GATEWAY_TOOLS.read && toolName !== GATEWAY_TOOLS.change) return null;
  if (toolName === GATEWAY_TOOLS.change && !gateway.operate) return "This role may only read.";
  let parsed: CapabilityArgs;
  try { parsed = parseCapability((input ?? {}) as Record<string, unknown>); } catch (error) { return (error as Error).message; }
  const views = await gateway.client.discover();
  const view = views.find(row => row.capability_id === parsed.capability_id && row.version === parsed.version && row.provider.provider_id === parsed.provider_id);
  if (!view || !view.action.audiences.includes("agent")) return notOffered(views, parsed, known ?? new Set());
  known?.add(view.capability_id);
  if (!view.availability.available) return `${view.availability.reason}; nothing was done.`;
  const reads = actionEffect(view.action, view.capability_id) === "read";
  if (toolName === GATEWAY_TOOLS.change && reads) return `This capability only reads; call it with ${GATEWAY_TOOLS.read}.`;
  if (toolName === GATEWAY_TOOLS.read && !reads) return `This capability changes data; call it with ${GATEWAY_TOOLS.change}, which asks the person first.`;
  // The same validation dispatch will do, before anyone is asked to approve an input that cannot run.
  try { await gateway.client.check?.({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, normalizedInput(view, parsed.input)); }
  catch (error) {
    const sent = normalizedInput(view, parsed.input);
    const kind = sent === null ? "null" : Array.isArray(sent) ? "array" : typeof sent;
    return `${error instanceof Error ? error.message : String(error)} (you sent ${kind}). The input must be a JSON value matching this schema: ${JSON.stringify(view.action.input_schema).slice(0, 2000)}`;
  }
  return null;
}

/** The input as a person reads it: each field by its declared title, text as text; the exact JSON stays separate. */
export function readableInput(schema: Record<string, unknown>, input: unknown): Array<{ label: string; value: string }> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [{ label: "内容", value: actionFieldValue("", input) }];
  const properties = (schema.properties && typeof schema.properties === "object" ? schema.properties : {}) as Record<string, { title?: string; description?: string; properties?: Record<string, { title?: string; description?: string }> }>;
  const clip = (text: string) => text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
  return Object.entries(input as Record<string, unknown>).flatMap(([key, value]) => {
    if (value === undefined || value === null || value === "") return [];
    // One level of nesting reads field by field, as the person would name them.
    if (value && typeof value === "object" && !Array.isArray(value) && (value as { type?: unknown }).type !== "doc") {
      return Object.entries(value as Record<string, unknown>).flatMap(([child, inner]) => inner === undefined || inner === null || inner === "" ? []
        : [{ label: actionFieldLabel(child, properties[key]?.properties?.[child]), value: clip(actionFieldValue(child, inner)) }]);
    }
    return [{ label: actionFieldLabel(key, properties[key]), value: clip(actionFieldValue(key, value)) }];
  });
}

/** The readable review for a requested change: which capability, from whom, what it does, with the exact input. */
export async function gatewayReview(gateway: Gateway, input: string): Promise<{ summary: string; fields: Array<{ label: string; value: string }> }> {
  const args = JSON.parse(input) as Record<string, unknown>;
  const parsed = parseCapability(args);
  const view = (await gateway.client.discover()).find(row => row.capability_id === parsed.capability_id && row.version === parsed.version && row.provider.provider_id === parsed.provider_id);
  if (!view) throw new Error("所请求的能力已不可用，不能批准");
  const effect = actionEffect(view.action, view.capability_id);
  return { summary: `${view.provider.title} · ${view.action.title}`, fields: [
    { label: "效果", value: effect === "irreversible" ? "修改数据，不可撤回" : "修改数据，可在原处修改或撤回" },
    ...readableInput(view.action.input_schema, normalizedInput(view, parsed.input)),
    { label: "完整参数", value: JSON.stringify(normalizedInput(view, parsed.input), null, 2) },
    { label: "能力", value: `${view.action.description}（${view.capability_id}@${view.version}，${view.provider.provider_id}）` },
  ] };
}

