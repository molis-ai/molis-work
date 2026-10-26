import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalActionGatewayClient, MolisWorkLocalHost, molisWorkHostProjectReference, projectActionAvailability, resolveWebControlToken } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext, ActionReference, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  LocalHostHttpClient, addProjectPlugin, createProject, grantMcpActions, revokeMcpAction,
  type McpActionGrantRow,
} from "@molis-ai/molis-work-test-kit/local-host-http";
import { createMolisWorkWebServer } from "../../apps/desktop/launchers/web/server.js";

/** The host the web server wraps. */
type ServedHost = NonNullable<NonNullable<Parameters<typeof createMolisWorkWebServer>[0]>["localHost"]>;
/** What the harness needs of a host to be given one, structurally: a file that builds its host from `src` passes it without importing a type from `src`. */
interface TestHostLike {
  inspectActions(caller: ActionCallContext, reference?: LocalHostProjectReference): Promise<ActionView[]>;
}
type HostOptions = NonNullable<ConstructorParameters<typeof MolisWorkLocalHost>[0]>;

export interface TestProject {
  readonly project_id: string;
  readonly display_name: string;
  readonly database_path: string;
  /** The project as the Host addresses it. */
  readonly reference: ReturnType<typeof molisWorkHostProjectReference>;
}

export interface TestMcpCaller {
  /** The cross-process gateway client an MCP process uses, already past its discovery. */
  readonly client: LocalActionGatewayClient;
  readonly caller: ActionCallContext;
}

type GrantTarget = ActionView | ActionReference;

