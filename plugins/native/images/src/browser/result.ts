import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
import { button, dateLabel, firstCharacters, text } from "./dom.js";
import { imageUrl, stateOf } from "./list.js";
import type { GeneratedImage, ImageJob, ImagesPage } from "./types.js";

const uiText = globalThis.t;

// Files are named after what was asked for, not the stored image id; several images from one prompt are numbered.
const fileNameOf = (_page: ImagesPage, job: ImageJob, item: GeneratedImage): string => {
  const ext = (/\.[a-z0-9]{2,5}$/i.exec(item.filename || "") || [".png"])[0];
  const base = firstCharacters(String(job.prompt || "").replace(/[\\/:*?"<>|\s]+/g, " ").trim(), 40) || uiText.text("images.page.title");
  const index = (job.images || []).findIndex((entry) => entry.id === item.id);
  return base + ((job.images || []).length > 1 && index >= 0 ? ` ${index + 1}` : "") + ext;
};

const heading = (page: ImagesPage, job: ImageJob): HTMLElement => {
  const { statuses } = page;
  const row = text("div", "", "images-result-heading");
  const status = text("h2", statuses[job.status] || job.status);
  status.dataset.mwState = stateOf(job.status);
  row.append(status, button(uiText.text("images.result.reuse"), "data-images-reuse", job.id, "secondary"));
  if (job.status !== "running") row.append(button(uiText.text("images.result.delete"), "data-images-delete-job", job.id));
  return row;
};

const statusPanel = (page: ImagesPage, job: ImageJob): HTMLElement => {
  const { s } = page;
  const panel = text("div", "", "images-status-panel");
  panel.dataset.status = job.status;
  const message = job.status === "running" ? uiText.text("images.status.waiting")
    : job.status === "cancelled" ? uiText.text("images.status.cancelled-help")
    : job.status === "interrupted" ? uiText.text("images.status.interrupted-help")
    : job.error || uiText.text("images.error.no-image");
  panel.append(text("p", message));
  if (job.status === "running") {
    panel.append(text("small", uiText.text("images.status.cancel-warning")));
    const cancel = button(s.cancelling ? uiText.text("images.status.cancelling") : uiText.text("images.status.cancel"), "data-images-cancel", job.id, "secondary");
    cancel.disabled = s.cancelling;
    panel.append(cancel);
  } else panel.append(text("small", uiText.text("images.status.retry-help")));
  return panel;
};

// Keep a generated image as a personal material: from Shelf it can be used in a project or handed to other work.
const shelfButton = (page: ImagesPage, job: ImageJob, item: GeneratedImage): HTMLButtonElement => {
  const keep = text("button", uiText.text("images.result.shelf"), "mw-btn mw-btn--ghost");
  keep.type = "button";
  keep.title = uiText.text("images.result.shelf-help");
  keep.addEventListener("click", async () => {
    keep.disabled = true;
    try {
      const { item: kept } = await page.request<{ item: { item_id: string; name: string } }>("POST",
        `/jobs/${encodeURIComponent(job.id)}/images/${encodeURIComponent(item.id)}/shelf`, { filename: fileNameOf(page, job, item) });
      // The card says where the copy went; its 打开 opens it where Shelf opens (the side panel, by declaration).
      const shelved = { kind: "shelf_item", id: kept.item_id, project_id: null };
      window.dispatchEvent(new CustomEvent("molis:placement-result", { detail: { verb: "received", title: kept.name, object: shelved,
        open: { surface: "shelf", id: kept.item_id, project_id: null },
        note: `${uiText.text("images.result.from-source", { source: `${uiText.text("images.page.title")} · ${firstCharacters(job.prompt, 40)}` })} · ${uiText.text("images.result.you-can-use-it-in-a-project")}` } }));
    } catch (error) { page.say(messageOf(error) || uiText.text("images.error.shelf"), true); }
    finally { page.life.timeout(() => { keep.disabled = false; }, 1200); }
  });
  return keep;
};

const figureFor = (page: ImagesPage, job: ImageJob, item: GeneratedImage, signature: string): HTMLElement => {
  const { s } = page;
  const figure = document.createElement("figure");
  const img = document.createElement("img");
  img.className = "images-result-image";
  page.host.loadMedia(img, imageUrl(page, job, item.id));
  img.alt = job.prompt;
  img.addEventListener("error", () => {
    if (s.resultSignature === signature) s.resultSignature = "";
    img.replaceWith(text("p", uiText.text("images.error.image-read"), "images-note is-error"));
  }, { once: true });
  const caption = document.createElement("figcaption");
  const name = fileNameOf(page, job, item);
  const download = text("a", uiText.text("images.result.download"), "mw-btn mw-btn--secondary");
  download.href = `${imageUrl(page, job, item.id, true)}&name=${encodeURIComponent(name)}`;
  download.download = name;
  caption.append(text("span", `${Math.max(1, Math.round(item.byte_length / 1024))} KB`), download, shelfButton(page, job, item));
  figure.append(img, caption);
  return figure;
};

export function paintResult(page: ImagesPage, job: ImageJob | undefined): void {
  const { s, el } = page;
  if (!job || s.jobId !== job.id) return;
  el.compose.hidden = true;
  el.result.hidden = false;
  page.field("title").textContent = uiText.text("images.result.title");
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
    el.result.append(text("p", `${job.api_format === "gemini" ? uiText.text("images.result.ratio") : uiText.text("images.result.size")} · ${job.aspect_ratio || job.size}`, "images-result-meta"));
  }
}
