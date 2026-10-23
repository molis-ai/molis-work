import { mkdirSync } from "node:fs";
import path from "node:path";
import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginOwnerFilesClient, PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SHELF_OWNER_FILES } from "@molis-ai/molis-work-plugin-shelf";
import { openShelfStore, type ShelfRuntimeProbe, type ShelfStore } from "@molis-ai/molis-work-module-shelf";
import type { ShelfAiPorts, ShelfMaterialPorts } from "@molis-ai/molis-work-contracts/modules/shelf";
import { openPluginOwnerFiles } from "./plugin-owner-files.js";

/**
 * Transitional (PG-026-S1 in specs/repository-anti-corruption/privileges.md): the demo seed still puts its sample on the shelf from
 * outside a Plugin Runtime action scope, so the files client the platform builds for a plugin (which asks for that scope on every call)
 * cannot serve it. This one is the same client over the same Host port and the same declared entries (`SHELF_OWNER_FILES`): a write
 * outside them, a link, a special node or a path that is not strictly relative is refused by the port. It adds no action gate and waits
 * for no `beforeEffect`: the callers keep the ones they already make. Shelf's actions, Home and project alike, are its Runtime instance
 * on `services.ownerFiles`; when the seed goes through them (S4), this function goes.
 */
export function openHostShelfFiles(home: string): PluginOwnerFilesClient {
  const port = openPluginOwnerFiles(home, SHELF_OWNER_FILES);
  return Object.freeze<PluginOwnerFilesClient>({
    rootPath: () => path.join(path.resolve(home), SHELF_OWNER_FILES.store_name),
    stat: relative => port.stat(relative),
    read: relative => port.read(relative),
    list: relative => port.list(relative),
    // The body runs before the first await, so a write never yields between its reads and its changes.
    async write<Result>(run: (writer: PluginOwnerFilesWriter) => Result): Promise<Result> {
      let active = true;
      const current = () => { if (!active) throw new ActionError("actions.expired", "文件写入作用域已结束"); };
      const writer = Object.freeze<PluginOwnerFilesWriter>({
        stat(relative) { current(); return port.stat(relative); },
        read(relative) { current(); return port.read(relative); },
        list(relative) { current(); return port.list(relative); },
        mkdir(relative) { current(); port.mkdir(relative); },
        writeFile(relative, bytes, mode) { current(); port.writeFile(relative, bytes, mode); },
        replaceFileAtomic(relative, bytes) { current(); port.replaceFileAtomic(relative, bytes); },
        copyFile(source, target) { current(); port.copyFile(source, target); },
        removeTree(relative) { current(); port.removeTree(relative); },
        setAccess(relative, access) { current(); port.setAccess(relative, access); },
      });
      try { return requireSynchronous(run(writer), "文件写入回调必须同步完成"); }
      finally { active = false; }
    },
  });
}

/** The Shelf of this Home, opened over its declared files. The Home folder is made if it is not there yet, as opening the shelf always did. */
export function openHostShelfStore(home: string, probe: ShelfRuntimeProbe = {}, materials: ShelfMaterialPorts = {}, ai?: ShelfAiPorts): ShelfStore {
  const resolved = path.resolve(home);
  mkdirSync(resolved, { recursive: true });
  return openShelfStore(path.join(resolved, SHELF_OWNER_FILES.store_name), openHostShelfFiles(resolved), probe, materials, ai);
}
