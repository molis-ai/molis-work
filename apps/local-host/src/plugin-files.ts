import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ActionError, defineErrorCodes, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginExecutionControl, PluginFilesClient, PluginFilesDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertPluginActionCurrent } from "@molis-ai/molis-work-plugin-runtime";

const filesErrors = defineErrorCodes("host", {
  plugin_file_invalid: "invalid", plugin_file_unsafe: "forbidden", plugin_file_large: "invalid", plugin_file_exists: "conflict",
});
const FILE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/u;
const named = (name: string) => {
  if (typeof name !== "string" || !FILE_NAME.test(name)) throw filesErrors.plugin_file_invalid("文件名必须是单个普通名称，不能带路径");
  return name;
};
const hasCode = (error: unknown, code: string) => error instanceof Error && "code" in error && error.code === code;
const unsafe = () => filesErrors.plugin_file_unsafe("私有文件只能位于声明的普通目录中，不能使用符号链接或非普通文件");

/** The two executors use this same IO port. It keeps no descriptor or filesystem work alive after an operation. */
export function openPluginFiles(home: string, declaration: PluginFilesDeclaration, authorize: (permission: string) => void, installId: string): {
  client: PluginFilesClient; close(): void;
} {
  const root = realpathSync(home);
  let closed = false;
  const permit = (permission: string) => {
    if (closed) throw new ActionError("actions.plugin_unavailable", "插件文件服务已关闭");
    authorize("storage:private"); authorize(permission);
  };
  const directory = (create: boolean): string | null => {
    let current = root;
    for (const name of [declaration.store_name, declaration.directory]) {
      current = join(current, name);
      if (create) {
        try { mkdirSync(current, { mode: 0o700 }); }
        catch (error) { if (!hasCode(error, "EEXIST")) throw error; }
      }
      let stat;
      try { stat = lstatSync(current); }
      catch (error) { if (!create && hasCode(error, "ENOENT")) return null; throw error; }
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw unsafe();
    }
    return current;
  };
  const size = (bytes: number) => {
    if (bytes > declaration.max_file_bytes) throw filesErrors.plugin_file_large("文件超过此插件声明的大小上限");
  };
  // The control the Plugin hands in, and the original caller of the action this runs in, which the Plugin cannot hand in.
  const current = (control: PluginExecutionControl) => {
    control.signal?.throwIfAborted();
    requireSynchronous(control.assert_authority_current?.(), "最终授权检查必须同步完成");
    assertPluginActionCurrent(installId);
    permit(declaration.write_permission);
  };
  return { client: Object.freeze({
    list() {
      permit(declaration.read_permission);
      const base = directory(false);
      return base === null ? [] : readdirSync(base, { withFileTypes: true }).filter(entry => entry.isFile() && FILE_NAME.test(entry.name)).map(entry => entry.name).sort();
    },
    read(name: string) {
      permit(declaration.read_permission); named(name);
      const base = directory(false);
      if (base === null) return null;
      let fd: number;
      try { fd = openSync(join(base, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
      catch (error) { if (hasCode(error, "ENOENT")) return null; if (hasCode(error, "ELOOP")) throw unsafe(); throw error; }
      try {
        const stat = fstatSync(fd);
        if (!stat.isFile()) throw unsafe();
        size(stat.size);
        const parts: Buffer[] = [];
        let total = 0;
        for (;;) {
          const part = Buffer.allocUnsafe(Math.min(65_536, declaration.max_file_bytes - total + 1));
          const length = readSync(fd, part);
          if (length === 0) break;
          total += length; size(total);
          parts.push(part.subarray(0, length));
        }
        return Buffer.concat(parts, total);
      } finally { closeSync(fd); }
    },
    async create(control: PluginExecutionControl, name: string, bytes: Uint8Array) {
      permit(declaration.write_permission); named(name);
      if (!(bytes instanceof Uint8Array)) throw filesErrors.plugin_file_invalid("文件内容必须是字节");
      size(bytes.byteLength);
      // The caller may change its buffer while authority waits; the accepted bytes belong to this call.
      const content = Uint8Array.from(bytes);
      await control.beforeEffect();
      current(control);
      const base = directory(true)!;
      let fd: number;
      try { fd = openSync(join(base, name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
      catch (error) {
        if (hasCode(error, "EEXIST")) throw filesErrors.plugin_file_exists("文件已经存在，不能覆盖");
        if (hasCode(error, "ELOOP")) throw unsafe();
        throw error;
      }
      try { writeFileSync(fd, content); }
      catch (error) { try { unlinkSync(join(base, name)); } catch { /* Only this call's incomplete file; retained if cleanup fails. */ } throw error; }
      finally { closeSync(fd); }
    },
    async remove(control: PluginExecutionControl, name: string) {
      permit(declaration.write_permission); named(name);
      await control.beforeEffect();
      current(control);
      const base = directory(false);
      if (base === null) return;
      const path = join(base, name);
      let stat;
      try { stat = lstatSync(path); }
      catch (error) { if (hasCode(error, "ENOENT")) return; throw error; }
      if (!stat.isFile() || stat.isSymbolicLink()) throw unsafe();
      unlinkSync(path);
    },
  }), close() { closed = true; } };
}
