#!/usr/bin/env node
/**
 * Check that the configured model credential actually works.
 *
 * This is the first half of the real-model verification C5 needs: before
 * anything is wired through the Prologue adapter, confirm the endpoint, the
 * model name and the key are right. Reads .secrets/model.local.json, which is
 * gitignored.
 *
 * The key is never printed, never logged, and never written anywhere else.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const CONFIG = path.resolve(process.cwd(), ".secrets/model.local.json");

function fail(message, detail) {
  console.error(`✖ ${message}`);
  if (detail) console.error(`  ${detail}`);
  process.exit(1);
}

const raw = await readFile(CONFIG, "utf8").catch(() => null);
if (raw === null) fail("找不到 .secrets/model.local.json", "先填好凭据再跑这个脚本");

let config;
try {
  config = JSON.parse(raw);
} catch (error) {
  fail("凭据文件不是合法 JSON", error instanceof Error ? error.message : String(error));
}

const apiKey = String(config.api_key ?? "").trim();
if (apiKey === "") fail("api_key 还是空的", `把密钥填进 ${CONFIG} 的 api_key`);

const endpoint = String(config.endpoint ?? "").trim().replace(/\/+$/, "");
const model = String(config.model ?? "").trim();
if (endpoint === "" || model === "") fail("endpoint 或 model 是空的");

// Endpoint may already name the completion path; otherwise use the
// OpenAI-compatible one. MiniMax serves both shapes depending on the base.
const url = /completion/i.test(endpoint) ? endpoint : `${endpoint}/chat/completions`;

const headers = { "content-type": "application/json", authorization: `Bearer ${apiKey}` };
const groupId = String(config.group_id ?? "").trim();
if (groupId !== "") headers["GroupId"] = groupId;

console.log(`→ ${url}`);
console.log(`  model: ${model}`);
console.log(`  key:   已读取（${apiKey.length} 个字符，不打印内容）`);

const started = Date.now();
let response;
try {
  response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "回复两个字：收到" }],
      max_tokens: 32,
      stream: false,
    }),
    signal: AbortSignal.timeout(30_000),
  });
} catch (error) {
  fail("请求没发出去或超时", error instanceof Error ? error.message : String(error));
}

const bodyText = await response.text();
const elapsed = Date.now() - started;

if (!response.ok) {
  // The body can echo request fields; it never contains the key, which only
  // travels in the header. Truncated so an unexpected payload cannot flood.
  fail(`HTTP ${response.status}（${elapsed}ms）`, bodyText.slice(0, 600));
}

let payload;
try {
  payload = JSON.parse(bodyText);
} catch {
  fail("响应不是 JSON", bodyText.slice(0, 600));
}

const reply = payload?.choices?.[0]?.message?.content;
const apiError = payload?.base_resp?.status_msg ?? payload?.error?.message;
if (apiError && payload?.base_resp?.status_code !== 0) {
  fail(`接口返回错误：${apiError}`, bodyText.slice(0, 400));
}
if (typeof reply !== "string" || reply.trim() === "") {
  fail("拿到响应但没有正文", bodyText.slice(0, 600));
}

console.log(`✔ 凭据可用（${elapsed}ms）`);
console.log(`  模型回复：${reply.trim().slice(0, 80)}`);
const usage = payload?.usage;
if (usage) console.log(`  用量：${JSON.stringify(usage)}`);
