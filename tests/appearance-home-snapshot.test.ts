import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { inspectMolisWorkProjectCatalogSnapshot } from "@molis-ai/molis-work-app-desktop";
import { createHomeSnapshot, createMolisWorkLocalHost, homeStores, restoreHomeSnapshot, type HomeSnapshotManifest } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { APPEARANCE_READ_PERMISSION, APPEARANCE_WRITE_PERMISSION, appearanceSelectionActions as actions } from "@molis-ai/molis-work-contracts/platform/ui";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { APPEARANCE_STATE_PATH, createAppearanceOwner, UI_LOCALE_RELATIVE_PATH } from "@molis-ai/molis-work-service-appearance";
import { smallSnapshotHome } from "./fixtures/home-snapshot-small.js";

const caller: ActionCallContext = { actor_id: "appearance-person", project_id: null, audience: "user",
  permissions: [APPEARANCE_READ_PERMISSION, APPEARANCE_WRITE_PERMISSION] };
const isLocale = (value: unknown): value is "zh" | "en" => value === "zh" || value === "en";

function openAppearance(home: string) {
  const unexpectedFailure = (error: unknown) => { throw error; };
  const owner = createAppearanceOwner(home, { locale: { defaultLocale: "zh", isSupported: isLocale,
    readFailed: (_, error) => unexpectedFailure(error), writeFailed: (_, error) => unexpectedFailure(error), writeSucceeded() {} },
  listenerFailed: unexpectedFailure });
  const dispatcher = new ActionService(), unregister = dispatcher.registerProvider(owner.provider());
  return { owner, client: bindActionClient(dispatcher, () => caller), close: () => { owner.close(); unregister(); } };
}

test("FSS-14 FSS-27 FSS-71 a Home snapshot and restore carry the same appearance receipt and separate language", { timeout: 60_000 }, async t => {
  const { home, snapshot } = await smallSnapshotHome(t);
  const host = createMolisWorkLocalHost({ homeDirectory: home, completeText: null });
  await host.close();
  const initial = openAppearance(home);
  t.after(initial.close);
  initial.owner.locale.remember("en");
  const input = { request_id: "snapshot-appearance", expected_revision: 0, choice: { kind: "restore" } } as const;
  const applied = await initial.client.invoke(actions.apply, input);
  initial.close();

  const paths = [APPEARANCE_STATE_PATH, UI_LOCALE_RELATIVE_PATH];
  assert.equal(homeStores().get("interface")?.owner, "horizontal/appearance");
  assert.equal(homeStores().get(UI_LOCALE_RELATIVE_PATH)?.owner, "horizontal/appearance");
  assert.equal((await createHomeSnapshot({ homeDirectory: home, destination: snapshot })).status, "created");
  const manifest: HomeSnapshotManifest = JSON.parse(await readFile(join(snapshot, "manifest.json"), "utf8"));
  for (const path of paths) {
    const entry = manifest.stores.flatMap(store => store.entries).find(item => item.path === path);
    assert.ok(entry?.kind === "file", path);
    assert.deepEqual(await readFile(join(snapshot, entry.payload_path)), await readFile(join(home, path)));
  }

  const newer = openAppearance(home);
  t.after(newer.close);
  newer.owner.locale.remember("zh");
  await newer.client.invoke(actions.apply, { ...input, request_id: "after-snapshot", expected_revision: 1 });
  newer.close();

  assert.equal((await restoreHomeSnapshot({ homeDirectory: home, source: snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot })).status, "restored");
  const restored = openAppearance(home);
  t.after(restored.close);
  assert.equal(restored.owner.locale.read(), "en");
  assert.deepEqual((await restored.client.invoke(actions.get, { request_id: input.request_id })).recovery, { applied });
  assert.equal((await restored.client.invoke(actions.get, { request_id: "after-snapshot" })).recovery, undefined);
});
