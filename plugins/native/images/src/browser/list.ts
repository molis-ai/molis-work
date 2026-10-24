import { button, dateLabel, text } from "./dom.js";
import type { ImageJob, ImagesPage } from "./types.js";

/** The URL of one generated image, or its download form. */
export const imageUrl = (page: ImagesPage, job: ImageJob, imageId: string, download = false): string =>
  page.host.pluginRoute(`/jobs/${encodeURIComponent(job.id)}/images/${encodeURIComponent(imageId)}`) + (download ? "?download=1" : "");

export const stateOf = (status: string): string => (status === "succeeded" ? "done" : status === "running" ? "generating" : status);

const historyRow = (page: ImagesPage, job: ImageJob): HTMLButtonElement => {
  const { s, host, statuses } = page;
  const node = button("", "data-images-job", job.id);
  node.className = `feed-stage-entry directory-list-row images-history-row${s.jobId === job.id ? " is-selected" : ""}`;
  node.setAttribute("aria-pressed", String(s.jobId === job.id));
  const first = job.images?.[0];
  if (first) {
    const img = document.createElement("img");
    img.className = "images-history-thumb";
    host.loadMedia(img, imageUrl(page, job, first.id));
    img.alt = "";
    img.loading = "lazy";
    node.append(img);
  } else {
    const mark = document.createElement("span");
    mark.className = "images-history-thumb images-history-thumb-placeholder";
    mark.innerHTML = '<svg aria-hidden="true"><use href="#icon-image"></use></svg>';
    node.append(mark);
  }
  const copy = text("span", "", "images-history-copy");
  const title = text("strong", job.prompt);
  title.title = job.prompt;
  const status = text("small", `${statuses[job.status] || job.status} · ${dateLabel(job.created_at)}`);
  status.dataset.mwState = stateOf(job.status);
  copy.append(title, status);
  node.append(copy);
  return node;
};

export function paintList(page: ImagesPage): void {
  const { s } = page;
  const signature = JSON.stringify([s.jobs, s.jobId]);
  if (signature === s.listSignature) return;
  s.listSignature = signature;
  const list = page.field("rows").closest<HTMLElement>("[data-images=directory]");
  const top = list?.scrollTop ?? 0;
  page.field("history-empty").hidden = s.jobs.length > 0;
  page.field("rows").replaceChildren(...s.jobs.map((job) => historyRow(page, job)));
  if (list) list.scrollTop = top;
}

/** Back to the empty composer (focused when the person asked for a new one). */
export function showCompose(page: ImagesPage, focus = false): void {
  const { s, el } = page;
  s.jobId = "";
  s.resultSignature = "";
  el.result.hidden = true;
  el.compose.hidden = false;
  page.publishContext(null);
  page.field("title").textContent = page.L("images.compose.new");
  page.expand();
  paintList(page);
  page.saveDraft();
  page.syncGenerate();
  if (focus) el.prompt.focus();
}
