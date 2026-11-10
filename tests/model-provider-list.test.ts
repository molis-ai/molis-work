import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { listProviderModels, modelListRequest, readModelList } from "@molis-ai/molis-work-service-agent-host";
import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";

// ASC-56: the settings page asks a model service for its models (spec assistant-service-connections §13.2, PF-A04).

const listen = async (server: Server) => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
};

test("ASC-56 每种格式按自己的地址和头要列表，读出去重、排序、有上限的模型名", async () => {
  const anthropic = modelListRequest("https://api.anthropic.com/", "anthropic-messages", "k-anthropic");
  assert.equal(anthropic.url.href, "https://api.anthropic.com/v1/models?limit=1000");
  assert.equal(anthropic.headers["x-api-key"], "k-anthropic");
  assert.equal(anthropic.headers["anthropic-version"], "2023-06-01");
  assert.equal("authorization" in anthropic.headers, false);
  const openai = modelListRequest("https://api.openai.com/v1", "openai-chat-completions", "k-openai");
  assert.equal(openai.url.href, "https://api.openai.com/v1/models");
  assert.equal(openai.headers.authorization, "Bearer k-openai");
  assert.equal("x-api-key" in openai.headers, false);
  for (const bad of ["http://example.com", "https://u:p@example.com", "https://example.com/?a=1", "not a url"]) {
    assert.throws(() => modelListRequest(bad, "anthropic-messages", "k"), (error: { code?: string }) => error.code === "agent.model_list.invalid_url");
  }
  assert.equal(modelListRequest("http://127.0.0.1:11434/v1", "openai-chat-completions", "k").url.href, "http://127.0.0.1:11434/v1/models");

  const listed = readModelList(JSON.stringify({ data: [
    { id: "b-model", display_name: "B" }, { id: "a-model" }, { id: "b-model" }, { id: "" }, { id: 7 }, null, { id: "c", display_name: "c" },
  ] }));
  assert.deepEqual(listed, [{ model_id: "a-model" }, { model_id: "b-model", display_name: "B" }, { model_id: "c" }]);
  assert.equal(readModelList(JSON.stringify({ data: Array.from({ length: 700 }, (_, index) => ({ id: `m-${String(index).padStart(3, "0")}` })) })).length, 500);
  assert.throws(() => readModelList("<html>"), (error: { code?: string }) => error.code === "agent.model_list.response_invalid");
  assert.throws(() => readModelList(JSON.stringify({ models: [] })), (error: { code?: string }) => error.code === "agent.model_list.response_invalid");

  const answers: Array<[number, string]> = [[401, "agent.model_list.key_rejected"], [403, "agent.model_list.key_rejected"], [404, "agent.model_list.unsupported"],
    [405, "agent.model_list.unsupported"], [429, "agent.model_list.rate_limited"], [500, "agent.model_list.provider_failed"], [302, "agent.model_list.provider_failed"]];
  for (const [status, code] of answers) {
    await assert.rejects(listProviderModels({ base_url: "https://example.com", api_format: "anthropic-messages", api_key: "secret-key-value" },
      { send: async () => ({ status, body: "" }) }), (error: { code?: string; message: string }) => error.code === code && !error.message.includes("secret-key-value"));
  }
});

