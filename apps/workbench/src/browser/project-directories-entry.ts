import { bindProjectDirectories } from "./project-directories.js";

/**
 * The bundle's entry (dist/project-directories-client.js, the package's build): the page global the project settings program calls
 * for every part of the page it binds (`molisWorkBindProjectIdentity`), on the settings page and in the workbench's settings alike.
 */
(globalThis as { molisWorkBindProjectDirectories?: (scope?: ParentNode | null) => void }).molisWorkBindProjectDirectories = scope => {
  const within = scope ?? document;
  const roots = within instanceof HTMLElement && within.matches("[data-project-directories]") ? [within] : [...within.querySelectorAll<HTMLElement>("[data-project-directories]")];
  roots.forEach(bindProjectDirectories);
};
