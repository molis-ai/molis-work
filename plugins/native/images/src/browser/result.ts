import { button, dateLabel, messageOf, text } from "./dom.js";
import { imageUrl, stateOf } from "./list.js";
import type { GeneratedImage, ImageJob, ImagesPage } from "./types.js";

// Files are named after what was asked for, not the stored image id; several images from one prompt are numbered.
const fileNameOf = (page: ImagesPage, job: ImageJob, item: GeneratedImage): string => {
  const ext = (/\.[a-z0-9]{2,5}$/i.exec(item.filename || "") || [".png"])[0];
  const base = String(job.prompt || "").replace(/[\\/:*?"<>|\s]+/g, " ").trim().slice(0, 40) || page.L("images.page.title");
  const index = (job.images || []).findIndex((entry) => entry.id === item.id);
  return base + ((job.images || []).length > 1 && index >= 0 ? ` ${index + 1}` : "") + ext;
};

const heading = (page: ImagesPage, job: ImageJob): HTMLElement => {
  const { L, statuses } = page;
  const row = text("div", "", "images-result-heading");
  const status = text("h2", statuses[job.status] || job.status);
  status.dataset.mwState = stateOf(job.status);
  row.append(status, button(L("images.result.reuse"), "data-images-reuse", job.id, "secondary"));
  if (job.status !== "running") row.append(button(L("images.result.delete"), "data-images-delete-job", job.id));
  return row;
};

const statusPanel = (page: ImagesPage, job: ImageJob): HTMLElement => {
  const { L, s } = page;
  const panel = text("div", "", "images-status-panel");
  panel.dataset.status = job.status;
  const message = job.status === "running" ? L("images.status.waiting")
    : job.status === "cancelled" ? L("images.status.cancelled-help")
    : job.status === "interrupted" ? L("images.status.interrupted-help")
    : job.error || L("images.error.no-image");
  panel.append(text("p", message));
  if (job.status === "running") {
    panel.append(text("small", L("images.status.cancel-warning")));
    const cancel = button(s.cancelling ? L("images.status.cancelling") : L("images.status.cancel"), "data-images-cancel", job.id, "secondary");
    cancel.disabled = s.cancelling;
    panel.append(cancel);
  } else panel.append(text("small", L("images.status.retry-help")));
  return panel;
};

// Keep a generated image as a personal material: from Shelf it can be used in a project or handed to other work.
const shelfButton = (page: ImagesPage, job: ImageJob, item: GeneratedImage): HTMLButtonElement => {
  const { L } = page;
  const keep = text("button", L("images.result.shelf"), "mw-btn mw-btn--ghost");
  keep.type = "button";
  keep.title = L("images.result.shelf-help");
  keep.addEventListener("click", async () => {
    keep.disabled = true;
    try {
      const { item: kept } = await page.request<{ item: { item_id: string; name: string } }>("POST",
        `/jobs/${encodeURIComponent(job.id)}/images/${encodeURIComponent(item.id)}/shelf`, { filename: fileNameOf(page, job, item) });
      // The card says where the copy went; its 打开 opens it where Shelf opens (the side panel, by declaration).
      const shelved = { kind: "shelf_item", id: kept.item_id, project_id: null };
      window.dispatchEvent(new CustomEvent("molis:placement-result", { detail: { verb: "received", title: kept.name, object: shelved,
        open: { surface: "shelf", id: kept.item_id, project_id: null },
        note: `${L("来自 {source}", { source: `${L("images.page.title")} · ${job.prompt.slice(0, 40)}` })} · ${L("可以在 Shelf 里用于项目")}` } }));
    } catch (error) { page.say(messageOf(error) || L("images.error.shelf"), true); }
    finally { page.life.timeout(() => { keep.disabled = false; }, 1200); }
  });
  return keep;
};

const figureFor = (page: ImagesPage, job: ImageJob, item: GeneratedImage, signature: string): HTMLElement => {
  const { L, s } = page;
  const figure = document.createElement("figure");
  const img = document.createElement("img");
  img.className = "images-result-image";
  page.host.loadMedia(img, imageUrl(page, job, item.id));
  img.alt = job.prompt;
  img.addEventListener("error", () => {
    if (s.resultSignature === signature) s.resultSignature = "";
    img.replaceWith(text("p", L("images.error.image-read"), "images-note is-error"));
  }, { once: true });
  const caption = document.createElement("figcaption");
  const name = fileNameOf(page, job, item);
  const download = text("a", L("images.result.download"), "mw-btn mw-btn--secondary");
  download.href = `${imageUrl(page, job, item.id, true)}&name=${encodeURIComponent(name)}`;
  download.download = name;
  caption.append(text("span", `${Math.max(1, Math.round(item.byte_length / 1024))} KB`), download, shelfButton(page, job, item));
  figure.append(img, caption);
  return figure;
};

export function paintResult(page: ImagesPage, job: ImageJob | undefined): void {
  const { s, el, L } = page;
  if (!job || s.jobId !== job.id) return;
  el.compose.hidden = true;
  el.result.hidden = false;
  page.field("title").textContent = L("images.result.title");
  page.publishContext(job);
  const signature = JSON.stringify([job, s.cancelling]);
  if (s.resultSignature === signature) return;
  s.resultSignature = signature;
  el.result.replaceChildren();
  el.result.append(heading(page, job), text("p", `${job.connection_name} · ${job.model} · ${dateLabel(job.created_at)}`, "images-result-meta"));
  if (job.status !== "succeeded") el.result.append(statusPanel(page, job));
  for (const item of job.images || []) el.result.append(figureFor(page, job, item, signature));
  el.result.append(text("p", job.prompt, "images-result-prompt"));
  if (job.size || job.aspect_ratio) {
    el.result.append(text("p", `${job.api_format === "gemini" ? L("images.result.ratio") : L("images.result.size")} · ${job.aspect_ratio || job.size}`, "images-result-meta"));
  }
}
