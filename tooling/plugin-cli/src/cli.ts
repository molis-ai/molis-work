import { browserSiteDeclarations } from "@molis-ai/molis-work-contracts/platform/plugin";
import { validatePluginManifestFile } from "./validate.js";
import { createPluginProject } from "./create.js";
import { packPluginProject } from "./package-files.js";
import { packSandboxProject, sandboxPackOptions } from "./pack-sandbox.js";
import { readPublisherIdentity, signPluginPackageFile, verifyPluginPackageFile } from "./package-signing.js";
import type { PluginDevelopmentResult } from "@molis-ai/molis-work-contracts/platform/tooling";

const usage = "Usage:\n  molis-work plugin dev <source-directory> <isolated-state-directory> <comma-separated-grants> --allow-unsigned-development\n  molis-work-plugin validate <manifest.json>\n  molis-work-plugin create <directory> <plugin-id> <publisher-id> <binding-signature>\n  molis-work-plugin pack <directory> <output.json>\n  molis-work-plugin pack-sandbox <directory> <output.json> --name <name> --version <version> --publisher-id <id> --publisher-key-id <fingerprint> [--scope project|home] [--icon <icon>] [--compatible-from <versions>] [--agent <JSON>] [--methods <JSON>]\n  molis-work-plugin identity <public-key.pem>\n  molis-work-plugin sign <input.json> <private-key.pem> <output.json>\n  molis-work-plugin verify <input.json> <trusted-public-key.pem>\n  molis-work plugin install <signed-package.json> <project-id> [--pin-as <publisher-name>] [--confirm]\n";

export interface PluginCliOutput {
  stdout(value: string): void;
  stderr(value: string): void;
}

export interface PluginCliHost {
  runDevelopment(input: { directory: string; state_directory: string; grants: string[]; allow_unsigned_development: true }): Promise<PluginDevelopmentResult>;
  /** Asks the Home's resident Host to preview a signed package, or with `confirm` to install it; answers what the Host answered. */
  install(input: { bundle_path: string; project_id: string; confirm: boolean; pin_label?: string }): Promise<Record<string, unknown>>;
}

export async function runPluginCli(args: readonly string[], output: PluginCliOutput, host?: PluginCliHost): Promise<number> {
  if (args.length === 0 || (args.length === 1 && (args[0] === "--help" || args[0] === "help"))) {
    output.stdout(usage);
    return 0;
  }
  const arities: Record<string, number> = { validate: 2, create: 5, pack: 3, identity: 2, sign: 4, verify: 3 };
  arities.dev = 5;
  if (args[0] === "install") return runInstall(args.slice(1), output, host);
  if (args[0] === "pack-sandbox") {
    try {
      if (!args[1] || !args[2]) throw new Error('pack-sandbox 需要输入目录与输出文件');
      const bundle = await packSandboxProject(args[1], args[2], sandboxPackOptions(args.slice(3)));
      output.stdout(`${JSON.stringify({ packed: true, plugin_id: bundle.payload.manifest.plugin_id, output: args[2], signed: false })}\n`);
      return 0;
    } catch (error) { output.stderr((error instanceof Error ? error.message : String(error)) + '\n'); return 1; }
  }
  if (arities[args[0]!] !== args.length) {
    output.stderr(usage);
    return 2;
  }
  try {
    if (args[0] === "dev") {
      if (args[4] !== "--allow-unsigned-development") throw new Error("开发源码执行需要 --allow-unsigned-development；grant 不是 OS sandbox");
      if (!host) throw new Error("请通过 molis-work plugin dev 使用应用 Host；独立工具不会创建另一套数据库实现");
      const result = await host.runDevelopment({ directory: args[1]!, state_directory: args[2]!,
        grants: args[3]!.split(",").map(value => value.trim()).filter(Boolean), allow_unsigned_development: true });
      output.stdout(`${JSON.stringify(result)}\n`);
      return result.health.ok && result.poll.ok ? 0 : 1;
    }
    if (args[0] === "identity") {
      output.stdout(`${JSON.stringify({ publisher_identity: await readPublisherIdentity(args[1]!) })}\n`);
      return 0;
    }
    if (args[0] === "pack") {
      const bundle = await packPluginProject(args[1]!, args[2]!);
      output.stdout(`${JSON.stringify({ packed: true, plugin_id: bundle.payload.manifest.plugin_id, output: args[2], signed: false })}\n`);
      return 0;
    }
    if (args[0] === "sign") {
      await signPluginPackageFile(args[1]!, args[2]!, args[3]!);
      output.stdout(`${JSON.stringify({ signed: true, output: args[3] })}\n`);
      return 0;
    }
    if (args[0] === "verify") {
      const bundle = await verifyPluginPackageFile(args[1]!, args[2]!);
      output.stdout(`${JSON.stringify({ verified: true, plugin_id: bundle.payload.manifest.plugin_id, version: bundle.payload.manifest.version })}\n`);
      return 0;
    }
    if (args[0] === "create") {
      const result = await createPluginProject({ directory: args[1]!, plugin_id: args[2]!,
        publisher_id: args[3]!, binding_signature: args[4]! });
      output.stdout(`${JSON.stringify({ created: true, ...result })}\n`);
      return 0;
    }
    const manifest = await validatePluginManifestFile(args[1]!);
    // The websites it says it uses in the side panel browser, for the author to check what people will read.
    const sites = browserSiteDeclarations(manifest);
    output.stdout(`${JSON.stringify({ valid: true, plugin_id: manifest.plugin_id, version: manifest.version, ...(sites.length ? { browser_sites: sites } : {}) })}\n`);
    return 0;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "plugin.manifest_invalid";
    output.stderr(`${JSON.stringify({ valid: false, code,
      message: error instanceof Error ? error.message : "Plugin Manifest validation failed" })}\n`);
    return 1;
  }
}

/** `install <bundle.json> <project-id> [--pin-as <name>] [--confirm]`: without `--confirm` only shows what installing would mean. */
async function runInstall(rest: readonly string[], output: PluginCliOutput, host?: PluginCliHost): Promise<number> {
  const [bundle, project, ...flags] = rest;
  const confirm = flags.includes("--confirm"), pin = flags.indexOf("--pin-as");
  const pinLabel = pin === -1 ? undefined : flags[pin + 1];
  const rest2 = flags.filter((flag, index) => flag !== "--confirm" && flag !== "--pin-as" && index !== pin + 1);
  if (!bundle || !project || rest2.length || (pin !== -1 && !pinLabel)) { output.stderr(usage); return 2; }
  try {
    if (!host) throw new Error("请通过 molis-work plugin install 使用应用 Host；独立工具不会创建另一套安装实现");
    const result = await host.install({ bundle_path: bundle, project_id: project, confirm, ...(pinLabel ? { pin_label: pinLabel } : {}) });
    output.stdout(`${JSON.stringify(confirm ? result : { ...result, installed: false, next: "未安装；看过发布者和要的权限后，加 --confirm 重新运行（发布者还没固定时再加 --pin-as <名称>）" })}\n`);
    return 0;
  } catch (error) {
    output.stderr(`${JSON.stringify({ installed: false, code: error && typeof error === "object" && "code" in error ? error.code : "plugin.install_failed",
      message: error instanceof Error ? error.message : "Plugin install failed" })}\n`);
    return 1;
  }
}
