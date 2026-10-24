import { chmodSync, constants, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { pluginRouteMatcher } from "@molis-ai/molis-work-plugin-runtime";
import { ActionError, requireSynchronous, type ActionDefinition, type ActionProviderRegistration, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginOwnerFilesClient, PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ShelfAiPorts, ShelfMaterialPorts } from "@molis-ai/molis-work-contracts/modules/shelf";
import { openShelfStore, type ShelfRuntimeProbe, type ShelfStore } from "@molis-ai/molis-work-module-shelf";
import { createShelfActionHandlers, shelfManifest, shelfStorePorts, SHELF_ACTIONS, SHELF_OWNER_FILES, SHELF_PLUGIN_ID, type ShelfActionPorts, type ShelfPluginRouteHandler, type ShelfPluginRouteRequest } from "@molis-ai/molis-work-plugin-shelf";
import { shelfTestAi } from "./shelf-test-ai.js";

/**
 * This Home's Shelf files as plain files under the folder Shelf declares, for tests that drive the store itself or read what Shelf's
 * Runtime instance wrote. Shelf's actions use the Runtime's `services.ownerFiles`; what that client and its port refuse is
 * SHF-IO-S03 to S07 (tests/security-invariants-plugin-owner-files*.test.ts), not this. It keeps two of their rules, so a store change
 * that breaks them fails here too: a path stays inside the entries Shelf declares, and a writer answers only while its callback runs.
 */
export function openTestShelfFiles(home: string): PluginOwnerFilesClient {
  const root = join(resolve(home), SHELF_OWNER_FILES.store_name), entries = new Map(SHELF_OWNER_FILES.entries.map(entry => [entry.name, entry.kind]));
  const files = (open: () => boolean) => {
    const at = (relative: string, kind?: "file" | "directory") => {
      if (!open()) throw new ActionError("actions.expired", "文件写入作用域已结束");
      const parts = relative.split("/"), top = entries.get(parts[0]!);
      if (/[\\\u0000]/u.test(relative) || parts.some(part => !part || part === "." || part === "..") || !top
        || (top === "file" && parts.length > 1) || (parts.length === 1 && kind && top !== kind)) throw new Error(`不在 Shelf 的文件声明内：${relative}`);
      return join(root, relative);
    };
    const parent = (file: string) => mkdirSync(dirname(file), { recursive: true });
    return Object.freeze<PluginOwnerFilesWriter>({
      stat(relative) {
        const file = at(relative);
        if (!existsSync(file)) return null;
        const stat = statSync(file);
        return stat.isFile() ? { kind: "file", byte_length: stat.size } : { kind: "directory" };
      },
      read(relative) { const file = at(relative, "file"); return existsSync(file) ? readFileSync(file) : null; },
      list(relative) {
        const directory = at(relative, "directory");
        return existsSync(directory) ? readdirSync(directory).sort()
          .map(name => ({ name, kind: statSync(join(directory, name)).isDirectory() ? "directory" as const : "file" as const })) : [];
      },
      mkdir(relative) { mkdirSync(at(relative, "directory"), { recursive: true }); },
      writeFile(relative, bytes, mode) {
        const file = at(relative, "file");
        if (mode === "create") parent(file);
        else statSync(file);
        writeFileSync(file, bytes, { flag: mode === "create" ? "wx" : "w" });
      },
      replaceFileAtomic(relative, bytes) {
        const file = at(relative, "file"), temporary = join(dirname(file), `.owner-file-${randomUUID()}.tmp`);
        parent(file);
        writeFileSync(temporary, bytes, { flag: "wx" });
        renameSync(temporary, file);
      },
      copyFile(source, target) { const from = at(source, "file"), to = at(target, "file"); parent(to); copyFileSync(from, to, constants.COPYFILE_EXCL); },
      removeTree(relative) {
        const file = at(relative);
        if (entries.get(relative) === "directory") throw new Error(`不能删除声明的顶层目录：${relative}`);
        rmSync(file, { recursive: true, force: true });
      },
      setAccess(relative, access) {
        const file = at(relative), directory = statSync(file).isDirectory();
        chmodSync(file, directory ? access === "readonly" ? 0o555 : 0o755 : access === "readonly" ? 0o444 : 0o644);
      },
    });
  };
  const reader = files(() => true);
  return Object.freeze<PluginOwnerFilesClient>({
    rootPath: () => root, stat: reader.stat, read: reader.read, list: reader.list,
    // The body runs before the first await, as the Runtime client's does, and its writer ends with it.
    async write<Result>(run: (files: PluginOwnerFilesWriter) => Result): Promise<Result> {
      let open = true;
      try { return requireSynchronous(run(files(() => open)), "文件写入回调必须同步完成"); }
      finally { open = false; }
    },
  });
}

/** The Shelf of this Home over `openTestShelfFiles`, with the test's own probe, material and AI ports. */
export function openTestShelfStore(home: string, probe: ShelfRuntimeProbe = {}, materials: ShelfMaterialPorts = {}, ai?: ShelfAiPorts): ShelfStore {
  const files = openTestShelfFiles(home);
  return openShelfStore(files.rootPath(), files, probe, materials, ai);
}

/** Browser boundary tests drive the plugin's own handlers over a fixture store; Host registration is covered by shelf-actions.test.ts. */
export function directShelfActions(ports: ShelfActionPorts): BoundActionClient {
  const handlers = createShelfActionHandlers(ports);
  return {
    discover: async () => [],
    invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) => {
      const handler = handlers.find(row => row.capability_id === definition.capability_id && row.version === definition.version);
      if (!handler) throw new Error(`missing ${definition.capability_id}`);
      return await handler.handle({ actor_id: "test", project_id: null, audience: "user", permissions: [], beforeEffect: async () => {} }, input) as Output;
    },
  };
}

/** Current route shapes come from the same Manifest matcher as Runtime; a route with no handler here (the project half's) answers nothing. */
export class ShelfPluginRouteTable {
  private readonly match = pluginRouteMatcher(shelfManifest);
  constructor(private readonly handlers: Readonly<Record<string, ShelfPluginRouteHandler>>) {}
  async handle(request: ShelfPluginRouteRequest) {
    const match = this.match(request.method, request.pathname), handle = match && this.handlers[match.route_id];
    return match && handle ? handle({ params: match.params, request }) : null;
  }
}

/**
 * Shelf's Home actions over a store the test opens with its own material ports, registered with the kernel directly so the test
 * can withdraw the provider or revoke the call; the Home instance itself is covered by shelf-actions.test.ts. The terminal action
 * needs the Home instance's terminal service, so it is left out here.
 */
export function shelfStoreProvider(store: () => ShelfStore, ai: ShelfAiPorts = shelfTestAi()): ActionProviderRegistration {
  const handlers = createShelfActionHandlers(shelfStorePorts(store, selection => {
    const state = ai.status(selection);
    return state.available ? { available: true } : { available: false, code: "actions.connection_required", reason: state.reason ?? "请先配置 AI 模型" };
  }));
  return { provider: { provider_id: SHELF_PLUGIN_ID, plugin_id: SHELF_PLUGIN_ID, title: "Shelf", kind: "plugin" },
    definitions: SHELF_ACTIONS.filter(definition => handlers.some(row => row.capability_id === definition.capability_id && row.version === definition.version)),
    handlers };
}
