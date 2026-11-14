// A Host on a golden Home, for both directions: generating one and replaying one. Everything a write or a read goes through is here, so the two
// cannot drift, and the same guard refuses the network in both (UPG2-06: no cloud, no real model, no credentials).
import { readdirSync, readFileSync } from "node:fs";
import { Socket } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isLoopbackHostname } from "@molis-ai/molis-work-contracts/platform/loopback";
import { goldenFailure } from "./failure.mjs";
import { assertTemporaryHome, goldenEnvironment } from "./layout.mjs";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WRITES = path.join(root, "tests/golden-writes");
const SCRIPTED_MODEL_URL = "http://127.0.0.1:9/v1/chat/completions", SCRIPTED_ANSWER = "金样回答";
/** What a case asks the scripted model; anything else is not this conversation. */
const SCRIPTED_QUESTION = "金样对话";

const { MolisWorkLocalHost, molisWorkHostProjectReference, ensureSystemAgentService } = await import("@molis-ai/molis-work-app-local-host");
const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
const { residentHost } = await import("../replay-plugins/signed-session.mjs");

/** Every address the process tried to leave for; the run fails on any of them even if the caller swallowed the refusal. */
const refused = [];
export function refusedNetwork() { return [...refused]; }

/** Where a socket is about to go, in any form `connect` takes; undefined for a local pipe and for the default, which is loopback. */
function connectionHost([first, second]) {
  const options = Array.isArray(first) ? first[0] : first;
  if (typeof options === "object" && options !== null) return options.path ? undefined : options.host;
  return typeof second === "string" ? second : undefined;
}

/**
 * Install once per process, before the Host starts. A model or service the golden Home never configured has no reason to be reached. Every client in
 * the process comes down to this one call (fetch, `node:http`, `node:https`, `node:tls`, a WebSocket); a child process is out of its reach, and the
 * only child here is the CLI that installs the signed sample. Returns how to take it off again.
 */
export function refuseNetwork() {
  const real = Socket.prototype.connect;
  Socket.prototype.connect = function connect(...args) {
    const host = connectionHost(args);
    if (host !== undefined && !isLoopbackHostname(host)) {
      refused.push(host);
      throw goldenFailure("golden.network_refused", host);
    }
    return real.apply(this, args);
  };
  return () => { Socket.prototype.connect = real; };
}

/**
 * The model a golden Home has configured, at the loopback discard port where nothing listens. It answers the one conversation a case starts, and only
 * that: a background call (the ending review, the knowledge organizer) stays refused, since its timer could write model text in any order.
 */
