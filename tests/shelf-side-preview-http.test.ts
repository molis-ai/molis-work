import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, resolveWebControlToken } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// Shelf S3: the plugin's own route serves only PNG, JPEG and WebP in the page, so the panel shows a PDF through the side panel's
// inline file channel, with the bytes `shelf.files.content` hands back. This pins what the panel relies on: the channel lists the
// person's Shelf on a project page, serves a PDF of 8 MiB or less as a PDF, refuses a larger one (its content is the extracted
// text), and is not there outside a project, where the panel shows the text with download and open buttons instead.
test("a Shelf PDF previews through the side panel's file channel on a project page, up to 8 MiB", { timeout: 90_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "shelf-side-preview-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "预览", actor_id: "owner" }));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const token = resolveWebControlToken({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`, page = `${base}/projects/${encodeURIComponent(project.project_id)}`;
    const admit = async (filename: string, bytes: Buffer) => {
      const response = await fetch(`${base}/api/plugins/io.molis.work.shelf/items`, { method: "POST",
        headers: { origin: base, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() },
        body: JSON.stringify({ filename, bytes_base64: bytes.toString("base64") }) });
      assert.equal(response.status, 200, await response.clone().text());
      return (await response.json() as { item: { item_id: string; mime: string } }).item;
    };
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1");
    const small = await admit("review.pdf", pdf);
    assert.equal(small.mime, "application/pdf");
    const large = await admit("large.pdf", Buffer.concat([pdf, Buffer.alloc(8 * 1024 * 1024)]));

    const listed = await fetch(`${page}/api/side/files/sources`);
    assert.equal(listed.status, 200, await listed.clone().text());
    const { sources } = await listed.json() as { sources: Array<{ id: string; plugin_id: string; kinds: Array<{ kind: string }> }> };
    const shelf = sources.find(source => source.plugin_id === "io.molis.work.shelf" && source.kinds.some(kind => kind.kind === "shelf_item"));
    assert.ok(shelf, JSON.stringify(sources));
    const raw = (id: string, prefix = page) => fetch(`${prefix}/api/side/files/raw?source=${encodeURIComponent(shelf.id)}&kind=shelf_item&id=${encodeURIComponent(id)}`);

    const shown = await raw(small.item_id);
    assert.equal(shown.status, 200, await shown.clone().text());
    assert.deepEqual([shown.headers.get("content-type"), shown.headers.get("content-disposition"), shown.headers.get("x-content-type-options")],
      ["application/pdf", "inline", "nosniff"]);
    assert.deepEqual(Buffer.from(await shown.arrayBuffer()), pdf);
    // Over 8 MiB the content is the extracted text, which the channel does not show in a frame; the panel falls back.
    assert.equal((await raw(large.item_id)).status, 415);
    // Outside a project the channel has nothing to show; the panel never asks for it there.
    assert.equal((await raw(small.item_id, base)).status, 400);
  } finally {
    await new Promise<void>(resolve => server.listening ? server.close(() => resolve()) : resolve());
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
