import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import { purgeImagesProject } from "./store.js";

/**
 * What this package keeps in the Home for a project and how the project's deletion clears it; the Host reads it from the
 * catalog. The Runtime callback cancels pending and active jobs before this owner purges persisted project facts.
 */
export const imagesProjectData: ProjectDataDeclaration = { label: "图片生成记录和已生成的图片", order: 90, purge: purgeImagesProject };
