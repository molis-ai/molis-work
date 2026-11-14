// The official content packs under plugins/content/, packed unsigned into the Host's build output
// (apps/local-host/dist/bundled-plugins/<plugin_id>.draft.json). Molis Work has no publisher key of its own yet (batch 26, 26-1), so
// each Home signs one with its own publisher identity when the person installs it (specs/prologue-strategies/skill.md §10,
// 用户 2026-11-14 定). Run by `pnpm build` after the workspace is built; a pack that does not pack fails the build.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const { packBundledDraft } = await import(join(root, "tooling/plugin-cli/dist/index.js"));
const source = join(root, "plugins/content"), output = join(root, "apps/local-host/dist/bundled-plugins");
for (const entry of (await readdir(source, { withFileTypes: true })).filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const { draft, file } = await packBundledDraft(join(source, entry.name), output);
  process.stdout.write(`bundled draft: ${draft.manifest.plugin_id} ${draft.manifest.version} -> ${file}\n`);
}
