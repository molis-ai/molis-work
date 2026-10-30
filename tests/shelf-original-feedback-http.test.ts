import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import test from "node:test";
import type { ShelfSnapshot } from "@molis-ai/molis-work-module-shelf/contract";
import { createExtractablePdf } from "@molis-ai/molis-work-module-shelf";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

const API = "/api/plugins/io.molis.work.shelf";
interface Receipt { item?: { item_id: string }; original_registered?: boolean; code?: string; snapshot?: ShelfSnapshot }

/** The native transport adds no Fetch Metadata: it offers the selected file only in the protected header. */
function admit(env: { origin: string; token: string }, bytes: Buffer, original?: string) {
  const body = JSON.stringify({ filename: "chosen.pdf", mime: "application/pdf", bytes_base64: bytes.toString("base64"), original: true });
  return new Promise<{ status: number; body: Receipt }>((resolve, reject) => {
    const url = new URL(API + "/items", env.origin);
    const request = httpRequest(url, { method: "POST", headers: {
      origin: env.origin, "content-type": "application/json", "content-length": Buffer.byteLength(body),
      "x-molis-work-control-token": env.token, "x-molis-work-idempotency-key": randomUUID(),
      ...(original ? { "sec-molis-work-original-path": encodeURIComponent(original) } : {}),
    } }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => {
        try { resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
        catch (error) { reject(error); }
      });
    });
    request.once("error", reject);
    request.end(body);
  });
}

test("PG-026-S1-S3-3 actual Shelf original registration refuses extraction after the original changes, without creating a job or result", async t => {
  const env = await serveHomeRuntime(t);
  const bytes = Buffer.from(createExtractablePdf("the admitted copy"));
  const original = join(realpathSync(env.home), "selected.pdf");
  writeFileSync(original, bytes);
  const response = await admit(env, bytes, original);
  assert.equal(response.status, 200);
  assert.equal(response.body.original_registered, true);
  assert.ok(response.body.item && response.body.snapshot);
  const id = response.body.item.item_id;
  const catalogPath = join(env.home, "shelf", "catalog.json");
  const before = readFileSync(catalogPath, "utf8");
  writeFileSync(original, createExtractablePdf("the changed original"));
  const run = await env.request(API + "/jobs", { method: "POST", body: { recipe: "extract_text", item_id: id } });
  assert.equal(run.status, 400);
  const refused: Receipt = await run.json();
  assert.equal(refused.code, "shelf.origin_changed");
  assert.deepEqual(refused.snapshot?.results, response.body.snapshot.results);
  assert.deepEqual(refused.snapshot?.running_jobs, []);
  assert.equal(readFileSync(catalogPath, "utf8"), before, "no job, failed row or result was persisted");
  const copy = await env.request(API + `/items/${encodeURIComponent(id)}/file`);
  assert.equal(copy.status, 200);
  assert.deepEqual(Buffer.from(await copy.arrayBuffer()), bytes, "the saved copy did not follow the changed original");
});

test("PG-026-S1-S3-4 missing original header keeps the copy and returns partial success with one actual failed original action", async t => {
  const env = await serveHomeRuntime(t);
  const bytes = Buffer.from(createExtractablePdf("copy survives failed registration"));
  const response = await admit(env, bytes);
  assert.equal(response.status, 200);
  assert.equal(response.body.original_registered, false);
  assert.ok(response.body.item);
  const id = response.body.item.item_id;
  const copy = await env.request(API + `/items/${encodeURIComponent(id)}/file`);
  assert.equal(copy.status, 200);
  assert.deepEqual(Buffer.from(await copy.arrayBuffer()), bytes);
  assert.ok(env.host.callLog);
  const failures = env.host.callLog.list(null).filter(row => row.capability_id === "shelf.items.original");
  assert.equal(failures.length, 1, "the original action records its own failure exactly once");
  assert.equal(failures[0]!.ok, false);
  assert.equal(failures[0]!.code, "plugin.materials_original_not_offered");
  assert.equal(failures[0]!.count ?? 1, 1, "no duplicate failure is folded into the row");
  const admissions = env.host.callLog.list(null).filter(row => row.capability_id === "shelf.items.admit");
  assert.equal(admissions.length, 1);
  assert.equal(admissions[0]!.ok, true, "saved bytes remain a successful action");
});
