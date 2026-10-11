import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSessionContentStore, MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";

test("Session event bodies are encrypted and sensitive metadata is not persisted", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-privacy-"));
  const home = path.join(directory, ".molis-work");
  const registry = await openWorkSessionRegistry({ homeDirectory: home });
  const marker = "TOP-SECRET-SESSION-BODY-9f7c";
  try {
    const session = registry.createSession({
      runtime_id: "codex",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
    });
    registry.appendEvent({
      session_id: session.session_id,
      source: "molis_work_tui",
      kind: "terminal_output",
      source_id: "privacy-output-a",
      content: marker,
      metadata: {
        panel_id: "panel-a",
        authorization: "Bearer leaked",
        access_token: "token-leaked",
        password: "password-leaked",
      },
    });
    const [event] = registry.events(session.session_id);
    assert.equal(event?.content, marker);
    assert.deepEqual(event?.metadata, { panel_id: "panel-a" });
  } finally {
    registry.close();
  }

  const sessionsRoot = path.join(home, "sessions");
  for (const entry of fs.readdirSync(sessionsRoot, { recursive: true, encoding: "utf8" })) {
    const target = path.join(sessionsRoot, String(entry));
    if (!fs.statSync(target).isFile()) continue;
    assert.doesNotMatch(fs.readFileSync(target).toString("utf8"), new RegExp(marker));
  }
  const keyPath = path.join(sessionsRoot, "content", "content.key");
  assert.equal(fs.statSync(keyPath).mode & 0o777, 0o600);
  await rm(directory, { recursive: true, force: true });
});
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";

test("the content store lists the blocks it holds, and only those", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-list-"));
  try {
    const store = createSessionContentStore(directory);
    assert.deepEqual(store.list(), [], "nothing is stored yet, and there is no blobs directory to read");
    const first = store.write("第一块").content_ref, second = store.write("第二块").content_ref;
    assert.deepEqual(store.list().sort(), [first, second].sort());
    // Files that are not a block's own (a name that is no digest, a block under the wrong directory) are never listed, so they are never removed as one.
    const digest = first.split("/").pop()!;
    fs.mkdirSync(path.join(directory, "blobs", "zz"), { recursive: true });
    fs.writeFileSync(path.join(directory, "blobs", "zz", "not-a-block.blob"), "x");
    fs.writeFileSync(path.join(directory, "blobs", "zz", `${digest}.blob`), "x");
    fs.writeFileSync(path.join(directory, "blobs", digest.slice(0, 2), "notes.txt"), "x");
    assert.deepEqual(store.list().sort(), [first, second].sort());
    store.remove(first);
    assert.deepEqual(store.list(), [second], "a removed block is not listed any more");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
