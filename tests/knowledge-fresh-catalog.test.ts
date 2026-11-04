import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, resolveWebControlToken } from "@molis-ai/molis-work-app-local-host";
import type { KnowledgeSearchResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import { openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// specs/project-knowledge PMAT-41, PMAT-44: what is imported reaches the project's catalog (the cards each round's directory and
// counts come from) without anyone searching, a ref a search hands back names a card, and an imported file's text is read when
// it is plain text, said when it is not.

test("PMAT-41 PMAT-44 an import reaches the catalog with nobody searching; a search's refs have cards; plain text files are read, others said so", { timeout: 90_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "knowledge-fresh-"));
  const project = await withCatalog({ homeDirectory: home }, async catalog => {
    const created = await catalog.createProject({ display_name: "资料", actor_id: "owner" });
    assert.throws(() => catalog.addProjectPlugin({ project_id: created.project_id, plugin_id: "artifacts", actor_id: "owner" }), (error: unknown) => error instanceof Error && "code" in error && error.code === "catalog.plugin_not_found");
    return created;
  });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const token = resolveWebControlToken({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  const cards = openKnowledgeCards({ homeDirectory: home });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`, origin = `${base}/projects/${project.project_id}`;
    const post = async <T>(path: string, body: unknown) => {
      const response = await fetch(origin + path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: base,
        "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() } });
      assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
      return await response.json() as T;
    };
    const titles = () => cards.list(project.project_id).map(card => card.title).sort();
    const until = async (done: () => boolean, what: string) => {
      for (const end = Date.now() + 20_000; !done() && Date.now() < end;) await new Promise(resolve => setTimeout(resolve, 200));
      assert.ok(done(), `${what}: ${JSON.stringify(cards.list(project.project_id).map(card => [card.title, card.state]))}`);
    };

    // PMAT-41: nobody searches or opens the knowledge page; the card is there shortly after the import, as each round's catalog reads it.
    await post("/api/artifacts/import", { source: "file", filename: "试用说明.md", content: "# 试用说明\n\n试用期两周，到期前一周提醒客户。" });
    await until(() => titles().includes("试用说明"), "the imported piece has a card without a search");

    // PMAT-44: a CSV's text is read; a binary file is kept with its name only, said so, and listed without going to a model.
    const csv = await post<{ warnings?: string[] }>("/api/artifacts/import", { source: "file", filename: "价目.csv",
      original_file: { filename: "价目.csv", mime: "text/csv", data_base64: Buffer.from("型号,价格\nTP-2,1299\n").toString("base64") } });
    assert.deepEqual(csv.warnings ?? [], []);
    const binary = await post<{ warnings?: string[] }>("/api/artifacts/import", { source: "file", filename: "图像.bin",
      original_file: { filename: "图像.bin", mime: "application/octet-stream", data_base64: Buffer.from([0, 1, 2, 255, 254]).toString("base64") } });
    assert.match(binary.warnings?.[0] ?? "", /读不出这个文件的正文.*Agent 只能看到它的名字/u);

    // PMAT-41: a search right after an import, before the background pass, hands back refs whose cards are there when it answers.
    await post("/api/artifacts/import", { source: "file", filename: "退货政策.md", content: "# 退货政策\n\n签收后 30 天内可无理由退货。" });
    const found = await (await fetch(`${origin}/api/knowledge/search?q=${encodeURIComponent("无理由退货")}`)).json() as KnowledgeSearchResponse;
    const hit = found.cards.find(card => card.title === "退货政策");
    assert.ok(hit, JSON.stringify(found));
    assert.ok(cards.get(project.project_id, hit.subject), "the hit's card exists, so its ref reads it");

    await until(() => ["价目", "图像"].every(title => titles().includes(title)), "the imported files have cards");
    const state = (title: string) => cards.list(project.project_id).find(card => card.title === title)?.state;
    assert.deepEqual([state("价目"), state("图像")], ["pending", "listed"], "the CSV waits for organizing; the binary file is listed by its name");
    const priced = await (await fetch(`${origin}/api/knowledge/search?q=${encodeURIComponent("TP-2")}`)).json() as KnowledgeSearchResponse;
    assert.ok(priced.cards.some(card => card.title === "价目"), "the CSV's text is found");
  } finally {
    cards.close();
    await new Promise<void>(resolve => server.listening ? server.close(() => resolve()) : resolve());
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
