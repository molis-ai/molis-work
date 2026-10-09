import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import { purgeImagesProject } from "./store.js";

/**
 * What this package keeps in the Home for a project and how the project's deletion clears it; the Host reads it from the
 * catalog. A Host that runs the Images service replaces the purge with the service's `deleteProject`, which first stops
 * the jobs still being made; the label is the same.
 */
export const imagesProjectData: ProjectDataDeclaration = { label: "图片生成记录和已生成的图片", order: 90, purge: purgeImagesProject };
