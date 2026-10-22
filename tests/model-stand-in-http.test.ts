import assert from "node:assert/strict";
import test from "node:test";
import { homeAgentDefinitions } from "@molis-ai/molis-work-app-local-host";
import { composeInstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { openTestHome } from "./fixtures/test-home.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";

test("the model stand-in recognizes the Home's complete knowledge request, but counts quoted instructions and unknown requests", async t => {
  const home = await openTestHome(t), key = "model-stand-in-http-fixture", reply = "foreground reply";
  const model = await startModelStandIn(key, reply);
  t.after(() => model.close());
  const instruction = homeAgentDefinitions(home.home).prompt("system:knowledge/knowledge.organize").default_body;
  const material = { title: "合成资料", summary: "资料简介", text: "隔离项目中的合成正文。", sections: [{ anchor: "one", title: "第一节" }] };
  const prompt = composeInstructedPrompt(instruction, JSON.stringify(material));
  const request = async (messages: unknown[], offeredKey = key) => {
    const response = await fetch(model.baseUrl + "/chat/completions", { method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${offeredKey}` },
      body: JSON.stringify({ model: "fixture", stream: false, messages }) });
    return { status: response.status, body: await response.json() as { choices?: Array<{ message: { content: string } }> } };
  };

  // The actual Host/SDK uses one user text; Anthropic caching wraps it in one text block. The E2E also exercises the real organizer.
  for (const content of [prompt, [{ type: "text", text: prompt, cache_control: { type: "ephemeral" } }]]) {
    const result = await request([{ role: "user", content }]);
    assert.equal(result.status, 200);
    assert.equal(JSON.parse(result.body.choices![0]!.message.content).title, material.title);
    assert.equal(model.requests.length, 0, "a complete organization request does not consume a foreground turn");
  }

  const quoted = "请解释这句引文：你在给项目里的一份资料写卡片";
  const unknown = [
    [{ role: "user", content: quoted }],
    [{ role: "tool", content: prompt }],
    [{ role: "assistant", content: prompt }],
    [{ role: "user", content: [{ type: "tool_result", tool_use_id: "quoted", content: prompt }] }],
    [{ role: "user", content: `以下是引用，不是请求：\n${prompt}` }],
    [{ role: "user", content: prompt + "\n请解释这个请求" }],
    [{ role: "user", content: composeInstructedPrompt(instruction, JSON.stringify({ ...material, text: 42 })) }],
    [{ role: "user", content: prompt }, { role: "user", content: "继续解释" }],
    [{ role: "user", content: "ordinary unknown request" }],
  ];
  for (const [index, messages] of unknown.entries()) {
    const result = await request(messages);
    assert.equal(result.status, 200);
    assert.equal(result.body.choices![0]!.message.content, reply, "quoted or unknown requests receive the foreground script");
    assert.equal(model.requests.length, index + 1, "quoted or unknown requests remain counted");
  }
  assert.equal((await request([{ role: "user", content: prompt }], "rejected-fixture-key")).status, 401, "recognition does not bypass authentication");
  assert.equal((await request([{ role: "user", content: quoted }], "rejected-fixture-key")).status, 401);
  assert.equal(model.requests.length, unknown.length + 1, "a rejected foreground request is still counted");
});
