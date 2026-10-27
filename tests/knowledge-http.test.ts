import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, resolveWebControlToken } from "@molis-ai/molis-work-app-local-host";
import type { KnowledgeBindPreviewResponse, KnowledgeCardRecord, KnowledgeCardsResponse, KnowledgeOrganizeResponse, KnowledgeReceiptsResponse, KnowledgeSearchResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import { openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

interface States { states: Array<{ kind: string; id: string; state: string; excluded: boolean; changed: boolean }>; model_ready: boolean; listing: boolean }

// specs/project-knowledge K2 (PMAT-15, PMAT-16): the workbench's door to project knowledge, used by 项目设置 → 项目资料 and the
// side panel's 资料 tab. Every route goes through the knowledge actions as the person, in this project only.

/** A one-page PDF with a text layer, the same shape as the import test's. */
function pdfWith(lines: string[]): Buffer {
  const stream = `BT /F1 14 Tf 72 720 Td 18 TL ${lines.map(line => `(${line}) '`).join(" ")} ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => { offsets.push(body.length); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`
    + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

test("PMAT-15 PMAT-16 the knowledge routes list, find, edit and keep pieces from agents; the side panel previews an imported PDF", { timeout: 90_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "knowledge-http-"));
  const project = await withCatalog({ homeDirectory: home }, async catalog => {
    const created = await catalog.createProject({ display_name: "资料", actor_id: "owner" });
    catalog.addProjectPlugin({ project_id: created.project_id, plugin_id: "artifacts", actor_id: "owner" });
    catalog.addProjectPlugin({ project_id: created.project_id, plugin_id: "coding", actor_id: "owner" });
    return created;
  });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const token = resolveWebControlToken({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`, origin = `${base}/projects/${project.project_id}`;
    const send = (path: string, body: unknown, headers: Record<string, string> = { "x-molis-work-control-token": token }) => fetch(origin + path,
      { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: base, "x-molis-work-idempotency-key": randomUUID(), ...headers } });
    const post = async <T = unknown>(path: string, body: unknown) => {
      const response = await send(path, body);
      assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
      return await response.json() as T;
    };
    const get = async <T>(path: string) => {
      const response = await fetch(origin + path);
      assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
      return await response.json() as T;
    };
    const states = () => get<States>("/api/knowledge/states");
    const search = (query: string) => get<KnowledgeSearchResponse>(`/api/knowledge/search?q=${encodeURIComponent(query)}`);

    await post("/api/artifacts/import", { source: "file", filename: "试用说明.md", content: "# 试用说明\n\n试用期两周，到期前一周提醒客户。" });
    const pdf = pdfWith(["Quarterly review notes", "The beta pass code is MW-0042."]);
    await post("/api/artifacts/import", { source: "file", filename: "review.pdf", original_file: { filename: "review.pdf", mime: "application/pdf", data_base64: pdf.toString("base64") } });

    // A source listed for the first time may take longer than a read waits; the answer says so, and the next read has more.
    let listed = await states();
    for (const until = Date.now() + 30_000; listed.listing && Date.now() < until;) {
      await new Promise(resolve => setTimeout(resolve, 200));
      listed = await states();
    }
    assert.equal(listed.listing, false, "the project's sources are listed");
    // Without a text model every piece waits, and the page says so instead of showing it as being organized.
    assert.equal(listed.model_ready, false);
    assert.equal(listed.states.length, 2, JSON.stringify(listed));
    assert.ok(listed.states.every(row => row.state === "pending" && !row.excluded));
    const overview = await get<KnowledgeCardsResponse & { recent: KnowledgeReceiptsResponse }>("/api/knowledge/overview?state=pending");
    assert.deepEqual([overview.total, overview.model_ready, overview.listing, overview.recent.total], [2, false, false, 0]);
    assert.deepEqual((await get<KnowledgeCardsResponse>("/api/knowledge/overview?state=ready")).cards, [], "a state filter is applied by the service");

    // The PDF's text is found by content, before any card is organized.
    const found = await search("beta pass code");
    const review = found.cards.find(card => card.title === "review");
    assert.ok(review, JSON.stringify(found));
    const one = await get<{ card: KnowledgeCardRecord | null }>(`/api/knowledge/card?kind=${review.subject.kind}&id=${encodeURIComponent(review.subject.id)}`);
    assert.equal(one.card?.title, "review");
    assert.equal((await get<{ card: KnowledgeCardRecord | null }>("/api/knowledge/card?kind=artifact&id=missing")).card, null);

    // The person's edit is kept and marked; keeping the piece from agents takes it out of what search finds.
    const edited = await post<KnowledgeCardRecord>("/api/knowledge/edit", { subject: review.subject, brief: "季度复盘与内测口令" });
    assert.deepEqual([edited.brief, edited.edited], ["季度复盘与内测口令", ["brief"]]);
    assert.equal((await post<KnowledgeCardRecord>("/api/knowledge/exclude", { subject: review.subject, excluded: true })).excluded, true);
    const after = await search("beta pass code");
    assert.equal(after.cards.some(card => card.title === "review"), false, JSON.stringify(after));
    const excluded = async () => (await states()).states.find(row => row.id === review.subject.id)?.excluded;
    assert.equal(await excluded(), true);
    assert.equal(typeof (await post<KnowledgeOrganizeResponse>("/api/knowledge/organize", { subjects: [review.subject] })).queued, "number");

    // A change without the control token is refused and changes nothing.
    const refused = await send("/api/knowledge/exclude", { subject: review.subject, excluded: false }, {});
    assert.equal(refused.status, 403, await refused.text());
    assert.equal(await excluded(), true);

    // The side panel's preview of an imported PDF is its owner's: the original bytes as a PDF.
    const { sources } = await get<{ sources: Array<{ id: string; kinds: Array<{ kind: string }> }> }>("/api/side/files/sources");
    const library = sources.find(source => source.kinds.some(kind => kind.kind === "artifact"));
    assert.ok(library, JSON.stringify(sources));
    const raw = await fetch(`${origin}/api/side/files/raw?source=${encodeURIComponent(library.id)}&kind=artifact&id=${encodeURIComponent(review.subject.id)}`);
    assert.equal(raw.status, 200, await raw.clone().text());
    assert.equal(raw.headers.get("content-type"), "application/pdf");
    assert.equal(raw.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await raw.arrayBuffer()), pdf);
    const cards = openKnowledgeCards({ homeDirectory: home });
    try {
      const existing = cards.get(project.project_id, review.subject)!;
      const unboundPdf = { ...existing, revision: "historical-pdf-revision", organized_revision: "historical-pdf-revision",
        retention: { source_identity: null, restoration_operation_id: null } }; cards.put(unboundPdf);
      const pdfPreview = await post<KnowledgeBindPreviewResponse>("/api/knowledge/bind-preview", { subject: review.subject });
      assert.equal(pdfPreview.candidates.length, 1);
      const pdfCandidate = pdfPreview.candidates[0]!;
      assert.equal(pdfCandidate.source_identity.kind, "project-data");
      assert.deepEqual(cards.get(project.project_id, review.subject), unboundPdf);
      const pdfDecision = { subject: review.subject, operation_id: randomUUID(), provider_id: pdfCandidate.provider_id, source_key: pdfCandidate.source_key,
        source_identity: pdfCandidate.source_identity, source_revision: pdfCandidate.source_revision };
      const pdfBound = await post<KnowledgeCardRecord>("/api/knowledge/bind", pdfDecision);
      assert.deepEqual(pdfBound.adoption?.source_identity, pdfCandidate.source_identity);
      assert.equal(pdfBound.brief, unboundPdf.brief); assert.equal(pdfBound.excluded, unboundPdf.excluded);
      assert.equal(pdfBound.revision, pdfCandidate.source_revision, "MEM-SOURCE-04 the bind response itself adopts R2 without waiting for reconcile");
      assert.equal(pdfBound.organized_revision, "historical-pdf-revision"); assert.equal(pdfBound.state, "listed");
      assert.deepEqual(await post<KnowledgeCardRecord>("/api/knowledge/bind", pdfDecision), pdfBound);
      // These routes never call catch-up/reconcile before selecting the card. R1 must not make the new association disappear.
      const pdfEdited = await post<KnowledgeCardRecord>("/api/knowledge/edit", { subject: review.subject, title: "本人立即可编辑" });
      assert.equal(pdfEdited.title, "本人立即可编辑");
      await post<KnowledgeCardRecord>("/api/knowledge/exclude", { subject: review.subject, excluded: false });
      assert.equal((await post<KnowledgeOrganizeResponse>("/api/knowledge/organize", { subjects: [review.subject] })).queued, 1,
        "the person's explicit organize is immediately reachable after R1 to R2 binding");
      const created = await post<{ session: { session_id: string } }>("/api/plugins/io.molis.work.coding/sessions", { title: "Choose this installed source" });
      const subject = { kind: "coding_session", id: created.session.session_id };
      for (const until = Date.now() + 10_000;;) {
        await states();
        if (cards.get(project.project_id, subject)) break;
        assert.ok(Date.now() < until, "the installed Coding source is listed"); await new Promise(resolve => setTimeout(resolve, 20));
      }
      const original = { ...cards.get(project.project_id, subject)!, retention: { source_identity: null, restoration_operation_id: null } }; cards.put(original);
      const preview = await post<KnowledgeBindPreviewResponse>("/api/knowledge/bind-preview", { subject });
      assert.equal(preview.candidates.length, 1); assert.deepEqual(cards.get(project.project_id, subject), original);
      const candidate = preview.candidates[0]!;
      const input = { subject, operation_id: randomUUID(), provider_id: candidate.provider_id, source_key: candidate.source_key,
        source_identity: candidate.source_identity, source_revision: candidate.source_revision };
      const forged = await send("/api/knowledge/bind", { ...input, actor_id: "another-person" }); assert.equal(forged.status, 400);
      assert.deepEqual(cards.get(project.project_id, subject), original);
      const bound = await post<KnowledgeCardRecord>("/api/knowledge/bind", input);
      assert.deepEqual(bound.adoption?.source_identity, candidate.source_identity); assert.equal(bound.brief, original.brief); assert.equal(bound.excluded, original.excluded);
      assert.deepEqual(await post<KnowledgeCardRecord>("/api/knowledge/bind", input), bound);
    } finally { cards.close(); }
  } finally {
    await new Promise<void>(resolve => server.listening ? server.close(() => resolve()) : resolve());
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
