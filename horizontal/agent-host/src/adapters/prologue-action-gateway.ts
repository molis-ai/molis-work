import { DEFAULT_TOOL_LIMITS, type ScenarioPack, type ToolRunner } from "@prologue/sdk";
import { ActionError, actionEffect, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentFrozenRole } from "@molis-ai/molis-work-contracts/services/agent-host";

export const GATEWAY_TOOLS = { find: "find-capabilities", read: "read-capability", change: "change-capability" } as const;
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

function parseCapability(args: Record<string, unknown>): CapabilityArgs {
  if (typeof args.capability_id !== "string" || !args.capability_id || typeof args.provider_id !== "string" || !args.provider_id
    || !Number.isSafeInteger(args.version)) throw new ActionError("actions.reference_invalid", "Name the capability exactly: capability_id, version and provider_id as find-capabilities returned them.");
  return { capability_id: args.capability_id, version: args.version as number, provider_id: args.provider_id, input: args.input };
}

/**
 * The Host's action gateway as one SDK pack: three tools instead of one per action.
 *
 * Every call reads the directory again, so what a round may use is what is offered now: an action switched off,
 * uninstalled or changed since the round began is refused, and one installed since is found. Reads run at once;
 * a change is a separate tool whose every call is held for the person's review of its exact arguments.
 */