test("ASC-56 设置页取模型：填的密钥、已存的连接都能取；已存密钥只去它绑定的地址；什么都不写", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "molis-model-list-"));
  const controlToken = "model-list-control-token-0123456789abcdef";
  const seen: Array<{ origin: string; url: string; headers: IncomingHttpHeaders }> = [];
  let answer: { status: number; body: string } = { status: 200, body: "" };
  const service = () => {
    const server = createServer((request, response) => {
      const address = server.address();
      seen.push({ origin: `http://127.0.0.1:${address && typeof address === "object" ? address.port : 0}`, url: request.url ?? "", headers: request.headers });
      response.writeHead(answer.status, { "content-type": "application/json" }).end(answer.body);
    });
    return server;
  };
  const first = service(), second = service();
  const web = createMolisWorkWebServer({ homeDirectory: path.join(root, "home"), controlToken });
  // A fresh made-up key per run: it is only ever compared, never a real credential.
  const secret = `model-list-test-${randomUUID()}`;
  try {
    const [serviceA, serviceB, origin] = [await listen(first), await listen(second), await listen(web)];
    const headers = (authorized = true) => ({ origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(),
      ...(authorized ? { "x-molis-work-control-token": controlToken } : {}) });
    const ask = (body: unknown, authorized = true) => fetch(`${origin}/api/settings/models/listed/models`, { method: "POST", headers: headers(authorized), body: JSON.stringify(body) });
    answer = { status: 200, body: JSON.stringify({ data: [{ id: "model-b", display_name: "Model B" }, { id: "model-a" }] }) };

    // Without the page's token nothing is sent to the service.
    assert.equal((await ask({ base_url: serviceA, api_format: "anthropic-messages", api_key: secret }, false)).status, 403);
    assert.equal(seen.length, 0);

    // D0276: a list with no key or an unknown connection rejects without creating or changing the registry.
    const registryPath = path.join(root, "home", "connectors", "connectors.db");
    const registrySnapshot = () => existsSync(registryPath) ? readFileSync(registryPath) : null;
    const registryBefore = registrySnapshot();
    for (const form of [{ base_url: serviceA, api_format: "anthropic-messages" },
      { base_url: serviceA, api_format: "anthropic-messages", connection_id: "missing-connection" }]) {
      assert.equal((await ask(form)).status, 400);
      assert.equal(seen.length, 0, "a missing key never contacts a service");
      assert.deepEqual(registrySnapshot(), registryBefore, "a failed read never creates or changes the registry");
    }

    // A typed key goes to the address on the form, in the format's own header.
    let response = await ask({ base_url: serviceA, api_format: "anthropic-messages", api_key: secret });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { models: [{ model_id: "model-a" }, { model_id: "model-b", display_name: "Model B" }] });
    assert.equal(seen.at(-1)?.url, "/v1/models?limit=1000");
    assert.equal(seen.at(-1)?.headers["x-api-key"], secret);
    response = await ask({ base_url: serviceA, api_format: "openai-chat-completions", api_key: secret });
    assert.equal(response.status, 200);
    assert.equal(seen.at(-1)?.url, "/models");
    assert.equal(seen.at(-1)?.headers.authorization, `Bearer ${secret}`);

    // Listing wrote nothing: no provider, no connection.
    const settings = async () => await (await fetch(`${origin}/api/settings/models`)).json() as { providers: unknown[] };
    const connections = async () => (await (await fetch(`${origin}/api/settings/connectors/connections`)).json() as { connections: unknown[] }).connections.length;
    assert.equal((await settings()).providers.length, 0);
    assert.equal(await connections(), 0);

    // Save the provider with its key: the key becomes a connection pinned to service A.
    const saved = await fetch(`${origin}/api/settings/models/listed`, { method: "POST", headers: headers(), body: JSON.stringify({
      display_name: "列表测试", base_url: serviceA, api_format: "anthropic-messages", enabled: true, prompt_cache: "off",
      models: [{ model_id: "model-a", enabled: true }], api_key: secret,
    }) });
    assert.equal(saved.status, 200);
    const pinned = await connections();
    assert.equal(pinned, 1);

    // The saved key, with nothing typed, goes to the address it is pinned to.
    const before = seen.length;
    response = await ask({ base_url: serviceA, api_format: "anthropic-messages" });
    assert.equal(response.status, 200);
    assert.equal(seen.length, before + 1);
    assert.equal(seen.at(-1)?.headers["x-api-key"], secret);

    // ...and never to another one: refused before the key is read, nothing reaches service B.
    response = await ask({ base_url: serviceB, api_format: "anthropic-messages" });
    assert.equal(response.status, 400);
    const refused = await response.text();
    assert.match(refused, /已绑定/u);
    assert.equal(refused.includes(secret), false);
    assert.equal(seen.filter((row) => row.origin === serviceB).length, 0);
    assert.equal(await connections(), pinned);

    // A typed key and a chosen connection together are refused; a typed key that is too short too.
    assert.equal((await ask({ base_url: serviceA, api_format: "anthropic-messages", api_key: secret, connection_id: "x" })).status, 400);
    assert.equal((await ask({ base_url: serviceA, api_format: "anthropic-messages", api_key: "short" })).status, 400);
    // A provider with nothing saved and nothing typed has no key to ask with.
    const unsaved = await fetch(`${origin}/api/settings/models/other/models`, { method: "POST", headers: headers(), body: JSON.stringify({ base_url: serviceA, api_format: "anthropic-messages" }) });
    assert.equal(unsaved.status, 400);
    assert.match(await unsaved.text(), /API Key/u);

    // Each refusal from the service is told in words the page shows, never with the key.
    for (const [status, words] of [[401, /拒绝了这个 API Key（401）/u], [404, /不提供模型列表/u], [429, /额度用完/u], [503, /没有给出模型列表（503）/u]] as const) {
      answer = { status, body: "{}" };
      response = await ask({ base_url: serviceA, api_format: "anthropic-messages", api_key: secret });
      assert.equal(response.status, 400);
      const text = await response.text();
      assert.match(text, words);
      assert.equal(text.includes(secret), false);
    }
    answer = { status: 200, body: "<html>not json</html>" };
    response = await ask({ base_url: serviceA, api_format: "anthropic-messages", api_key: secret });
    assert.match(await response.text(), /不是模型列表/u);
    // A service that is not there.
    await new Promise<void>((resolve) => second.close(() => resolve()));
    response = await ask({ base_url: serviceB, api_format: "openai-chat-completions", api_key: secret });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /连不上这个地址/u);
    assert.equal(await connections(), pinned);
  } finally {
    for (const server of [first, second, web]) if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
