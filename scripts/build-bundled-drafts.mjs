// The packs the Host's build output carries, from two folders that do not mix (第 44B 批):
// - packages/system-skills/: the Skills that come with the system. Each pack there must write `system` in its pack-content.json; it goes
//   to apps/local-host/dist/system-skills/<plugin_id>.json and is in every Home's Skill catalog with no install (用户 2026-11-14 定).
// - plugins/content/: ordinary official content packs. None may write `system`; each is packed unsigned to
//   dist/bundled-plugins/<plugin_id>.draft.json: Molis Work has no publisher key of its own yet (batch 26, 26-1), so each Home signs one
//   with its own publisher identity when the person installs it (specs/prologue-strategies/skill.md §10).
// Run by `pnpm build` after the workspace is built; a pack that does not pack fails the build.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const { packBundledDraft, packSystemPack, readSystemPackChoice } = await import(join(root, "tooling/plugin-cli/dist/index.js"));
const dist = join(root, "apps/local-host/dist");
const folders = async source => (await readdir(source, { withFileTypes: true })).filter(item => item.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name)).map(entry => join(source, entry.name));
for (const directory of await folders(join(root, "packages/system-skills"))) {
  if (!await readSystemPackChoice(directory)) throw new Error(`${directory}: a pack in packages/system-skills writes system.default_state`);
  const { draft, file } = await packSystemPack(directory, join(dist, "system-skills"));
  process.stdout.write(`system pack: ${draft.manifest.plugin_id} ${draft.manifest.version} -> ${file}\n`);
}
for (const directory of await folders(join(root, "plugins/content"))) {
  if (await readSystemPackChoice(directory)) throw new Error(`${directory}: a pack that comes with the system lives in packages/system-skills`);
  const { draft, file } = await packBundledDraft(directory, join(dist, "bundled-plugins"));
  process.stdout.write(`bundled draft: ${draft.manifest.plugin_id} ${draft.manifest.version} -> ${file}\n`);
}
