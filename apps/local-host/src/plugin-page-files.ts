import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginOwnerFilesDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ownerFilePaths } from "./plugin-owner-files-paths.js";

/** The trusted shell receives paths only after checking the current owner's declaration, grants and filesystem. */
export function pluginPageFiles(home: string, declaration: PluginOwnerFilesDeclaration, authorize: (permission: string) => void) {
  const files = ownerFilePaths(home, declaration);
  return (paths: readonly string[]): readonly string[] => {
    authorize("storage:private"); authorize(declaration.read_permission);
    if (!Array.isArray(paths) || !paths.length || paths.length > 100) throw new ActionError("actions.input_invalid", "请选择要复制或拖出的文件");
    return paths.map(relative => {
      const file = files.inspect(relative, "file");
      if (!file.stat) throw new ActionError("actions.input_invalid", "文件已不存在");
      return file.path;
    });
  };
}
