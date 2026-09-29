import { ActionError, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, searchText, subjectContext, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { IMAGES_PROJECT_PLUGIN_ID, type ImageJob } from "@molis-ai/molis-work-contracts/modules/images";
import type { ImagesService } from "./service.js";

/** Images' part in the system search: this project's generation records by their description and model. Image bytes are not text. */
export const imagesSearchActions = {
  entries: defineSearchEntriesAction("images.search.entries", [{ kind: "image_job", title: "生成记录", surface: IMAGES_PROJECT_PLUGIN_ID }], "生图记录", ["images:read"]),
  subject: defineSubjectContextAction("images.subject.read", "image_job", "生图记录", ["images:read"]),
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
