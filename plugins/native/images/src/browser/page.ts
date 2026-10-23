import { required, remembered } from "./dom.js";
import { imagesRequest } from "./request.js";
import type { Draft, Elements, ImagesHost, ImagesPage, ImagesState, Scope } from "./types.js";

const elementsOf = (root: HTMLElement): Elements => {
  const field = <T extends HTMLElement>(name: string) => required<T>(root, `[data-images-${name}]`);
  return {
    compose: field("compose"), prompt: field("prompt"), size: field("size"), ratio: field("ratio"), generate: field("generate"),
    result: field("result"), dialog: field("dialog"), connectionForm: field("connection-form"), connectionName: field("connection-name"),
    connectionUrl: field("connection-url"), connectionModel: field("connection-model"), connectionAuth: field("connection-auth"),
    serviceMenu: field("service-menu"),
  };
};

const freshState = (context: string): ImagesState => ({
  context, conns: [], authConnections: [], jobs: [], cid: "", jobId: "", editingId: "", editingFormat: "openai-images", editingAuth: "",
  pending: null, resumeConnection: null, submitting: false, saving: false, cancelling: false, listSeq: 0, loadSeq: 0, timer: 0,
  listSignature: "", resultSignature: "", viewSignal: undefined,
});

/** The browser owns drafts only; jobs and credentials belong to the local host. */
export function createPage(host: ImagesHost, life: Scope, root: HTMLElement): ImagesPage {
  const { translate: L } = host;
  const el = elementsOf(root);
  const field = <T extends HTMLElement = HTMLElement>(name: string): T => required<T>(root, `[data-images-${name}]`);
  const projectId = () => String(host.projectId() || "");
  const s = freshState(projectId());
  const statuses = {
    running: L("images.status.running"), succeeded: L("images.status.succeeded"), failed: L("images.status.failed"),
    cancelled: L("images.status.cancelled"), interrupted: L("images.status.interrupted"),
  };
  const page: ImagesPage = {
    host, L, life, root, el, s, statuses, field, projectId,
    request: imagesRequest(host, life, L),
    say(message, isError = false, selector = "[data-images-note]") {
      if (!life.alive) return;
      const node = required<HTMLElement>(root, selector);
      node.textContent = message || "";
      node.hidden = !message;
      node.classList.toggle("is-error", Boolean(message && isError));
    },
    pickedConn: () => s.conns.find((item) => item.id === s.cid),
    saveDraft() {
      remembered(() => sessionStorage.setItem(`molis-work-images-draft:${s.context}`, JSON.stringify({
        prompt: el.prompt.value, size: el.size.value, aspect_ratio: el.ratio.value, connection_id: s.cid, selected_id: s.jobId, pending: s.pending,
      })));
    },
    restoreDraft() {
      let draft: Draft = {};
      try { draft = (JSON.parse(sessionStorage.getItem(`molis-work-images-draft:${s.context}`) || "{}") as Draft | null) || {}; } catch { draft = {}; }
      const word = (value: unknown) => (typeof value === "string" ? value : "");
      el.prompt.value = word(draft.prompt);
      el.size.value = word(draft.size);
      el.ratio.value = word(draft.aspect_ratio);
      s.cid = word(draft.connection_id);
      s.jobId = word(draft.selected_id);
      const pending = draft.pending;
      s.pending = pending && typeof pending.request_id === "string" && typeof pending.fingerprint === "string"
        ? { request_id: pending.request_id, fingerprint: pending.fingerprint } : null;
    },
    expand() {
      root.dataset.expanded = "true";
      field("workspace").hidden = false;
    },
    /** The generation record on screen, for the placement bar and the Assistant. */
    publishContext(job) {
      const value: Record<string, unknown> = { plugin_id: host.pluginId, surface_title: L("images.page.title") };
      if (job) value.object = { kind: "image_job", id: job.id, version: `${job.status}:${(job.images || []).length}`, title: job.prompt.slice(0, 80) };
      root.setAttribute("data-assistant-context", JSON.stringify(value));
    },
    syncGenerate() {
      if (!life.alive) return;
      const connection = page.pickedConn();
      el.generate.disabled = s.submitting || !s.context || !connection || connection.available === false || !el.prompt.value.trim();
      el.generate.textContent = s.submitting ? L("images.compose.submitting") : L("images.compose.generate");
      field("project-note").hidden = Boolean(s.context);
    },
  };
  return page;
}
