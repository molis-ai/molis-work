import { validatePluginManifestFile } from "./validate.js";
import { createPluginProject } from "./create.js";
import { packPluginProject } from "./package-files.js";
import { readPublisherIdentity, signPluginPackageFile, verifyPluginPackageFile } from "./package-signing.js";
import type { PluginDevelopmentResult } from "@molis-ai/molis-work-contracts/platform/tooling";

const usage = "Usage:\n  molis-work plugin dev <source-directory> <isolated-state-directory> <comma-separated-grants> --allow-unsigned-development\n  molis-work-plugin validate <manifest.json>\n  molis-work-plugin create <directory> <plugin-id> <publisher-id> <binding-signature>\n  molis-work-plugin pack <directory> <output.json>\n  molis-work-plugin identity <public-key.pem>\n  molis-work-plugin sign <input.json> <private-key.pem> <output.json>\n  molis-work-plugin verify <input.json> <trusted-public-key.pem>\n";

export interface PluginCliOutput {
  stdout(value: string): void;
  stderr(value: string): void;
}

export interface PluginCliHost {
  runDevelopment(input: { directory: string; state_directory: string; grants: string[]; allow_unsigned_development: true }): Promise<PluginDevelopmentResult>;
}

export async function runPluginCli(args: readonly string[], output: PluginCliOutput, host?: PluginCliHost): Promise<number> {
  if (args.length === 0 || (args.length === 1 && (args[0] === "--help" || args[0] === "help"))) {
    output.stdout(usage);
    return 0;
  }
  const arities: Record<string, number> = { validate: 2, create: 5, pack: 3, identity: 2, sign: 4, verify: 3 };
  arities.dev = 5;
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
    output.stdout(`${JSON.stringify({ valid: true, plugin_id: manifest.plugin_id, version: manifest.version })}\n`);
    return 0;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "plugin_manifest_invalid";
    output.stderr(`${JSON.stringify({ valid: false, code,
      message: error instanceof Error ? error.message : "Plugin Manifest validation failed" })}\n`);
    return 1;
  }
}
