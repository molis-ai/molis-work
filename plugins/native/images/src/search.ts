import { ActionError, bindFileEntriesHandler, bindSearchEntriesHandler, defineFileContentAction, defineFileEntriesAction, defineSearchEntriesAction, defineSubjectContextAction, fileContentOf, searchText, subjectContext, type ActionCallContext, type ActionHandlerBinding, type FileContentInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { IMAGES_PROJECT_PLUGIN_ID, type ImageJob } from "@molis-ai/molis-work-contracts/modules/images";
import type { ImagesService } from "./service.js";

/** Images' part in the system search: this project's generation records by their description and model. Image bytes are not text. */
export const imagesSearchActions = {
  entries: defineSearchEntriesAction("images.search.entries", [{ kind: "image_job", title: "生成记录", surface: IMAGES_PROJECT_PLUGIN_ID }], "生图记录", ["images:read"]),
  subject: defineSubjectContextAction("images.subject.read", "image_job", "生图记录", ["images:read"]),
  /** The side panel's file tab (specs/archive/side-panel): each generated picture, previewed as itself. */
  files: defineFileEntriesAction("images.files.entries", [{ kind: "generated_image", title: "生成的图片", surface: IMAGES_PROJECT_PLUGIN_ID }], "生成的图片", ["images:read"]),
  fileContent: defineFileContentAction("images.files.content", [{ kind: "generated_image", title: "生成的图片", surface: IMAGES_PROJECT_PLUGIN_ID }], "生成的图片", ["images:read"]),
};
const revisionOf = (job: ImageJob) => `${job.status}:${job.finished_at ?? ""}:${job.images.length}`;
const titleOf = (job: ImageJob) => searchText(job.prompt, 80) || "生成记录";
const summaryOf = (job: ImageJob) => searchText([job.model, job.connection_name, job.size || job.aspect_ratio, job.error].filter(Boolean).join(" · "), 400);

export function createImagesSearchHandlers(service: () => ImagesService): ActionHandlerBinding[] {
  const project = (caller: ActionCallContext) => { if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目"); return caller.project_id; };
  return [
    bindSearchEntriesHandler(imagesSearchActions.entries, caller => service().listJobs(project(caller)).map(job => ({
      subject: { kind: "image_job", id: job.id }, revision: revisionOf(job), title: titleOf(job), summary: summaryOf(job), updated_at: job.finished_at ?? job.created_at,
      content: "context" as const, open: { surface: IMAGES_PROJECT_PLUGIN_ID, id: job.id } }))),
    bindFileEntriesHandler(imagesSearchActions.files, caller => service().listJobs(project(caller)).flatMap(job => job.images.map((image, index) => ({
      subject: { kind: "generated_image", id: `${job.id}/${image.id}` }, revision: `${image.id}:${image.byte_length}`,
      title: `${titleOf(job)}${job.images.length > 1 ? ` (${index + 1})` : ""}.${image.mime_type.split("/")[1] === "jpeg" ? "jpg" : image.mime_type.split("/")[1]}`,
      folder: [job.model || "生成的图片"], media_type: image.mime_type, size: image.byte_length, updated_at: job.finished_at ?? job.created_at,
      open: { surface: IMAGES_PROJECT_PLUGIN_ID, id: job.id } })))),
    { ...imagesSearchActions.fileContent, handle: (caller, input) => {
      const subject = (input as FileContentInput).subject;
      const [jobId, imageId] = String(subject.id).split("/");
      let image: ReturnType<ImagesService["readImage"]>;
      try { image = service().readImage(project(caller), jobId ?? "", imageId ?? ""); }
      catch { throw new ActionError("images.not_found", "这张图片已经不在了"); }
      return fileContentOf({ subject, revision: `${imageId}:${image.bytes.byteLength}`, title: image.filename, media_type: image.mime, bytes: new Uint8Array(image.bytes) });
    } },
    { ...imagesSearchActions.subject, handle: (caller, input) => {
      let job: ImageJob;
      try { job = service().getJob(project(caller), (input as { subject_id: string }).subject_id); }
      catch (error) {
        if (/not_found/u.test(String((error as { code?: string })?.code ?? ""))) throw new ActionError("images.not_found", "生成记录已删除");
        throw error;
      }
      return subjectContext({ subject: { kind: "image_job", id: job.id }, revision: revisionOf(job), title: titleOf(job), content: [job.prompt, summaryOf(job)].filter(Boolean).join("\n"),
        goal_ids: [], session_id: null, open: { surface: IMAGES_PROJECT_PLUGIN_ID, id: job.id } });
    } },
  ];
}
