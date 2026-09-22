import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_CONNECTORS } from "../plugins/official-integrations/catalog/src/catalog.js";
import { catalogWhoami } from "../plugins/official-integrations/catalog/src/provider.js";
import {
  ExternalDocumentImportError, readExternalDocument, type ExternalDocumentSource,
} from "../plugins/official-integrations/catalog/src/document-import.js";

const NOTION_ID = "12345678-1234-1234-1234-123456789abc";
const NOTION_URL = `https://team.notion.site/Notes-${NOTION_ID.replaceAll("-", "")}?shared=private#heading`;
const DOC_ID = "DocToken1234567890";
const GOOGLE_ID = "GoogleDocument_1234567890";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});
const page = () => ({ object: "page", properties: { title: { type: "title", title: [{ plain_text: "项目" }, { plain_text: "说明" }] } } });
const markdown = (overrides: Record<string, unknown> = {}) => ({
  object: "page_markdown", markdown: "# 项目\n\n这是正文。", truncated: false, unknown_block_ids: [], ...overrides,
});

function errorCode(code: string, status?: number) {
  return (error: unknown) => error instanceof ExternalDocumentImportError && error.code === code
    && (status === undefined || error.status === status);
}

test("Notion import uses fixed API endpoints, current markdown version, complete title and no sharing secrets", async () => {
  const requested: string[] = [];
  const result = await readExternalDocument({ source: "notion", url: NOTION_URL }, {
    token: "notion-secret",
    fetch: async (input, init) => {
      requested.push(String(input));
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal);
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer notion-secret");
      assert.equal(new Headers(init?.headers).get("Notion-Version"), "2026-03-11");
      return json(String(input).endsWith("/markdown") ? markdown() : page());
    },
  });
  assert.deepEqual(requested, [`https://api.notion.com/v1/pages/${NOTION_ID}`, `https://api.notion.com/v1/pages/${NOTION_ID}/markdown`]);
  assert.equal(result.source_id, NOTION_ID);
  assert.equal(result.title, "项目说明");
  assert.equal(result.content, "# 项目\n\n这是正文。");
  assert.equal(result.format, "markdown");
  assert.doesNotMatch(result.source_url, /shared|private|heading/u);
});

test("Notion import refuses truncated, inaccessible and empty page content", async () => {
  for (const [body, code] of [
    [markdown({ truncated: true }), "incomplete_content"],
    [markdown({ unknown_block_ids: [NOTION_ID] }), "incomplete_content"],
    [markdown({ markdown: " \n\t" }), "empty_content"],
    [{ markdown: "apparently successful" }, "provider"],
  ] as const) {
    await assert.rejects(readExternalDocument({ source: "notion", url: NOTION_URL }, {
      token: "notion-secret", fetch: async (input) => json(String(input).endsWith("/markdown") ? body : page()),
    }), errorCode(code));
  }
});

test("Notion unsupported blocks remain visible with an explicit warning", async () => {
  const result = await readExternalDocument({ source: "notion", url: NOTION_URL }, {
    token: "notion-secret", fetch: async (input) => json(String(input).endsWith("/markdown")
      ? markdown({ markdown: "正文\n<unknown url=\"https://notion.so/block\"/>" }) : page()),
  });
  assert.equal(result.warnings.length, 2);
  assert.match(result.content, /<unknown/u);
});

test("invalid provider hosts and non-document paths fail before any credentialed request", async () => {
  const inputs: { source: ExternalDocumentSource; url: string }[] = [
    { source: "notion", url: "https://notion.so.attacker.invalid/12345678123412341234123456789abc" },
    { source: "notion", url: "https://user:secret@notion.so/12345678123412341234123456789abc" },
    { source: "notion", url: "http://notion.so/12345678123412341234123456789abc" },
    { source: "notion", url: "https://notion.so:444/12345678123412341234123456789abc" },
    { source: "feishu", url: `https://team.larksuite.com/docx/${DOC_ID}` },
    { source: "lark", url: `https://team.feishu.cn/docx/${DOC_ID}` },
    { source: "feishu", url: "https://127.0.0.1/docx/DocToken1234567890" },
    { source: "feishu", url: "https://team.feishu.cn/docx/%2Fsecret" },
    { source: "google-docs", url: "https://docs.google.com/spreadsheets/d/GoogleDocument_1234567890/edit" },
    { source: "google-docs", url: "https://docs.google.com/document/d/e/publishedDocument123/pub" },
  ];
  for (const input of inputs) {
    await assert.rejects(readExternalDocument(input, { token: "secret", fetch: async () => { throw new Error("must not fetch"); } }), errorCode("invalid_url", 400));
  }
});

