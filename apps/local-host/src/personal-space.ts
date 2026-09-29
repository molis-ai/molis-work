import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * The personal space (specs/work-placement §3.1): where things go when they belong to no project. It is an ordinary
 * project partition with a reserved identity, so every plugin works in it unchanged; it is never listed, renamed or
 * deleted as a project, and it is kept like user data.
 */
export const PERSONAL_SPACE_TITLE = "个人空间";

export function isPersonalSpace(project: { project_id: string }): boolean {
  return project.project_id === PERSONAL_SPACE_PROJECT_ID;
}

/** Projects the person made, without the personal space. */
export function withoutPersonalSpace<T extends { project_id: string }>(projects: readonly T[]): T[] {
  return projects.filter(project => !isPersonalSpace(project));
}

export { PERSONAL_SPACE_PROJECT_ID };
