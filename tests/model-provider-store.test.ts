import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { KeychainUnavailableError } from "@molis-ai/molis-work-storage";

import {
  ModelProviderError,
  ModelProviderStore,
  modelCredentialRef,
  type ModelSecretPort,
} from "@molis-ai/molis-work-app-local-host";

/** C6 的存储层：记录进目录库，密钥进密钥库，两者不混。 */

function secretsDouble(): ModelSecretPort & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    put(ref, plaintext) { entries.set(ref, plaintext); },
    get(ref) { return entries.get(ref) ?? null; },
    delete(ref) { entries.delete(ref); },
  };
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "model-providers-"));
  const db = new DatabaseSync(join(directory, "catalog.db"));
  const secrets = secretsDouble();
  return { directory, db, secrets, store: new ModelProviderStore({ db, secrets }) };
}

test("密钥从不进表：行里只有一个指向密钥库的引用", async () => {
  const item = await fixture();
  try {
    item.store.upsert({
      provider_id: "minimax",
      display_name: "minimax",
      base_url: "https://api.minimaxi.com/anthropic",
      api_format: "anthropic-messages",
      models: [{ model_id: "MiniMax-M3", enabled: true }],
    });
    item.store.setCredential("minimax", "sk-super-secret-value");

    const rows = item.db.prepare("SELECT * FROM model_providers").all() as Array<Record<string, unknown>>;
    const dumped = JSON.stringify(rows);
    assert.equal(dumped.includes("sk-super-secret-value"), false, "整行序列化都不该出现密钥");
    assert.match(dumped, /model-provider:minimax/);
    // 密钥在密钥库里
    assert.equal(item.secrets.entries.get(modelCredentialRef("minimax")), "sk-super-secret-value");
  } finally {
    item.db.close();
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("编辑已绑定的模型供应商保留 Connector 引用，删除供应商也不删除共享密钥", async () => {
  const item = await fixture();
  try {
    item.store.upsert({ provider_id: "shared", display_name: "Shared", base_url: "https://models.example/v1",
      api_format: "openai-chat-completions", models: [{ model_id: "model-a", enabled: true }] });
    const ref = "connector-connection:11111111-1111-4111-8111-111111111111:token";
    item.secrets.put(ref, "shared-secret");
    item.store.selectConnection("shared", ref);
    const edited = item.store.upsert({ provider_id: "shared", display_name: "Shared edited", base_url: "https://models.example/v2",
      api_format: "openai-chat-completions", models: [{ model_id: "model-b", enabled: true }] });
    assert.equal(edited.credential_ref, ref);
    assert.equal(item.store.resolveConfiguration({ provider_id: "shared" })?.api_key, "shared-secret");
    item.store.remove("shared");
    assert.equal(item.secrets.get(ref), "shared-secret");
  } finally {
    item.db.close();
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("删供应商会把它的密钥一起删掉，不留孤儿", async () => {
  const item = await fixture();
  try {
    item.store.upsert({
      provider_id: "minimax", display_name: "minimax",
      base_url: "https://x.test", api_format: "openai-chat-completions",
    });
    item.store.setCredential("minimax", "sk-1");
    assert.equal(item.secrets.entries.size, 1);

    assert.equal(item.store.remove("minimax"), true);
    assert.equal(item.store.get("minimax"), null);
    assert.equal(item.secrets.entries.size, 0, "密钥不能留在盘上等着被下一个同名供应商捡走");
    assert.equal(item.store.remove("minimax"), false);
  } finally {
    item.db.close();
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("「有没有密钥」是问密钥库的，删掉密钥后状态立刻变", async () => {
  const item = await fixture();
  try {
    item.store.upsert({
      provider_id: "minimax", display_name: "minimax",
      base_url: "https://x.test", api_format: "anthropic-messages",
      models: [{ model_id: "m", enabled: true }],
    });
    assert.equal(item.store.hasCredential("minimax"), false);
    assert.equal(item.store.health()[0]?.status, "needs-credential");

    item.store.setCredential("minimax", "sk-1");
    assert.equal(item.store.hasCredential("minimax"), true);
    assert.equal(item.store.health()[0]?.status, "ready");

    item.secrets.delete(modelCredentialRef("minimax"));
    assert.equal(item.store.health()[0]?.status, "needs-credential", "记录没变，但状态必须跟着真实情况走");
  } finally {
    item.db.close();
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("配置解析宁可返回 null，也不给一个填不全的配置", async () => {
  const item = await fixture();
  try {
    assert.equal(item.store.resolveConfiguration(), null, "什么都没配时是 null");

    item.store.upsert({
      provider_id: "minimax", display_name: "minimax",
      base_url: "https://api.minimaxi.com/anthropic", api_format: "anthropic-messages",
      models: [{ model_id: "MiniMax-M3", enabled: true }],
    });
    assert.equal(item.store.resolveConfiguration(), null, "没密钥不算可用");

    item.store.setCredential("minimax", "sk-1");
    const resolved = item.store.resolveConfiguration();
    assert.equal(resolved?.model.model_id, "MiniMax-M3");
    assert.equal(resolved?.api_key, "sk-1");
    assert.equal(resolved?.provider.api_format, "anthropic-messages");

    item.store.upsert({
      provider_id: "minimax", display_name: "minimax",
      base_url: "https://api.minimaxi.com/anthropic", api_format: "anthropic-messages",
      enabled: false,
      models: [{ model_id: "MiniMax-M3", enabled: true }],
    });
    assert.equal(item.store.resolveConfiguration(), null, "关掉的供应商不参与");
  } finally {
    item.db.close();
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("不合法的 id、格式和空 Base URL 都被挡住", async () => {
  const item = await fixture();
  try {
    const base = { display_name: "x", base_url: "https://x.test", api_format: "anthropic-messages" } as const;
    assert.throws(() => item.store.upsert({ ...base, provider_id: "Bad Id" }),
      (error: unknown) => error instanceof ModelProviderError && error.code === "model-provider.invalid");
    assert.throws(() => item.store.upsert({ ...base, provider_id: "ok", api_format: "grpc" as never }),
      (error: unknown) => error instanceof ModelProviderError);
    assert.throws(() => item.store.upsert({ ...base, provider_id: "ok", base_url: "   " }),
      (error: unknown) => error instanceof ModelProviderError);
    assert.throws(() => item.store.setCredential("nope", "sk"),
      (error: unknown) => error instanceof ModelProviderError && error.code === "model-provider.unknown");
  } finally {
    item.db.close();
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("重开数据库后供应商还在，Base URL 末尾斜杠已归一", async () => {
  const directory = await mkdtemp(join(tmpdir(), "model-providers-"));
  const path = join(directory, "catalog.db");
  try {
    const first = new DatabaseSync(path);
    new ModelProviderStore({ db: first, secrets: secretsDouble() }).upsert({
      provider_id: "minimax", display_name: "minimax",
      base_url: "https://api.minimaxi.com/anthropic///", api_format: "anthropic-messages",
      models: [{ model_id: "MiniMax-M3", context_tokens: 1_000_000, vision: true, enabled: true }],
    });
    first.close();

    const second = new DatabaseSync(path);
    const reopened = new ModelProviderStore({ db: second, secrets: secretsDouble() }).get("minimax");
    assert.equal(reopened?.base_url, "https://api.minimaxi.com/anthropic");
    assert.equal(reopened?.models[0]?.context_tokens, 1_000_000);
    assert.equal(reopened?.models[0]?.vision, true);
    second.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("设置里配好的模型，能变成 Runtime 的启动配置", async () => {
  const { createModelConfigurationPort, prologueModelConfiguration } =
    await import("@molis-ai/molis-work-service-agent-host");
  const item = await fixture();
  try {
    // 什么都没配时，端口返回 null —— adapter 会据此报 needs_setup，而不是拿空密钥去撞供应商
    const port = createModelConfigurationPort({ resolve: () => item.store.resolveConfiguration() });
    assert.equal(await port(), null);

    item.store.upsert({
      provider_id: "minimax", display_name: "minimax",
      base_url: "https://api.minimaxi.com/anthropic", api_format: "anthropic-messages",
      models: [{ model_id: "MiniMax-M3", enabled: true }],
    });
    item.store.setCredential("minimax", "sk-super-secret-value");

    const configuration = await port();
    // Prologue 的名字，不是设置页的名字。原来这里断言的是 `"anthropic-messages"`——
    // 我们自己的写法——所以它只证明了我们和自己一致，而对面从来不认这个名字。
    // 一一对应关系由 `tests/model-protocol-mapping.test.ts` 钉在 Prologue 的适配器表上。
    assert.equal(configuration?.protocol, "anthropic-compatible");
    assert.equal(configuration?.endpoint, "https://api.minimaxi.com/anthropic/v1/messages");
    assert.equal(configuration?.model, "MiniMax-M3");
    // 传出去的是引用，不是密钥本身
    assert.equal(configuration?.credential_ref, "model-provider:minimax");
    assert.equal(JSON.stringify(configuration).includes("sk-super-secret-value"), false,
      "启动配置里绝不能出现密钥明文");

    assert.equal(prologueModelConfiguration(null), null);
  } finally {
    item.db.close();
    await rm(item.directory, { recursive: true, force: true });
  }
});


test("密钥库不可访问时保留供应商并明确不可用，移除失败不丢记录", async () => {
  const item = await fixture();
  try {
    item.store.upsert({ provider_id: "locked", display_name: "Locked provider", base_url: "https://example.test", api_format: "anthropic-messages" });
    const unavailable = new ModelProviderStore({ db: item.db, secrets: {
      get() { throw new Error("keychain locked"); }, put() { throw new Error("keychain locked"); }, delete() { throw new Error("keychain locked"); },
    } });
    assert.equal(unavailable.health()[0]?.status, "credential-unavailable");
    assert.equal(unavailable.health()[0]?.credential_status, "unavailable");
    assert.throws(() => unavailable.remove("locked"), /keychain locked/);
    assert.equal(unavailable.get("locked")?.display_name, "Locked provider");
    const stopped = new ModelProviderStore({ db: item.db, secrets: {
      get() { throw new KeychainUnavailableError(); }, put() {}, delete() {},
    } });
    assert.equal(stopped.health()[0]?.status, "credential-unavailable");
    assert.match(stopped.health()[0]!.detail, /已停止自动重试.*重启 Molis Work/u);
    assert.equal(stopped.get("locked")?.credential_ref, item.store.get("locked")?.credential_ref);
  } finally { item.db.close(); await rm(item.directory, { recursive: true, force: true }); }
});
