import { ACTION_ERROR_CODE } from "@molis-ai/molis-work-contracts/platform/actions";

/** The code shown when a reason carries none of its own: a package that could not be read back as the installation names it. */
const UNREADABLE = "plugin.package_invalid";

/**
 * Why an installed package of a project or of the Home is not running, by plugin id (BL-915). `get` answers the sentence, for the Host's
 * own messages and diagnostics; `code` answers the reason's own `<owner>.<reason>` code, the only thing the installed lists hand the page
 * (#1999): a missing package (`plugin.package_missing`), a publisher taken back (`plugin.publisher_revoked`), and so on. A reason given as a
 * bare sentence, or as a failure without a code of ours, is `plugin.package_invalid`.
 */
const codesByErrors = new WeakMap<RecoveryErrors, Map<string, string>>();
/** The codes live outside the instance so the Map constructor's `set` calls work before any field is initialized. */
const codesOf = (errors: RecoveryErrors): Map<string, string> => {
  let codes = codesByErrors.get(errors);
  if (!codes) { codes = new Map(); codesByErrors.set(errors, codes); }
  return codes;
};

export class RecoveryErrors extends Map<string, string> {
  override set(pluginId: string, reason: unknown): this {
    const code = (reason as { code?: unknown } | null)?.code;
    // `new RecoveryErrors(entries)` calls this from the Map constructor, before any field would exist; the WeakMap is ready either way.
    codesOf(this).set(pluginId, typeof code === "string" && ACTION_ERROR_CODE.test(code) ? code : UNREADABLE);
    return super.set(pluginId, reason instanceof Error ? reason.message : String(reason));
  }

  override delete(pluginId: string): boolean { codesOf(this).delete(pluginId); return super.delete(pluginId); }

  override clear(): void { codesOf(this).clear(); super.clear(); }

  code(pluginId: string): string | undefined { return codesOf(this).get(pluginId); }
}