/** Wait for a cleanup step, but not forever: a hung step fails the test with its name instead of hanging the run. */
async function within(name: string, action: Promise<unknown>, ms = 5_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([action, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Test Home cleanup timed out: ${name}`)), ms); })]);
  } finally { clearTimeout(timer); }
}

/**
 * Serve a Home over the product's own web server, on a loopback port, and give the test the management calls a person makes against
 * it: projects through the project settings, grants through the access settings, an MCP client over the cross-process gateway.
 * Nothing here writes a store file, so a grant the product would refuse (an unavailable action, a user-only one, a project that is
 * not in the catalog, a missing dependency) is refused in the test too.
 *
 * With `host`, the server wraps that host and the test closes it; a file that keeps its own host (it needs a `src` import of the
 * host) still gets the same calls. Without, the server assembles its own host the way the product does and closes it.
 * Serving configures the host (web catalog, personal planning, system agent service), so serve at setup, not in the middle of a test.
 * `t` runs `close` when the test ends; `null` leaves it to the caller, for a server that lives only part of a test.
 */
export async function serveTestHost(t: TestContext | null, options: { home: string; host?: TestHostLike }) {
  const { home, host } = options;
  const server = createMolisWorkWebServer({ homeDirectory: home, ...(host ? { localHost: host as ServedHost } : {}) });
  const connections = new Set<Socket>();
  server.on("connection", connection => {
    connections.add(connection);
    connection.once("close", () => connections.delete(connection));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  // The server wrote the Home's token (or found it there): the same file an MCP process of this Home reads.
  const controlToken = resolveWebControlToken({ homeDirectory: home });
  const web = new LocalHostHttpClient({ origin, controlToken });
  const projects = new Map<string, TestProject>();
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    if (!server.listening) return;
    const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeAllConnections();
    // Upgraded sockets are not covered by closeAllConnections.
    for (const connection of connections) connection.destroy();
    await within("HTTP server", closed);
  })();
  t?.after(close);

  function knownProject(projectId: string): TestProject {
    const project = projects.get(projectId);
    assert.ok(project, `project ${projectId} was not created through this Test Home`);
    return project;
  }
  /** The directory a client sees in a scope: what it could be granted, and what it was. */
  async function inspect(clientId: string, projectId: string | null): Promise<ActionView[]> {
    assert.ok(host, "inspecting a directory needs the host this server wraps");
    const caller: ActionCallContext = { actor_id: clientId, project_id: projectId, audience: "mcp", permissions: [] };
    return host.inspectActions(caller, projectId === null ? undefined : knownProject(projectId).reference);
  }
  /** Views as given, or references looked up in the client's directory (a reference without a provider takes the one that offers it). */
  async function viewsOf(clientId: string, projectId: string | null, targets: readonly GrantTarget[]): Promise<ActionView[]> {
    if (targets.every((target): target is ActionView => "provider" in target)) return [...targets];
    const directory = await inspect(clientId, projectId);
    return targets.map(target => {
      if ("provider" in target) return target;
      const found = directory.find(view => view.capability_id === target.capability_id && view.version === target.version
        && (!target.provider_id || view.provider.provider_id === target.provider_id));
      assert.ok(found, `${target.capability_id}@${target.version} is not in the directory of ${clientId} in ${projectId ?? "the Home"}`);
      return found;
    });
  }

  return {
    home, origin, controlToken, web, close, inspect,
    /** Create a project in the catalog as the person does, then install the bundled plugins it needs. */
    async createProject(displayName: string, plugins: readonly string[] = []): Promise<TestProject> {
      const created = await createProject(web, displayName);
      for (const pluginId of plugins) await addProjectPlugin(web, created.project_id, pluginId);
      const project: TestProject = { ...created, reference: molisWorkHostProjectReference({ projectId: created.project_id, databasePath: created.database_path }) };
      projects.set(project.project_id, project);
      return project;
    },
    /** Grant actions to a client through the access settings, in dependency order. The Host's refusal is the test's. */
    async grant(clientId: string, projectId: string | null, targets: readonly GrantTarget[]): Promise<McpActionGrantRow[]> {
      return grantMcpActions(web, { clientId, projectId, actions: await viewsOf(clientId, projectId, targets) });
    },
    /** Turn grants off through the same route. */
    async revoke(clientId: string, projectId: string | null, targets: readonly GrantTarget[]): Promise<void> {
      for (const view of await viewsOf(clientId, projectId, targets)) {
        await revokeMcpAction(web, { clientId, projectId: view.action.scope === "home" ? null : projectId,
          action: { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id } });
      }
    },
    /** An MCP client's connection to this Home: the gateway client an MCP process uses, discovered once so that a later refusal is the action's own. */
    async mcp(clientId: string, projectId: string | null): Promise<TestMcpCaller> {
      const client = new LocalActionGatewayClient({ url: origin, homeDirectory: home, clientId, projectId, controlToken });
      const caller: ActionCallContext = { actor_id: clientId, project_id: projectId, audience: "mcp", permissions: [] };
      await client.discover(caller);
      return { client, caller };
    },
  };
}

export type TestHostServer = Awaited<ReturnType<typeof serveTestHost>>;

/**
 * An isolated Home with a host that has the product's catalog policy (a bundled plugin's actions are available in a project only
 * while the project has the plugin installed) and its Catalog's directory list, served over HTTP by `serveTestHost`. `host` adds to the
 * host's options and may replace the policy or directory ports; `catalogPolicy: false` leaves every action available.
 * The test context closes the server, the host and the Home, in that order.
 */
export async function openTestHome(t: TestContext, options: { host?: Partial<HostOptions>; catalogPolicy?: boolean } = {}) {
  const home = await mkdtemp(join(tmpdir(), "molis-test-home-"));
  const workspaceFor = options.host?.workspaceFor;
  const host = new MolisWorkLocalHost({
    homeDirectory: home, completeText: null,
    // Do not replace a supplied single-folder authority with the default Catalog list; explicit list options below still win.
    workspacesFor: workspaceFor
      ? async projectId => { const workspace = await workspaceFor(projectId); return workspace === null ? [] : [workspace]; }
      : projectId => withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.listWorkspaceDirectory(projectId)),
    ...(options.catalogPolicy === false ? {} : { actionAvailability: projectActionAvailability(withMolisWorkProjectCatalog, home) }),
    ...options.host,
  });
  let served: TestHostServer | undefined;
  t.after(async () => {
    const failures: unknown[] = [];
    for (const [name, step] of [["web server", () => served?.close()], ["Local Host", () => host.close()], ["temporary Home", () => rm(home, { recursive: true, force: true })]] as const) {
      try { await within(name, Promise.resolve(step())); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "Test Home cleanup failed");
  });
  served = await serveTestHost(null, { home, host });
  return { ...served, host };
}

export type TestHome = Awaited<ReturnType<typeof openTestHome>>;
