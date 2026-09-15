import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createMolisWorkLocalHost, molisWorkHostProjectReference } from "./project-host.js";
import { pluginDevelopmentCapability } from "@molis-ai/molis-work-contracts/platform/tooling";
import type { PluginDevelopmentResult } from "@molis-ai/molis-work-contracts/platform/tooling";

/** Development data is explicitly separate from the user's catalog and existing projects. */
export async function runLocalPluginDevelopment(input: {
  directory: string; state_directory: string; grants: string[]; allow_unsigned_development: true;
}): Promise<PluginDevelopmentResult> {
  const directory = resolve(input.state_directory);
  const markerName = ".molis-work-plugin-development.json";
  const marker = { kind: "molis-work-plugin-development", schema_version: 1 };
  await mkdir(directory, { recursive: true });
  const names = await readdir(directory);
  if (names.includes(markerName)) {
    const existing = JSON.parse(await readFile(join(directory, markerName), "utf8")) as typeof marker;
    if (existing.kind !== marker.kind || existing.schema_version !== marker.schema_version) throw new Error("不是受支持的 Plugin 开发状态目录");
  } else {
    if (names.length) throw new Error("Plugin 开发不能使用非空的普通目录或用户项目目录");
    await writeFile(join(directory, markerName), JSON.stringify(marker) + "\n", { flag: "wx" });
  }
  const host = createMolisWorkLocalHost();
  const boardId = "plugin-development";
  try {
    return await host.client(molisWorkHostProjectReference({ databasePath: join(directory, "development.db"), boardId }))
      .invoke(pluginDevelopmentCapability, { directory: input.directory, board_id: boardId,
        actor_id: "local-plugin-developer", grants: input.grants, allow_unsigned_development: input.allow_unsigned_development });
  } finally { await host.close(); }
}