test("Feishu and Lark wiki imports resolve to the underlying document using isolated API origins", async () => {
  for (const source of ["feishu", "lark"] as const) {
    const base = source === "feishu" ? "feishu.cn" : "larksuite.com";
    const urls: string[] = [];
    const result = await readExternalDocument({ source, url: `https://team.${base}/wiki/WikiToken1234567890?from=private` }, {
      token: `cli_${source}:private-${source}-secret`,
      fetch: async (input, init) => {
        const url = String(input);
        urls.push(url);
        assert.equal(new URL(url).origin, `https://open.${base}`);
        assert.equal(init?.redirect, "error");
        if (url.endsWith("/internal")) {
          assert.equal(init?.method, "POST");
          assert.deepEqual(JSON.parse(String(init?.body)), { app_id: `cli_${source}`, app_secret: `private-${source}-secret` });
          return json({ code: 0, tenant_access_token: `${source}-access` });
        }
        assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${source}-access`);
        if (url.includes("/get_node?")) return json({ code: 0, data: { node: { obj_type: "docx", obj_token: DOC_ID } } });
        if (url.endsWith("/raw_content")) return json({ code: 0, data: { content: "真实文档的正文\n第二段。" } });
        return json({ code: 0, data: { document: { document_id: DOC_ID, title: "工作说明", revision_id: 12 } } });
      },
    });
    assert.equal(urls.length, 4);
    assert.equal(result.source_id, DOC_ID);
    assert.equal(result.source_url, `https://team.${base}/wiki/WikiToken1234567890`);
    assert.equal(result.content, "真实文档的正文\n第二段。");
    assert.equal(result.format, "text");
    assert.ok(result.warnings.some((warning) => warning.includes("图片")));
  }
});

test("Feishu refuses unsupported wiki objects and upstream business errors without exposing payloads", async () => {
  for (const [body, code] of [
    [{ code: 0, data: { node: { obj_type: "sheet", obj_token: DOC_ID } } }, "unsupported_document"],
    [{ code: 131006, msg: "permission denied SECRET BODY" }, "permission_denied"],
    [{ code: 1770002, msg: "SECRET BODY" }, "not_found"],
  ] as const) {
    await assert.rejects(readExternalDocument({ source: "feishu", url: "https://team.feishu.cn/wiki/WikiToken1234567890" }, {
      token: "cli_example:secret", fetch: async (input) => json(String(input).endsWith("/internal") ? { code: 0, tenant_access_token: "access" } : body),
    }), (error: unknown) => errorCode(code)(error) && !String(error).includes("SECRET"));
  }
});

test("Google Docs import verifies type and downloads plain text using Drive scope", async () => {
  const urls: string[] = [];
  const result = await readExternalDocument({ source: "google-docs", url: `https://docs.google.com/document/d/${GOOGLE_ID}/edit?usp=sharing` }, {
    token: "google-secret", fetch: async (input, init) => {
      const url = String(input);
      urls.push(url);
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer google-secret");
      if (url.includes("/export?")) return new Response("Google 正文", { headers: { "content-type": "text/plain" } });
      return json({ id: GOOGLE_ID, name: "Google 说明", mimeType: "application/vnd.google-apps.document", capabilities: { canDownload: true } });
    },
  });
  assert.equal(result.title, "Google 说明");
  assert.equal(result.content, "Google 正文");
  assert.equal(urls[1], `https://www.googleapis.com/drive/v3/files/${GOOGLE_ID}/export?mimeType=text%2Fplain`);
  assert.equal(result.source_url, `https://docs.google.com/document/d/${GOOGLE_ID}/edit`);
});

test("Google Docs download restrictions fail before requesting document content", async () => {
  let calls = 0;
  await assert.rejects(readExternalDocument({ source: "google-docs", url: `https://docs.google.com/document/d/${GOOGLE_ID}/edit` }, {
    token: "google-secret", fetch: async () => {
      calls += 1;
      return json({ id: GOOGLE_ID, mimeType: "application/vnd.google-apps.document", capabilities: { canDownload: false } });
    },
  }), errorCode("permission_denied", 403));
  assert.equal(calls, 1);
});

test("provider auth, rate-limit, redirect and network failures cannot become successful imports", async () => {
  for (const [status, code] of [[401, "needs_auth"], [403, "permission_denied"], [404, "not_found"], [429, "rate_limited"], [302, "provider"], [503, "provider"]] as const) {
    await assert.rejects(readExternalDocument({ source: "notion", url: NOTION_URL }, {
      token: "private-token", fetch: async () => new Response("SENSITIVE ERROR BODY", { status }),
    }), (error: unknown) => errorCode(code)(error) && !String(error).includes("SENSITIVE"));
  }
  await assert.rejects(readExternalDocument({ source: "notion", url: NOTION_URL }, {
    token: "private-token", fetch: async () => { throw new Error("private-token in exception"); },
  }), (error: unknown) => errorCode("network", 502)(error) && !String(error).includes("private-token"));
  await assert.rejects(readExternalDocument({ source: "notion", url: NOTION_URL }, { token: "" }), errorCode("needs_auth", 401));
});

test("document reads reject oversized declared and streamed responses", async () => {
  for (const declared of [true, false]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); },
      cancel() { cancelled = true; },
    });
    await assert.rejects(readExternalDocument({ source: "notion", url: NOTION_URL }, {
      token: "private-token", fetch: async () => new Response(stream, {
        headers: declared ? { "content-length": String(2 * 1024 * 1024 + 1) } : {},
      }),
    }), errorCode("too_large", 413));
    assert.equal(cancelled, true);
  }
});

test("Lark has a separate catalog credential and identity API", async () => {
  const spec = CATALOG_CONNECTORS.find((entry) => entry.id === "lark");
  assert.equal(spec?.permission_host, "open.larksuite.com");
  assert.equal(spec?.setup_links[0]?.url, "https://open.larksuite.com/app");
  const result = await catalogWhoami({ connectorId: "lark", token: "cli_lark:secret_lark", fetchImpl: async (input) => {
    assert.equal(new URL(String(input)).origin, "https://open.larksuite.com");
    return json({ code: 0, tenant_access_token: "lark-access" });
  } });
  assert.equal(result.ok, true);
});