export function prologueActionGateway(gateway: Gateway, timeoutMs = DEFAULT_TOOL_LIMITS.maxTimeoutMs, runSignal?: AbortSignal) {
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
    const view = (await gateway.client.discover()).find(row => row.capability_id === args.capability_id && row.version === args.version && row.provider.provider_id === args.provider_id);
    if (!view || !view.action.audiences.includes("agent")) throw new ActionError("actions.missing", "That capability is not offered here any more; search again with find-capabilities.");
    if (!view.availability.available) throw new ActionError(view.availability.code, view.availability.reason);
    const reads = actionEffect(view.action, view.capability_id) === "read";
    if (write && reads) throw new ActionError("actions.gateway_mismatch", `This capability only reads; call it with ${GATEWAY_TOOLS.read}.`);
    if (!write && !reads) throw new ActionError("actions.gateway_mismatch", `This capability changes data; call it with ${GATEWAY_TOOLS.change}, which asks the person first.`);
    return view;
  };
  const invoke = async (args: CapabilityArgs, view: ActionView, signal: AbortSignal) => {
    const schema = view.action.input_schema;
    try {
      const result = await gateway.client.invoke({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id },
        normalizedInput(view, args.input), signal);
      signal.throwIfAborted();
      return JSON.stringify(result) ?? "null";
    } catch (error) {
      // A contract mismatch is corrected in one step when the model sees the shape it must send.
      const message = error instanceof Error ? error.message : String(error);
      if (/输入不符合能力合同|input schema|does not match/i.test(message)) {
        throw new ActionError((error as { code?: string }).code ?? "actions.input_invalid", `${message}. The input must be a JSON value matching this schema: ${JSON.stringify(schema).slice(0, 2000)}`);
      }
      throw error;
    }
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
      return JSON.stringify({ found: scored.length, shown: Math.min(scored.length, FIND_LIMIT), capabilities: scored.slice(0, FIND_LIMIT).map(row => describe(row.view)) });
    }),
    [GATEWAY_TOOLS.read]: guarded(async (args, signal) => { const parsed = parseCapability(args); return invoke(parsed, await current(parsed, false), signal); }),
    [GATEWAY_TOOLS.change]: guarded(async (args, signal) => {
      if (!gateway.operate) throw new ActionError("actions.forbidden", "This role may only read.");
      const parsed = parseCapability(args);
      const view = await current(parsed, true);
      return invoke(parsed, view, signal);
    }),
  };
  const capability = { type: "object", properties: {
    capability_id: { type: "string" }, version: { type: "integer" }, provider_id: { type: "string" },
    input: { description: "The capability's input as a JSON value (an object, not a string of JSON), shaped exactly by the input_schema find-capabilities returned; {} when that schema declares no properties." },
  }, required: ["capability_id", "version", "provider_id", "input"], additionalProperties: false };
  const tool = (name: string, description: string, parameters: Record<string, unknown>, effectKind: "safe-read" | "mutate-external") => ({ executor: name,
    registration: { name, version: "1", description, parameters, effectKind, gate: "broker" as const, timeoutMs, idempotency: "none" as const } });
  const tools = [
    tool(GATEWAY_TOOLS.find, "Search the business capabilities available in this work's scope by provider and name (e.g. \"Pages 新建\"). Returns each match's exact identity, whether it reads or changes data, and its input schema.",
      { type: "object", properties: { query: { type: "string", description: "Words from the provider or capability name, separated by spaces." } }, required: ["query"], additionalProperties: false }, "safe-read"),
    tool(GATEWAY_TOOLS.read, "Run a capability that only reads data, with the exact identity from find-capabilities.", capability, "safe-read"),
    tool(GATEWAY_TOOLS.change, "Run a capability that changes data, with the exact identity from find-capabilities. The person reviews the exact capability and input before it runs; do not ask them separately.", capability, "mutate-external"),
  ];
  const names = tools.map(one => one.registration.name);
  const pack: ScenarioPack = { id: PACK_ID, version: "1.0.0", source: { kind: "app-embedded" }, needs: { hostCapabilities: [], executors: names },
    permissions: { tools: names, network: [], paths: [] }, memory: { scope: "session", write: "deny" },
    roster: [{ role: "assistant", skills: [], writes: true }], planning: { plannedBy: "assistant", planFirst: false }, config: {}, tools };
  return { pack, executors, names };
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
export async function gatewayProblem(gateway: Gateway, toolName: string, input: unknown): Promise<string | null> {
  if (toolName !== GATEWAY_TOOLS.read && toolName !== GATEWAY_TOOLS.change) return null;
  if (toolName === GATEWAY_TOOLS.change && !gateway.operate) return "This role may only read.";
  let parsed: CapabilityArgs;
  try { parsed = parseCapability((input ?? {}) as Record<string, unknown>); } catch (error) { return (error as Error).message; }
  const view = (await gateway.client.discover()).find(row => row.capability_id === parsed.capability_id && row.version === parsed.version && row.provider.provider_id === parsed.provider_id);
  if (!view || !view.action.audiences.includes("agent")) return "That capability is not offered here (it may have been switched off, removed or changed); nothing was done. Search again with find-capabilities.";
  if (!view.availability.available) return `${view.availability.reason}; nothing was done.`;
  const reads = actionEffect(view.action, view.capability_id) === "read";
  if (toolName === GATEWAY_TOOLS.change && reads) return `This capability only reads; call it with ${GATEWAY_TOOLS.read}.`;
  if (toolName === GATEWAY_TOOLS.read && !reads) return `This capability changes data; call it with ${GATEWAY_TOOLS.change}, which asks the person first.`;
  // The same validation dispatch will do, before anyone is asked to approve an input that cannot run.
  try { await gateway.client.check?.({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, normalizedInput(view, parsed.input)); }
  catch (error) { return `${error instanceof Error ? error.message : String(error)}. The input must be a JSON value matching this schema: ${JSON.stringify(view.action.input_schema).slice(0, 2000)}`; }
  return null;
}

/** Plain text of a rich-text document (ProseMirror-like `{ type, content, text }`), one block per line. */
function plainText(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const node = value as { type?: unknown; text?: unknown; content?: unknown };
  if (node.type !== "doc" || !Array.isArray(node.content)) return null;
  const inline = (item: unknown): string => {
    if (!item || typeof item !== "object") return "";
    const one = item as { text?: unknown; content?: unknown };
    return typeof one.text === "string" ? one.text : Array.isArray(one.content) ? one.content.map(inline).join("") : "";
  };
  return node.content.map(block => inline(block)).filter(line => line.trim()).join("\n");
}

/** The input as a person reads it: each field by its declared title, text as text; the exact JSON stays separate. */
export function readableInput(schema: Record<string, unknown>, input: unknown): Array<{ label: string; value: string }> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [{ label: "内容", value: typeof input === "string" ? input : JSON.stringify(input) }];
  const properties = (schema.properties && typeof schema.properties === "object" ? schema.properties : {}) as Record<string, { title?: string; description?: string }>;
  return Object.entries(input as Record<string, unknown>).flatMap(([key, value]) => {
    if (value === undefined || value === null || value === "") return [];
    const declared = properties[key];
    const label = declared?.title ?? (declared?.description && declared.description.length <= 24 ? declared.description : key);
    const text = typeof value === "string" ? value : plainText(value) ?? (Array.isArray(value) && value.every(item => typeof item === "string") ? value.join("、")
      : typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value, null, 2));
    return [{ label, value: text.length > 4000 ? `${text.slice(0, 4000)}…` : text }];
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

