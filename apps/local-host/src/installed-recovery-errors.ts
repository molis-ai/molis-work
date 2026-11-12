import { ACTION_ERROR_CODE } from "@molis-ai/molis-work-contracts/platform/actions";

/** The code shown when a reason carries none of its own: a package that could not be read back as the installation names it. */
const UNREADABLE = "plugin.package_invalid";

/**
 * Why an installed package of a project or of the Home is not running, by plugin id (BL-915). `get` answers the sentence, for the Host's
 * own messages and diagnostics; `code` answers the reason's own `<owner>.<reason>` code, the only thing the installed lists hand the page
 * (#1999): a missing package (`plugin.package_missing`), a publisher taken back (`plugin.publisher_revoked`), and so on. A reason given as a
 * bare sentence, or as a failure without a code of ours, is `plugin.package_invalid`.
 */
export class RecoveryErrors extends Map<string, string> {
  private readonly codes = new Map<string, string>();

  override set(pluginId: string, reason: unknown): this {
    const code = (reason as { code?: unknown } | null)?.code;
    // The Map constructor calls nothing here, so `codes` is always there by the time anyone sets a reason.
    this.codes.set(pluginId, typeof code === "string" && ACTION_ERROR_CODE.test(code) ? code : UNREADABLE);
    return super.set(pluginId, reason instanceof Error ? reason.message : String(reason));
  }

  override delete(pluginId: string): boolean { this.codes.delete(pluginId); return super.delete(pluginId); }

  override clear(): void { this.codes.clear(); super.clear(); }

  code(pluginId: string): string | undefined { return this.codes.get(pluginId); }
}
