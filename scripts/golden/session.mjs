// A Host on a golden Home, for both directions: generating one and replaying one. Everything a write or a read goes through is here, so the two
// cannot drift, and the same guard refuses the network in both (UPG2-06: no cloud, no real model, no credentials).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isLoopbackHostname } from "@molis-ai/molis-work-contracts/platform/loopback";
import { assertTemporaryHome, goldenEnvironment, goldenFailure } from "./layout.mjs";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WRITES = path.join(root, "tests/golden-writes");

const { MolisWorkLocalHost, molisWorkHostProjectReference } = await import("@molis-ai/molis-work-app-local-host");
const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
const { residentHost } = await import("../replay-plugins/signed-session.mjs");

/** Every address the process tried to leave for; the run fails on any of them even if the caller swallowed the refusal. */
const refused = [];
export function refusedNetwork() { return [...refused]; }

/** Install once per process, before the Host starts. A model or service the golden Home never configured has no reason to be reached. */
export function refuseNetwork() {
  const real = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const target = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (!isLoopbackHostname(target.hostname)) {
      refused.push(target.hostname);
      return Promise.reject(goldenFailure("golden.network_refused", target.hostname));
    }
    return real(input, init);
  };
}

/** Point the process at this Home. Secret stores and path defaults read it; a Host and its CLI both see the same test key. */
export function enterHome(home) {
  const real = assertTemporaryHome(home);
  Object.assign(process.env, goldenEnvironment(real));
  return real;
}

function respond(response, text, where) {
  if (response.ok) return text ? JSON.parse(text) : null;
  throw goldenFailure(`golden.http_${response.status}`, where);
}

/**
 * The resident Host with its web surface, or for an account Home only the Host: its web surface answers a signed-in session, and a golden Home
 * never signs in (UPG2-06). Its actions go through the same Host and client.
 */
export async function openGoldenHost(home, { web = true } = {}) {
  const real = enterHome(home), env = goldenEnvironment(real);
  if (!web) {
    const host = new MolisWorkLocalHost({ homeDirectory: real, completeText: null });
    // The web surface does this when it starts; the Host's catalog-backed services wait for it.
    host.configurePersonalPlanning(real, withMolisWorkProjectCatalog);
    return { host, home: real, close: () => host.close(), http: () => { throw goldenFailure("golden.web_surface_absent", "account"); } };
  }
  const resident = await residentHost(root, real, env);
  const { origin } = resident;
  const http = async (route, { method = "POST", body } = {}) => {
    const token = readFileSync(path.join(real, "config/web-control-token"), "utf8").trim();
    const response = await fetch(origin + route, { method, headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": crypto.randomUUID() },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return respond(response, await response.text(), route);
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
  const call = async (capability, input = {}, { version = 1, user_action } = {}) => {
    views ??= await session.host.inspectActions(base, ref);
    const view = views.find(item => item.capability_id === capability && item.version === version);
    if (!view) throw goldenFailure("golden.action_not_offered", `${capability}@${version}`);
    const caller = { ...base, permissions: view.action.permissions, ...(user_action ? { user_action } : {}) };
    const home = view.action.scope === "home";
    return (home ? session.host.homeActionClient() : session.host.actionClient(ref)).invoke(home ? { ...caller, project_id: null } : caller, view, input);
  };
  return { call, http: session.http, projectId: project.project_id, tag };
}

/** tests/golden-writes/<owner>.ts, found by location and not by any declaration (§4 step 6). */
export async function loadGoldenWrites() {
  const names = readdirSync(WRITES).filter(name => name.endsWith(".ts")).sort();
  return Promise.all(names.map(async name => {
    const module = await import(pathToFileURL(path.join(WRITES, name)).href);
    return { owner: name.slice(0, -3), run: module.default, webSurface: module.webSurface === true };
  }));
}
