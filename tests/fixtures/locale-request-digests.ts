import assert from "node:assert/strict";
import http from "node:http";
import { join } from "node:path";
import { artifactContentDigest, canonicalArtifactJson, normalizeArtifactPayload } from "@molis-ai/molis-work-module-artifacts";
import { hashFunctionConfig } from "@molis-ai/molis-work-module-judgment-rules";
import { inboxPagesRequestHash } from "@molis-ai/molis-work-plugin-inbox";
import { createImDomain, ImError, type ImEvents, type ImIdentity } from "@molis-ai/molis-work-server";
import { createProjectCopyJournal, previewProjectCopy, type ProjectCopySource } from "@molis-ai/molis-work-service-placement";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";

// Mixed scripts whose order differs between en-US (Han by code point) and zh-CN (Han by pinyin).
const KEYS = ["é", "é", "e", "中", "阿", "😀", "", "2", "10", "Z", "a"];
const [home, phase] = process.argv.slice(2);
assert.ok(home && (phase === "create" || phase === "replay"));
const keys = phase === "create" ? KEYS : [...KEYS].reverse();
const object = Object.fromEntries(keys.map(key => [key, `value ${key}`]));

const artifactText = canonicalArtifactJson(normalizeArtifactPayload({ nested: object, ...object }));
const judgmentHash = hashFunctionConfig({ primitive: "choice", instructions: "选一个", criteria: keys.map(key => ({ key, description: `说明 ${key}` })) });
const inboxHash = inboxPagesRequestHash({ request_id: "request", entry_ids: keys, title: "标题", instructions: "说明",
  expected_materials: keys.map(key => ({ entry_id: key, item_id: `item ${key}`, revision: "1", content_digest: "0".repeat(64) })) });

const source = (ownerId: string): ProjectCopySource => {
  const kind = `${ownerId}:record`;
  const owner: ProjectCopySource["owner"] = { kinds: [kind], snapshot: () => keys.map(key => ({ key: `${ownerId} ${key}`, value: object })), read: () => null,
    references: asset => keys.map(id => ({ kind, id: `${asset.key} missing ${id}`, projectId: "p1" })),
    fork: asset => asset, apply() { throw new Error("a preview never applies"); } };
  return { ownerId, owner };
};
const preview = previewProjectCopy({ sourceSpaceId: "space", projectIds: ["p1"], sources: keys.map(source), authorize() {} });

let stored: string | null = null;
const journal = createProjectCopyJournal({ read: () => stored, compareAndSet(expected, value) { assert.equal(stored, expected); stored = value; return true; } }, "target", () => {});
const planHash = journal.reserve({ operationId: "operation", sourceSpaceId: "space", targetSpaceId: "target", fingerprint: "0".repeat(64),
  projects: keys.map(key => ({ sourceId: `s ${key}`, targetId: `t ${key}`, title: key })),
  assets: keys.map(key => ({ id: `a ${key}`, targetKey: `k ${key}`, targetHash: "0".repeat(64) })) }).planHash;

// A receipt written under one language must still answer the same request after a restart under another.
const db = openTestSqlite(join(home, "server.sqlite"));
db.exec(`CREATE TABLE IF NOT EXISTS mw_members(id TEXT PRIMARY KEY, display_name TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS mw_projects(id TEXT PRIMARY KEY,title TEXT,owner_id TEXT REFERENCES mw_members(id),scope_json TEXT);
  CREATE TABLE IF NOT EXISTS mw_access(project_id TEXT REFERENCES mw_projects(id),member_id TEXT REFERENCES mw_members(id),role TEXT,PRIMARY KEY(project_id,member_id));
  CREATE TABLE IF NOT EXISTS mw_sessions(id TEXT PRIMARY KEY, member_id TEXT REFERENCES mw_members(id), expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
  INSERT OR IGNORE INTO mw_members VALUES ('member', '一骏');
  INSERT OR IGNORE INTO mw_sessions(id, member_id, expires_at) VALUES ('session', 'member', ${Date.now() + 3_600_000});`);
const member = { id: "member", display_name: "一骏" };
const identity: ImIdentity = { member: () => member, requireMember: () => member, name() { throw new ImError("im.identity_unavailable", "不改名", 400); } };
const events: ImEvents = { append: () => 1, notify() {} };
const domain = createImDomain({ db, identity, events });
const session = { id: "session", member_id: "member", expires_at: Date.now() + 3_600_000 };
const server = http.createServer((request, response) => void domain.handleImRequest({ request, response, url: new URL(request.url!, "http://127.0.0.1"), session }));
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const createRoom = async (extra: object) => {
  const response = await fetch(`${origin}/im/api/rooms`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...object, client_id: "11111111-1111-4111-8111-111111111111", title: "跨语言", ...extra }) });
  return { status: response.status, body: await response.json() as { room?: { id: string } } };
};
const room = await createRoom({});
assert.equal(room.status, 200, JSON.stringify(room.body));
const changed = await createRoom({ e: "different request" });
assert.equal(changed.status, 409, "a changed request under the same client id stays refused");
server.closeAllConnections();
await new Promise<void>(resolve => server.close(() => resolve()));
db.close();

process.stdout.write(JSON.stringify({
  locale: Intl.DateTimeFormat().resolvedOptions().locale,
  localeOrder: [...KEYS].sort((left, right) => left.localeCompare(right)),
  artifactText,
  artifactDigest: artifactContentDigest(artifactText),
  judgmentHash,
  inboxHash,
  previewFingerprint: preview.view.fingerprint,
  planHash,
  roomId: room.body.room!.id,
}));
