import { chmodSync, constants, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { pluginRouteMatcher } from "@molis-ai/molis-work-plugin-runtime";
import { requireSynchronous, type ActionDefinition, type ActionProviderRegistration, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginOwnerFilesClient, PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ShelfAiPorts, ShelfMaterialPorts } from "@molis-ai/molis-work-contracts/modules/shelf";
import { openShelfStore, type ShelfRuntimeProbe, type ShelfStore } from "@molis-ai/molis-work-module-shelf";
import { createShelfActionHandlers, shelfManifest, shelfStorePorts, SHELF_ACTIONS, SHELF_OWNER_FILES, SHELF_PLUGIN_ID, type ShelfActionPorts, type ShelfPluginRouteHandler, type ShelfPluginRouteRequest } from "@molis-ai/molis-work-plugin-shelf";
import { shelfTestAi } from "./shelf-test-ai.js";

/**
 * This Home's Shelf files as plain files under the folder Shelf declares, for tests that drive the store itself or read what Shelf's
 * Runtime instance wrote. Shelf's actions use the Runtime's `services.ownerFiles`; what that client and its port refuse is
 * SHF-IO-S03 to S07 (tests/security-invariants-plugin-owner-files*.test.ts), not this.
 */
export function openTestShelfFiles(home: string): PluginOwnerFilesClient {
  const root = join(resolve(home), SHELF_OWNER_FILES.store_name), at = (relative: string) => join(root, relative);
  const parent = (relative: string) => mkdirSync(dirname(at(relative)), { recursive: true });
  const writer = Object.freeze<PluginOwnerFilesWriter>({
    stat(relative) {
      if (!existsSync(at(relative))) return null;
      const stat = statSync(at(relative));
      return stat.isFile() ? { kind: "file", byte_length: stat.size } : { kind: "directory" };
    },
    read: relative => existsSync(at(relative)) ? readFileSync(at(relative)) : null,
    list: relative => existsSync(at(relative)) ? readdirSync(at(relative), { withFileTypes: true }).map(entry => entry.name).sort()
      .map(name => ({ name, kind: statSync(join(at(relative), name)).isDirectory() ? "directory" as const : "file" as const })) : [],
    mkdir: relative => { mkdirSync(at(relative), { recursive: true }); },
    writeFile(relative, bytes, mode) {
      if (mode === "create") parent(relative);
      else statSync(at(relative));
      writeFileSync(at(relative), bytes, { flag: mode === "create" ? "wx" : "w" });
    },
    replaceFileAtomic(relative, bytes) {
      parent(relative);
      const temporary = join(dirname(at(relative)), `.owner-file-${randomUUID()}.tmp`);
      writeFileSync(temporary, bytes, { flag: "wx" });
      renameSync(temporary, at(relative));
    },
    copyFile(source, target) { parent(target); copyFileSync(at(source), at(target), constants.COPYFILE_EXCL); },
    removeTree: relative => { rmSync(at(relative), { recursive: true, force: true }); },
    setAccess(relative, access) {
      const directory = statSync(at(relative)).isDirectory();
      chmodSync(at(relative), directory ? access === "readonly" ? 0o555 : 0o755 : access === "readonly" ? 0o444 : 0o644);
    },
  });
  return Object.freeze<PluginOwnerFilesClient>({
    rootPath: () => root, stat: writer.stat, read: writer.read, list: writer.list,
    // The body runs before the first await, as the Runtime client's does.
    async write<Result>(run: (files: PluginOwnerFilesWriter) => Result): Promise<Result> {
      return requireSynchronous(run(writer), "文件写入回调必须同步完成");
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
