import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// Exercise the production route, catalog lifetime and encrypted secret store.
test("模型设置经正式 HTTP 保存、验证、重开与隔离，凭据不返回给页面", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "molis-model-settings-"));
  const controlToken = "model-settings-control-token-0123456789abcdef";
  const servers: Server[] = [];
  async function start(home: string) {
    const server = createMolisWorkWebServer({ homeDirectory: path.join(root, home), controlToken });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    return `http://127.0.0.1:${address.port}`;
  }
  const secret = "synthetic-model-settings-secret-12345";
  const record = { display_name: "测试模型", base_url: "https://api.minimaxi.com/anthropic", api_format: "anthropic-messages",
    prompt_cache: "off", enabled: true, models: [{ model_id: "MiniMax-M3", enabled: true, context_tokens: 200000, vision: true }] };
  try {
    let origin = await start("a");
    const mutate = (body: unknown, method = "POST", authorized = true) => fetch(origin + "/api/settings/models/minimax", {
      method, headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(),
        ...(authorized ? { "x-molis-work-control-token": controlToken } : {}) },
      ...(method === "DELETE" ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal((await mutate(record, "POST", false)).status, 403);
    assert.equal((await mutate({ ...record, base_url: "https://username:password@example.com" })).status, 400);
    assert.equal((await mutate({ ...record, api_key: secret })).status, 400);
    const created = await fetch(origin + "/api/settings/connectors/connections", {
      method: "POST", headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(),
        "x-molis-work-control-token": controlToken },
      body: JSON.stringify({ service_id: "model-api", display_name: "模型测试账号", token: secret }),
    });
    assert.equal(created.status, 201);
    const connection = (await created.json() as { connection: { connection_id: string } }).connection;
    let response = await mutate({ ...record, connection_id: connection.connection_id });
    assert.equal(response.status, 200);
    assert.equal((await response.text()).includes(secret), false);
    response = await mutate({ ...record, display_name: "重新命名" });
    assert.equal(response.status, 200);
    assert.equal((await mutate({ ...record, base_url: "https://other.example/v1" })).status, 400);
    const beforeRestart = await (await fetch(origin + "/api/settings/models")).json();
    assert.equal(beforeRestart.health[0].status, "ready");
    assert.equal(beforeRestart.providers[0].models[0].context_tokens, 200000);
    assert.equal(beforeRestart.providers[0].base_url, record.base_url);
    const html = await (await fetch(origin + "/settings/models")).text();
    assert.ok(html.includes("data-model-save") && html.includes("重新命名"));
    assert.equal(html.includes(secret), false);
    assert.equal((await readFile(path.join(root, "a/feed/secrets.json"), "utf8")).includes(secret), false);
    await new Promise<void>((resolve) => servers[0]!.close(() => resolve()));
    origin = await start("a");
    const reopened = await (await fetch(origin + "/api/settings/models")).json();
    assert.equal(reopened.health[0].status, "ready");
    assert.equal(reopened.providers[0].display_name, "重新命名");
    const otherOrigin = await start("b");
    assert.deepEqual((await (await fetch(otherOrigin + "/api/settings/models")).json()).providers, []);
    assert.equal((await mutate(null, "DELETE")).status, 200);
    assert.deepEqual((await (await fetch(origin + "/api/settings/models")).json()).providers, []);
  } finally {
    await Promise.all(servers.filter((server) => server.listening).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    await rm(root, { recursive: true, force: true });
  }
});
