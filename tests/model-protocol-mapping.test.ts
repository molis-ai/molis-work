import assert from "node:assert/strict";
import test from "node:test";

import {
  promptCacheIsClientControlled,
  type ModelApiFormat,
} from "@molis-ai/molis-work-contracts/modules/model-providers";
import {
  prologueAcceptsProtocol,
  prologueModelConfiguration,
  prologueProtocolFacts,
  prologueProtocolFor,
} from "@molis-ai/molis-work-service-agent-host";

/**
 * 我们的名字和 Prologue 的名字之间那一次翻译。
 *
 * 之前这里没有翻译：`api_format` 被原样当成 protocol 传过去，而 Prologue 按精确字符串查表，
 * 于是**每一个 Run 都在查表这一步失败**。编译器拦不住（两边都是 `string`），
 * 原来的测试也拦不住——它断言的是我们自己的名字，只证明了我们和自己一致。
 *
 * 所以这里的断言一律钉在 **Prologue 自己导出的适配器表**上。它改名就红。
 */

const FORMATS: readonly ModelApiFormat[] = ["anthropic-messages", "openai-chat-completions"];

function provider(api_format: ModelApiFormat) {
  return {
    provider: {
      provider_id: "p", display_name: "p", base_url: "https://example.test",
      api_format, credential_ref: "model-provider:p", enabled: true, models: [],
      created_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-20T00:00:00Z",
    },
    model: { model_id: "m", enabled: true },
    api_key: "sk-not-a-real-key",
  };
}

test("每一种 API 格式都译得出 Prologue 真的认识的 protocol", () => {
  for (const format of FORMATS) {
    const protocol = prologueProtocolFor(format);
    assert.equal(prologueAcceptsProtocol(protocol), true, `Prologue 不认识 ${protocol}`);
  }
});

test("我们自己的名字直接喂给 Prologue 会被拒——这正是当初的缺陷", () => {
  for (const format of FORMATS) {
    assert.equal(prologueAcceptsProtocol(format), false,
      `${format} 竟然被接受了：两套名字重合之后，这条测试就不再证明任何事，该删掉`);
  }
});

test("两套名字一一对应，没有两种格式挤到同一条线上", () => {
  const mapped = FORMATS.map((format) => prologueProtocolFor(format));
  assert.equal(new Set(mapped).size, FORMATS.length, "两种格式不能映射到同一个 protocol");
  assert.deepEqual([...mapped].sort(), prologueProtocolFacts().map((entry) => entry.protocol).sort(),
    "Prologue 有而我们没用到的线，或者反过来，都要在这里被看见");
});

test("启动配置里的 protocol 是 Prologue 那一套，不是设置页那一套", () => {
  const configuration = prologueModelConfiguration(provider("anthropic-messages"));
  assert.equal(configuration?.protocol, "anthropic-compatible");
  assert.notEqual(configuration?.protocol, "anthropic-messages",
    "传我们自己的名字过去，Prologue 查不到表");
});

test("能不能由我们打开缓存断点，以 Prologue 的申报为准", () => {
  const byProtocol = new Map(prologueProtocolFacts().map((entry) => [entry.protocol, entry.prompt_cache]));
  for (const format of FORMATS) {
    assert.equal(
      promptCacheIsClientControlled(format),
      byProtocol.get(prologueProtocolFor(format)),
      `${format} 这一侧对缓存断点的判断和 Prologue 说的不一致`,
    );
  }
});
