import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, resolveWebControlToken } from "@molis-ai/molis-work-app-local-host";
import { FILE_PREVIEW_CLIENT_SCRIPT, renderFilePreviewHtml } from "@molis-ai/molis-work-design-system";
import { artifactSubjectId } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// specs/artifact-positioning A4b: the side panel previews a 成果 version through its owner, the same as the 成果库.
test("the side panel previews a pinned document through its owner, as the 成果库 does", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "side-files-artifacts-"));
  const project = await withCatalog({ homeDirectory: home }, async catalog => {
    const created = await catalog.createProject({ display_name: "侧栏成果", actor_id: "owner" });
    for (const plugin_id of ["pages", "artifacts"]) catalog.addProjectPlugin({ project_id: created.project_id, plugin_id, actor_id: "owner" });
    return created;
  });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const token = resolveWebControlToken({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`, origin = `${base}/projects/${project.project_id}`;
    const post = async (path: string, body: unknown) => {
      const response = await fetch(origin + path, { method: "POST", body: JSON.stringify(body),
        headers: { "content-type": "application/json", origin: base, "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() } });
      assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
      return await response.json() as Record<string, any>;
    };
    const get = async (path: string) => await (await fetch(origin + path)).json() as Record<string, any>;
    const document = (await post("/api/pages", { title: "周报", markdown: "## 本周\n\n- 完成侧栏预览" })).document as { id: string; version: number };
    const pinned = (await post(`/api/pages/${document.id}/promote`, { expected_version: document.version })).artifact as { artifact_id: string; version: number };

    const sources = (await get("/api/side/files/sources")).sources as Array<{ id: string; kinds: Array<{ kind: string }> }>;
    const library = sources.find(source => source.kinds.some(kind => kind.kind === "artifact"));
    assert.ok(library, JSON.stringify(sources));
    const entries = (await get(`/api/side/files/entries?source=${encodeURIComponent(library.id)}`)).page.entries as Array<{ subject: { kind: string; id: string }; title: string }>;
    const entry = entries.find(item => item.title === "周报");
    assert.ok(entry, JSON.stringify(entries));
    const preview = await get(`/api/side/files/content?source=${encodeURIComponent(library.id)}&kind=artifact&id=${encodeURIComponent(entry.subject.id)}`);
    assert.equal(preview.via, "owner", "Pages previews its own version");
    assert.equal(preview.content.media_type, "text/markdown");
    assert.match(preview.content.data, /^# 周报\n[\s\S]*## 本周[\s\S]*- 完成侧栏预览/u);
    assert.equal(entry.subject.id, artifactSubjectId(pinned), "the side panel lists exactly the pinned version");
  } finally {
    await new Promise<void>(resolve => server.listening ? server.close(() => resolve()) : resolve());
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});

test("the page's preview renderer is the design system's own, producing the same markup", () => {
  const renderFilePreview = new Function(`${FILE_PREVIEW_CLIENT_SCRIPT}; return renderFilePreview;`)() as typeof renderFilePreviewHtml;
  const primitives = { escape: (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"), text: (value: string) => value };
  const files = [
    { title: "a.md", media_type: "text/markdown", encoding: "utf8" as const, data: "# 标题\n\n- 一\n- **二**\n\n> 引用\n\n```\ncode <b>\n```\n[链接](https://example.com)", truncated: false },
    { title: "b.csv", media_type: "text/csv", encoding: "utf8" as const, data: 'a,b\n"1,2",<x>\n', truncated: false },
    { title: "c.txt", media_type: "text/plain", encoding: "utf8" as const, data: "plain <script>", truncated: true },
  ];
  for (const file of files) assert.equal(renderFilePreview(file, primitives), renderFilePreviewHtml(file, primitives), file.title);
  assert.doesNotMatch(renderFilePreview(files[0]!, primitives), /<b>|<script>/);
});
