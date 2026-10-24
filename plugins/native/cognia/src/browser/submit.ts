import { esc, messageOf } from "./dom.js";
import { entryTable, setBusy, setStep, showDraft } from "./dialog.js";
import { STATUS_KEY } from "./labels.js";
import { load, reload } from "./list.js";
import { fail, filterValue, tx, type CogniaPage } from "./page.js";
import { openMaterial } from "./reading.js";
import { grantDirectory } from "./request.js";
import { uploadFiles } from "./upload.js";
import type { Draft, Material, Preview, Receipt } from "./types.js";

const text = (data: FormData, name: string): string => String(data.get(name) ?? "");

/** First step: the folder (chosen here, or picked in the system chooser after the Host's grant) becomes a fixed preview. */
async function previewImport(page: CogniaPage, data: FormData): Promise<boolean> {
  const { L } = page;
  const chosen = Array.from(page.form.querySelector<HTMLInputElement>("[name=files]")?.files ?? []);
  const common = { kind: text(data, "kind"), domain_id: text(data, "domain_id") || null, source_id: text(data, "source_id") || undefined };
  let result: { preview: Preview };
  if (!chosen.length) {
    const grant = await grantDirectory(page.host, L("cognia.import.grant-failed"));
    if (grant.status === "cancelled") return false;
    result = await page.api<{ preview: Preview }>("/import/preview", { grant_id: grant.grant_id, path: ".", locator: "local:" + grant.root, ...common });
  } else {
    result = await page.api<{ preview: Preview }>("/import/preview", { ...common, files: await uploadFiles(chosen, L("cognia.import.too-many")), name: chosen[0].webkitRelativePath.split("/")[0] });
  }
  const preview = result.preview;
  page.preview = preview;
  page.flow = "preview";
  const domain = page.state.domains.find((d) => d.id === preview.source.domain_id)?.name || L("cognia.domain.unfiled");
  page.content.innerHTML = `<p>${esc(preview.source.name)} · ${esc(preview.source.locator)}</p><p>${esc(L("cognia.import.domain-line", { name: domain }))}</p>`
    + `<p class="cognia-hint">${tx(page, "cognia.import.confirm-hint")}</p>${entryTable(page, preview.entries)}`;
  page.submit.textContent = L("cognia.import.confirm");
  page.content.dataset.importable = String(preview.entries.some((entry) => entry.status !== "skipped"));
  if (page.content.dataset.importable === "false") fail(page, L("cognia.import.nothing"));
  setStep(page, "cognia.import.step-preview");
  return true;
}

/** Second step: the preview is imported as it was shown. */
async function commitImport(page: CogniaPage): Promise<void> {
  const { L, preview } = page;
  if (!preview) return;
  if (page.content.dataset.importable === "false") throw new Error(L("cognia.import.nothing"));
  const result = await page.api<{ receipt: Receipt }>("/import/commit", { preview_id: preview.id });
  const receipt = result.receipt;
  page.receipt = receipt;
  page.flow = "receipt";
  const counts = [[STATUS_KEY.new, receipt.added], [STATUS_KEY.update, receipt.updated], [STATUS_KEY.unchanged, receipt.unchanged], [STATUS_KEY.skipped, receipt.skipped]] as const;
  page.content.innerHTML = `<p class="cognia-receipt">${tx(page, "cognia.import.done")}<br>${counts.map(([key, count]) => `${tx(page, key)} ${count}`).join(" · ")}</p>${entryTable(page, receipt.entries)}`;
  page.submit.textContent = L("cognia.import.open");
  setStep(page, "cognia.import.step-result");
  await load(page).catch((error: unknown) => fail(page, L("cognia.import.refresh-failed") + " " + messageOf(error)));
}

/** Writes a material (new, or a new version of the open one), then shows it. */
async function saveMaterial(page: CogniaPage, data: FormData, path: string): Promise<void> {
  const result = await page.api<{ material: Material }>(path, { title: text(data, "title"), body: text(data, "body"), domain_id: text(data, "domain_id") || null });
  page.dialog.close();
  await reload(page);
  await openMaterial(page, result.material.id);
}

async function generate(page: CogniaPage, data: FormData): Promise<void> {
  const result = await page.api<{ draft: Draft }>("/ai", {
    mode: page.content.dataset.mode, question: text(data, "question"), domain_id: filterValue(page, "domain"), material_refs: JSON.parse(page.content.dataset.refs || "[]"),
  });
  showDraft(page, result.draft);
  await reload(page);
}

async function saveDraft(page: CogniaPage): Promise<void> {
  const draft = page.draft;
  if (!draft) return;
  const saved = draft.saved_id ? { material: { id: draft.saved_id } } : await page.api<{ material: { id: string } }>(`/drafts/${draft.id}/save`, {});
  draft.saved_id = saved.material.id;
  page.dialog.close();
  await reload(page);
  await openMaterial(page, saved.material.id);
}

async function runStep(page: CogniaPage, data: FormData): Promise<void> {
  switch (page.flow) {
    case "import": await previewImport(page, data); break;
    case "preview": await commitImport(page); break;
    case "receipt": {
      page.dialog.close();
      const first = page.receipt?.material_ids[0];
      if (first) await openMaterial(page, first); else await load(page);
      break;
    }
    case "add": await saveMaterial(page, data, "/materials"); break;
    case "edit": if (page.cur) await saveMaterial(page, data, `/materials/${encodeURIComponent(page.cur.id)}/update`); break;
    case "domain": await page.api("/domains", { name: text(data, "name") }); page.dialog.close(); await load(page); break;
    case "ai": await generate(page, data); break;
    case "review": await saveDraft(page); break;
    default: break;
  }
}

/** The dialog's submit: one step at a time, the form held (busy) while it runs, the button's words restored when it ends. */
export function installSubmit(page: CogniaPage): void {
  page.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (page.busy) return;
    const data = new FormData(page.form);
    setBusy(page, true);
    fail(page, "");
    const previousLabel = page.submit.textContent;
    const processing = page.L("cognia.dialog.processing");
    page.submit.textContent = processing;
    try {
      await runStep(page, data);
    } catch (error) {
      fail(page, messageOf(error));
      page.submit.textContent = previousLabel;
    } finally {
      setBusy(page, false);
      if (page.submit.textContent === processing) page.submit.textContent = previousLabel;
    }
  });
}
