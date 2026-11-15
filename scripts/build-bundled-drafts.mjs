// The official content packs under plugins/content/, packed into the Host's build output. A pack whose pack-content.json writes
// `system` comes with the system: it goes to apps/local-host/dist/system-skills/<plugin_id>.json and is in every Home's Skill catalog
// with no install (用户 2026-11-14 定). Every other pack is packed unsigned to dist/bundled-plugins/<plugin_id>.draft.json: Molis Work
// has no publisher key of its own yet (batch 26, 26-1), so each Home signs one with its own publisher identity when the person installs
// it (specs/prologue-strategies/skill.md §10). Run by `pnpm build` after the workspace is built; a pack that does not pack fails the build.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const { packBundledDraft, packSystemPack, readSystemPackChoice } = await import(join(root, "tooling/plugin-cli/dist/index.js"));
const source = join(root, "plugins/content"), dist = join(root, "apps/local-host/dist");
for (const entry of (await readdir(source, { withFileTypes: true })).filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const directory = join(source, entry.name), system = await readSystemPackChoice(directory);
  const { draft, file } = system ? await packSystemPack(directory, join(dist, "system-skills")) : await packBundledDraft(directory, join(dist, "bundled-plugins"));
  process.stdout.write(`${system ? "system pack" : "bundled draft"}: ${draft.manifest.plugin_id} ${draft.manifest.version} -> ${file}\n`);
}
