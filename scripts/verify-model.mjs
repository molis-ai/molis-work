#!/usr/bin/env node
/**
 * Check that a configured model credential actually works.
 *
 * Speaks both shapes the product must support: OpenAI-compatible chat
 * completions and Anthropic messages. Reads .secrets/model.local.json, which is
 * gitignored. The key is never printed, logged or written anywhere else — it
 * only ever travels in a request header.
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
if (raw === null) fail("找不到 .secrets/model.local.json");

let config;
try {
  config = JSON.parse(raw);
} catch (error) {
  fail("凭据文件不是合法 JSON", error instanceof Error ? error.message : String(error));
}

// Overrides let one credential be checked against another shape without
// copying the key into a second file.
const apiKey = String(config.api_key ?? "").trim();
const endpoint = String(process.env.VERIFY_ENDPOINT ?? config.endpoint ?? "")
  .trim().replace(/\/+$/, "");
const model = String(process.env.VERIFY_MODEL ?? config.model ?? "").trim();
const protocol = String(process.env.VERIFY_PROTOCOL ?? config.protocol ?? "openai-compatible").trim();
if (apiKey === "") fail("api_key 还是空的");
if (endpoint === "" || model === "") fail("endpoint 或 model 是空的");

const PROMPT = "回复两个字：收到";

/** Each protocol owns its url, headers, body and how a reply is read back. */
const SHAPES = {
  "openai-compatible": {
    url: () => /completion/i.test(endpoint) ? endpoint : `${endpoint}/chat/completions`,
    headers: () => ({ "content-type": "application/json", authorization: `Bearer ${apiKey}` }),
    body: () => ({ model, messages: [{ role: "user", content: PROMPT }], max_tokens: 32, stream: false }),
    reply: (payload) => payload?.choices?.[0]?.message?.content,
    usage: (payload) => payload?.usage,
    error: (payload) => payload?.error?.message
      ?? (payload?.base_resp?.status_code ? payload.base_resp.status_msg : undefined),
  },
  "anthropic-messages": {
    url: () => /\/messages$/.test(endpoint) ? endpoint : `${endpoint}/v1/messages`,
    headers: () => ({
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    }),
    body: () => ({ model, max_tokens: 32, messages: [{ role: "user", content: PROMPT }] }),
    reply: (payload) => payload?.content?.find?.((part) => part?.type === "text")?.text,
    usage: (payload) => payload?.usage,
    error: (payload) => payload?.error?.message,
  },
};

const shape = SHAPES[protocol];
if (!shape) fail(`不认识的 protocol：${protocol}`, `支持：${Object.keys(SHAPES).join(" / ")}`);

const url = shape.url();
const groupId = String(config.group_id ?? "").trim();
const headers = shape.headers();
if (groupId !== "") headers.GroupId = groupId;

console.log(`→ ${protocol}`);
console.log(`  ${url}`);
console.log(`  model: ${model}`);
console.log(`  key:   已读取（${apiKey.length} 个字符，不打印内容）`);

const started = Date.now();
let response;
try {
  response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(shape.body()),
    signal: AbortSignal.timeout(60_000),
  });
} catch (error) {
  fail("请求没发出去或超时", error instanceof Error ? error.message : String(error));
}

const bodyText = await response.text();
const elapsed = Date.now() - started;

if (!response.ok) {
  fail(`HTTP ${response.status}（${elapsed}ms）`, bodyText.slice(0, 700));
}

let payload;
try {
  payload = JSON.parse(bodyText);
} catch {
  fail("响应不是 JSON", bodyText.slice(0, 700));
}

const apiError = shape.error(payload);
if (apiError) fail(`接口返回错误：${apiError}`, bodyText.slice(0, 500));

const reply = shape.reply(payload);
if (typeof reply !== "string" || reply.trim() === "") {
  fail("拿到响应但没有正文", bodyText.slice(0, 700));
}

console.log(`✔ 凭据可用（${elapsed}ms）`);
console.log(`  模型回复：${reply.trim().slice(0, 80)}`);
const usage = shape.usage(payload);
if (usage) console.log(`  用量：${JSON.stringify(usage)}`);
