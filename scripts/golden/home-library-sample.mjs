// The signed sample with its own Home library and owner file (tests/fixtures/golden-home-library/README.md): installed by the generation, replayed after an upgrade.
// A Home-scoped package answers through the Home's action client, so the project session the other sample uses does not reach it. macOS only, like every sandbox.
import { readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { goldenFailure } from "./failure.mjs";
import { root } from "./session.mjs";

const { verifyPluginPackageSignature } = await import("@molis-ai/molis-work-plugin-runtime");

const DIRECTORY = path.join(root, "tests/fixtures/golden-home-library");
const GENERATED_TEXT = "金样 Home 库里的一行", REPLAYED_TEXT = "回放写进 Home 库的一行";
const PERMISSIONS = ["home-database:read", "home-database:write", "owner-files:read", "owner-files:write"];
/** `notes.list` ends with the owner file it keeps, as the sandbox hands it over: base64 of what `notes.add` wrote. */
const FILE_TEXT = "Z29sZGVu";
const LIST = "notes.list", ADD = "notes.add";

export function homeLibrarySample() {
  const read = name => verifyPluginPackageSignature(JSON.parse(readFileSync(path.join(DIRECTORY, name), "utf8"))).bundle.payload.manifest;
  const first = read("v1.json"), second = read("v2.json");
  return { id: "golden-home-library", pluginId: first.plugin_id, version: first.version, upgradeVersion: second.version, packageFile: path.join(DIRECTORY, "v1.json"), upgradeFile: path.join(DIRECTORY, "v2.json") };
}

const caller = view => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: null, permissions: view?.action.permissions ?? ["storage:private", ...PERMISSIONS] });

/** A package's actions are offered when its Home instance is running; a version other than the expected one, or one that stopped, is the finding. */
async function running(session, sample, version) {
  await session.host.homePlugins.ready();
  const record = session.host.homePlugins.installation(sample.pluginId);
  if (!record || record.version !== version || record.state !== "running") throw goldenFailure("golden.home_library_not_running", sample.id);
  return record;
}

async function operate(session, sample, localId, input) {
  const client = session.host.homeActionClient();
  const view = (await client.discover(caller())).find(item => item.provider.plugin_id === sample.pluginId && item.action.local_id === localId);
  if (!view) throw goldenFailure("golden.home_library_not_offered", `${sample.id}/${localId}`);
  return client.invoke(caller(view), { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, input);
}

function expectTexts(rows, expected, sample) {
  if (!isDeepStrictEqual(rows.map(row => row.text), [...expected, FILE_TEXT])) throw goldenFailure("golden.home_library_value_changed", sample.id);
}

/** Through the entry a person uses; the library and file permissions are optional grants, so a person turns them on in settings. */
export async function installHomeLibrarySample(session, project, step) {
  const sample = homeLibrarySample();
  await step("home-library:install");
  const confirmed = await session.cli(sample.packageFile, project.project_id, "--confirm", "--pin-as", "金样 Home 库发布者");
  if (confirmed.code !== 0) throw goldenFailure("golden.home_library_install_failed", `${sample.id}: ${confirmed.out?.code}`);
  const { install_id } = await running(session, sample, sample.version);
  await step("home-library:grant");
  for (const permission of PERMISSIONS) await session.http("/api/settings/plugin-permissions/set", { body: { install_id, permission, granted: true } });
  await step("home-library:write");
  await operate(session, sample, ADD, { text: GENERATED_TEXT });
  expectTexts(await operate(session, sample, LIST, {}), [GENERATED_TEXT], sample);
}

/** Still there and still answering after this build opened the Home, takes a write, upgrades as the same installation, and keeps every row (§4 step 7). */
export async function replayHomeLibrarySample(session, project, id) {
  const sample = homeLibrarySample();
  if (sample.id !== id) throw goldenFailure("golden.home_library_sample_changed", id);
  const { install_id } = await running(session, sample, sample.version);
  expectTexts(await operate(session, sample, LIST, {}), [GENERATED_TEXT], sample);
  await operate(session, sample, ADD, { text: REPLAYED_TEXT });
  const both = [GENERATED_TEXT, REPLAYED_TEXT];
  expectTexts(await operate(session, sample, LIST, {}), both, sample);
  const upgraded = await session.cli(sample.upgradeFile, project.project_id, "--confirm");
  if (upgraded.code !== 0) throw goldenFailure("golden.home_library_upgrade_failed", `${sample.id}: ${upgraded.out?.code}`);
  const after = await running(session, sample, sample.upgradeVersion);
  if (after.install_id !== install_id) throw goldenFailure("golden.home_library_reinstalled", sample.id);
  expectTexts(await operate(session, sample, LIST, {}), both, sample);
  return "replayed";
}
