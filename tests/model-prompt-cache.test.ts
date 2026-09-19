import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DatabaseSync } from "node:sqlite";
import {
  inspectPromptCacheChoice,
  promptCacheIsClientControlled,
  type ModelProviderRecord,
} from "@molis-ai/molis-work-contracts/modules/model-providers";
import { ModelProviderStore, addPromptCacheColumn } from "@molis-ai/molis-work-app-local-host";
import { prologueModelConfiguration } from "@molis-ai/molis-work-service-agent-host";
import {
  formatContext,
  renderModelSettingsDocument,
  type ModelSettingsPrimitives,
} from "@molis-ai/molis-work-app-workbench";

/**
 * 提示缓存是一个**选择**，不是我们替用户做的优化。
 *
 * 三件事在这里立住：没选过就是关着（行为和「没有缓存这回事」一样）；
 * 打不开断点的格式上给不了「必须命中」，而且在**保存的时候**就说清楚；
 * 关着的时候一个字段都不往外发。
 */

const p: ModelSettingsPrimitives = {
  L: (text) => text,
  escape: (value) => String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  icon: (name) => `<i data-icon="${name}"></i>`,
};

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "model-prompt-cache-"));
  const db = new DatabaseSync(join(directory, "catalog.db"));
  const secrets = new Map<string, string>();
  const store = new ModelProviderStore({
    db: db as never,
    secrets: {
      put: (ref, value) => { secrets.set(ref, value); },
      get: (ref) => secrets.get(ref) ?? null,
      delete: (ref) => { secrets.delete(ref); },
    },
  });
  return { directory, db, store };
}

function record(overrides: Partial<ModelProviderRecord> = {}): ModelProviderRecord {
  return {
    provider_id: "minimax",
    display_name: "minimax",
    base_url: "https://api.minimaxi.com/anthropic",
    api_format: "anthropic-messages",
    credential_ref: "model-provider:minimax",
    enabled: true,
    models: [{ model_id: "MiniMax-M3", enabled: true }],
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    ...overrides,
  };
}

test("没选过就是关着，而不是替用户开一个他没要的东西", () => {
  const item = fixture();
  try {
    const saved = item.store.upsert({
      provider_id: "minimax", display_name: "minimax",
      base_url: "https://api.minimaxi.com/anthropic", api_format: "anthropic-messages",
    });
    assert.equal(saved.prompt_cache, "off");
    assert.equal(item.store.get("minimax")?.prompt_cache, "off");
  } finally {
    item.db.close();
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("打不开断点的格式上，「必须命中」在保存时就被拒", () => {
  const item = fixture();
  try {
    assert.throws(
      () => item.store.upsert({
        provider_id: "openai", display_name: "openai",
        base_url: "https://api.openai.com/v1", api_format: "openai-chat-completions",
        prompt_cache: "required",
      }),
      /必须命中/,
      "等到某次 Run 才失败，用户已经离开那个字段很久了",
    );
    assert.equal(item.store.get("openai"), null, "被拒的配置不能留下半条记录");

    // 「尽量命中」在两种格式上都是合法选择——对面自己做前缀缓存不等于不能选。
    const best = item.store.upsert({
      provider_id: "openai", display_name: "openai",
      base_url: "https://api.openai.com/v1", api_format: "openai-chat-completions",
      prompt_cache: "best-effort",
    });
    assert.equal(best.prompt_cache, "best-effort");
  } finally {
    item.db.close();
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("换了格式之后，原来合法的档位会重新判一次", () => {
  const item = fixture();
  try {
    item.store.upsert({
      provider_id: "p", display_name: "p", base_url: "https://x.test",
      api_format: "anthropic-messages", prompt_cache: "required",
    });
    assert.throws(
      () => item.store.upsert({
        provider_id: "p", display_name: "p", base_url: "https://x.test",
        api_format: "openai-chat-completions",
      }),
      /必须命中/,
      "改格式不该让一个已经存着的档位偷偷变成做不到的承诺",
    );
  } finally {
    item.db.close();
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("旧库补上这一列之后，已有的供应商是关着的", () => {
  const directory = mkdtempSync(join(tmpdir(), "model-prompt-cache-old-"));
  const db = new DatabaseSync(join(directory, "catalog.db"));
  try {
    // 这一列出现之前的建表语句。
    db.exec(`CREATE TABLE model_providers (
      provider_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, base_url TEXT NOT NULL,
      api_format TEXT NOT NULL, credential_ref TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      models_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    db.exec(`INSERT INTO model_providers VALUES
      ('old', 'old', 'https://x.test', 'anthropic-messages', 'model-provider:old', 1, '[]', 'a', 'b')`);

    addPromptCacheColumn(db as never);
    addPromptCacheColumn(db as never); // 再来一次不能炸：迁移要能重复跑

    const store = new ModelProviderStore({
      db: db as never,
      secrets: { put: () => {}, get: () => null, delete: () => {} },
    });
    assert.equal(store.get("old")?.prompt_cache, "off",
      "老配置没要过缓存，升级不该替它要");
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("关着的时候，启动配置里一个缓存字段都没有", () => {
  const off = prologueModelConfiguration({
    provider: record({ prompt_cache: "off" }),
    model: { model_id: "m", enabled: true },
    api_key: "k",
  });
  assert.equal("prompt_cache" in (off ?? {}), false,
    "关着就该和「没有缓存这回事」完全一样，不多发一个字段");

  const absent = prologueModelConfiguration({
    provider: record(),
    model: { model_id: "m", enabled: true },
    api_key: "k",
  });
  assert.equal("prompt_cache" in (absent ?? {}), false);

  const on = prologueModelConfiguration({
    provider: record({ prompt_cache: "best-effort" }),
    model: { model_id: "m", enabled: true },
    api_key: "k",
  });
  assert.equal(on?.prompt_cache, "best-effort");
});

test("设置页在给不了「必须命中」的格式上不摆这个选项", () => {
  const openai = record({
    provider_id: "openai", api_format: "openai-chat-completions", base_url: "https://api.openai.com/v1",
  });
  const html = renderModelSettingsDocument({
    providers: [openai], health: [], selected_provider_id: "openai", primitives: p,
  });
  assert.equal(html.includes('data-model-prompt-cache="openai"'), true);
  assert.equal(html.includes('value="required"'), false,
    "摆一个永远选不了的选项，用户学不到任何东西");
  assert.match(html, /没有我们能打开的开关/);

  const anthropic = renderModelSettingsDocument({
    providers: [record()], health: [], selected_provider_id: "minimax", primitives: p,
  });
  assert.equal(anthropic.includes('value="required"'), true);
});

test("能不能打开断点是按格式判的，不是按供应商名字", () => {
  assert.equal(promptCacheIsClientControlled("anthropic-messages"), true);
  assert.equal(promptCacheIsClientControlled("openai-chat-completions"), false);
  assert.equal(inspectPromptCacheChoice({ api_format: "anthropic-messages", prompt_cache: "required" }), null);
  assert.equal(inspectPromptCacheChoice({ api_format: "openai-chat-completions", prompt_cache: "off" }), null);
  assert.match(
    inspectPromptCacheChoice({ api_format: "openai-chat-completions", prompt_cache: "required" }) ?? "",
    /必须命中/,
  );
  // 这一行只是确认上面那个渲染测试用的辅助还在，不是这条的重点。
  assert.equal(typeof formatContext, "function");
});
