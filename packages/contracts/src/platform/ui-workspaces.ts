/** Current-project directories only: a page may ask to add an input folder, make one of the project's folders its output, or turn on reading its
 * instruction files (`projects.directories.set_instructions@1`); the trusted Host confirms each with the person first. Which folder a page shows
 * is that page's own state (specs/shared-sources-and-surfaces §3); the project keeps no browsing choice to select. */
export interface UiPageWorkspaces {
  add(path: string): Promise<{ workspace_id: string }>;
  /** For the 「设为输出」 beside a refusal that the folder is only an input (`projects.directory_input_only`); the Host's dialog names it as the Host reads it. */
  setOutput(workspaceId: string): Promise<void>;
  /** For the rules menu's 「读取这个文件夹的说明文件」: turns reading on and confirms the current output, after the Host's dialog; a "no" there rejects without a status, a refusal with one. Answers the project's instructions as they are now. */
  readInstructions(): Promise<UiPageInstructionSettings>;
}

/** The project's instruction-file setting, as a page reads it after turning reading on (`ProjectDirectories.instructions`). */
export interface UiPageInstructionSettings {
  readonly off: boolean;
  readonly trusted: boolean;
  readonly why_not?: "default_output" | "off" | "not_chosen";
}
