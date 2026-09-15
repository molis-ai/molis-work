import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";

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
      source: "goalboard_tui",
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