export function scriptModel() {
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input?.url ?? input) !== SCRIPTED_MODEL_URL) return real(input, init);
    const request = JSON.parse(new TextDecoder().decode(init.body));
    if (!request.tools?.length || !JSON.stringify(request.messages).includes(SCRIPTED_QUESTION)) return new Response("{}", { status: 503, headers: { "content-type": "application/json" } });
    const chunk = delta => `data: ${JSON.stringify({ id: "golden", object: "chat.completion.chunk", model: request.model, choices: [{ index: 0, ...delta }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } })}\n\n`;
    return new Response(`${chunk({ delta: { role: "assistant", content: SCRIPTED_ANSWER }, finish_reason: null })}${chunk({ delta: {}, finish_reason: "stop" })}data: [DONE]\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
}

/** Point the process at this Home. Secret stores and path defaults read it; a Host and its CLI both see the same test key. */
export function enterHome(home) {
  const real = assertTemporaryHome(home);
  Object.assign(process.env, goldenEnvironment(real));
  return real;
}

const LOOPBACK_HTTP_FAILURES = new Map([
  ["UND_ERR_SOCKET", "socket_closed"], ["ERR_SOCKET_CLOSED", "socket_closed"],
  ["ECONNRESET", "connection_reset"], ["ECONNREFUSED", "connection_refused"],
  ["EPIPE", "broken_pipe"], ["ETIMEDOUT", "timeout"], ["UND_ERR_ABORTED", "aborted"],
  ["UND_ERR_CONNECT_TIMEOUT", "connect_timeout"], ["UND_ERR_HEADERS_TIMEOUT", "headers_timeout"],
  ["UND_ERR_BODY_TIMEOUT", "body_timeout"],
]);

/** Keep the transport cause in process; reports use only this fixed stage and code. */
function goldenHttpFailure(stage, error) {
  const where = `http/${stage}`;
  if (error?.code === "golden.network_refused" || error?.cause?.code === "golden.network_refused") {
    return goldenFailure("golden.network_refused", where, { cause: error });
  }
  const kind = LOOPBACK_HTTP_FAILURES.get(error?.code) ?? LOOPBACK_HTTP_FAILURES.get(error?.cause?.code) ?? "failed";
  return goldenFailure(`golden.http_${stage}_${kind}`, where, { cause: error });
}

function respond(response, text, where) {
  if (!response.ok) throw goldenFailure(`golden.http_${response.status}`, where);
  if (!text || !response.headers.get("content-type")?.includes("json")) return text || null;
  try { return JSON.parse(text); }
  catch (error) { throw goldenFailure("golden.http_json_invalid", "http/decode", { cause: error }); }
}

/**
 * The resident Host with its web surface, or for an account Home only the Host: its web surface answers a signed-in session, and a golden Home
 * never signs in (UPG2-06). Its actions go through the same Host and client.
 */
export async function openGoldenHost(home, { web = true } = {}) {
  const real = enterHome(home), env = goldenEnvironment(real);
  if (!web) {
    const host = new MolisWorkLocalHost({ homeDirectory: real, completeText: null });
    // The web surface does both when it starts: the Host's catalog-backed services wait for the first, and the Agent and Git services
    // (their workspace and directory ports) read the same catalog only once the second has handed it over.
    ensureSystemAgentService(host, real, host.configurePersonalPlanning(real, withMolisWorkProjectCatalog));
    return { host, home: real, close: () => host.close(), http: () => { throw goldenFailure("golden.web_surface_absent", "account"); } };
  }
  const resident = await residentHost(root, real, env);
  const { origin } = resident;
  // The discussion panel knows its member by a cookie, and this client keeps it the way the person's browser would.
  let cookie;
  const http = async (route, { method = "POST", body } = {}) => {
    const token = readFileSync(path.join(real, "config/web-control-token"), "utf8").trim();
    // Open a fresh connection for each loopback request so a later POST cannot reuse a socket the Host closed while idle.
    const response = await fetch(origin + route, { method, headers: { origin, connection: "close", "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": crypto.randomUUID(), ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      .catch(error => { throw goldenHttpFailure("request", error); });
    cookie = response.headers.get("set-cookie")?.split(";")[0] ?? cookie;
    const text = await response.text().catch(error => { throw goldenHttpFailure("body", error); });
    return respond(response, text, route);
  };
  return { ...resident, home: real, http };
}

export function projectReference(project) {
  return molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
}

/** The action client an owner's write case gets: the directory is read once, and the caller holds exactly what the action asks for. */
export function goldenActions(session, project, tag) {
  const ref = projectReference(project), base = { actor_id: "web-user", actor_kind: "user", project_id: project.project_id, audience: "user", permissions: [] };
  let views;
  const call = async (capability, input = {}, { version = 1, user_action, project_owner = false } = {}) => {
    views ??= await session.host.inspectActions(base, ref);
    const view = views.find(item => item.capability_id === capability && item.version === version);
    if (!view) throw goldenFailure("golden.action_not_offered", `${capability}@${version}`);
    const caller = project_owner ? await session.host.localPersonContext(ref)
      : { ...base, permissions: view.action.permissions, ...(user_action ? { user_action } : {}) };
    const home = view.action.scope === "home" && !project_owner;
    return (home ? session.host.homeActionClient() : session.host.actionClient(ref)).invoke(home ? { ...caller, project_id: null } : caller, view, input);
  };
  return { call, http: session.http, projectId: project.project_id, home: session.home, tag };
}

/** tests/golden-writes/<owner>.ts, found by location and not by any declaration (§4 step 6). */
export async function loadGoldenWrites() {
  const names = readdirSync(WRITES).filter(name => name.endsWith(".ts")).sort();
  return Promise.all(names.map(async name => {
    const module = await import(pathToFileURL(path.join(WRITES, name)).href);
    return { owner: name.slice(0, -3), run: module.default, webSurface: module.webSurface === true, afterKnowledgeRebuild: module.afterKnowledgeRebuild === true };
  }));
}
