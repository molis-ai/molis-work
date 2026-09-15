import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { SCHEMA_VERSION, INSTALLER_ID } from "./home-contract.js";
import type { MolisWorkHomeInstallOptions, MolisWorkHomeInstallResult, MolisWorkHomeInstallStatus, MolisWorkHomeInstallStep, TextMutation, PromotedRelease, InstallManifest } from "./home-contract.js";
import { inspectSource, safeReleaseName } from "./home-source.js";
import { inspectRelease, createRelease, promoteRelease, rollbackPromotedRelease } from "./home-release.js";
import { ensureDirectory, writeOwnedText, readOwnedJson, replaceOwnedJson, pathState, rollbackTextMutations } from "./home-files.js";
import { launcherSource } from "./home-launcher.js";
import { resolveConfiguredHome } from "../product-home.js";

/** Installs only App-owned files; Runtime configuration is a separate explicit operation. */

export async function installMolisWorkHome(
  options: MolisWorkHomeInstallOptions,
): Promise<MolisWorkHomeInstallResult> {
  const homeDirectory = path.resolve(options.homeDirectory ?? resolveConfiguredHome());
  const sourceDirectory = path.resolve(options.sourceDirectory);
  const source = await inspectSource(sourceDirectory, options.version);
  const releaseName = safeReleaseName(source.version);
  const releasesDirectory = path.join(homeDirectory, "releases");
  const releaseDirectory = path.join(releasesDirectory, releaseName);
  const configDirectory = path.join(homeDirectory, "config");
  const binDirectory = path.join(homeDirectory, "bin");
  const projectDirectory = path.join(homeDirectory, "projects");
  const logsDirectory = path.join(homeDirectory, "logs");
  const installManifestPath = path.join(configDirectory, "installation.json");
  const writtenPaths: string[] = [];
  const preservedPaths: string[] = [];
  const removedPaths: string[] = [];
  const mutations: TextMutation[] = [];
  let promoted: PromotedRelease | null = null;

  try {
    await ensureDirectory(homeDirectory);
    await Promise.all(
      [releasesDirectory, configDirectory, binDirectory, projectDirectory, logsDirectory].map(ensureDirectory),
    );

    const existingRelease = await inspectRelease(
      releaseDirectory,
      source.version,
      source.contentDigest,
      source.bundledNodePath != null,
    );
    let releaseChanged = false;
    if (existingRelease === "valid") {
      preservedPaths.push(releaseDirectory);
    } else {
      await runStep(options, "before_stage_release");
      const stagingDirectory = path.join(releasesDirectory, `.staging-${releaseName}-${randomUUID()}`);
      try {
        await createRelease(stagingDirectory, source, source.version);
        await runStep(options, "before_activate_release");
        promoted = await promoteRelease(stagingDirectory, releaseDirectory, existingRelease !== "missing");
        releaseChanged = true;
        writtenPaths.push(releaseDirectory);
      } catch (error) {
        await fs.rm(stagingDirectory, { recursive: true, force: true });
        throw error;
      }
    }

    const launcherFiles = {
      cli: ["molis-work", "goalboard"],
      mcp: ["molis-work-mcp", "goalboard-mcp"],
      web: ["molis-work-web", "goalboard-web"],
    } as const;
    const launchers = {
      cli: path.join(binDirectory, "molis-work"),
      mcp: path.join(binDirectory, "molis-work-mcp"),
      web: path.join(binDirectory, "molis-work-web"),
    };
    for (const [name, names] of Object.entries(launcherFiles)) {
      const sourceText = launcherSource(
        name as keyof typeof launchers,
        releaseDirectory,
        source.bundledNodePath != null,
      );
      for (const fileName of names) {
        const launcherPath = path.join(binDirectory, fileName);
        const changed = await writeOwnedText(launcherPath, sourceText, mutations);
        if (changed) writtenPaths.push(launcherPath);
        else preservedPaths.push(launcherPath);
      }
    }

    const previousInstall = await readOwnedJson<InstallManifest>(installManifestPath);
    const releasePath = path.relative(homeDirectory, releaseDirectory);
    const installChanged =
      !previousInstall ||
      previousInstall.version !== source.version ||
      previousInstall.release_path !== releasePath ||
      previousInstall.content_digest !== source.contentDigest;
    if (installChanged) {
      await runStep(options, "before_write_install_manifest");
      await replaceOwnedJson(
        installManifestPath,
        {
          schema_version: SCHEMA_VERSION,
          installer: INSTALLER_ID,
          version: source.version,
          release_path: releasePath,
          content_digest: source.contentDigest,
          updated_at: new Date().toISOString(),
        } satisfies InstallManifest,
        mutations,
      );
      writtenPaths.push(installManifestPath);
    } else {
      preservedPaths.push(installManifestPath);
    }

    if (promoted?.backupDirectory) {
      await fs.rm(promoted.backupDirectory, { recursive: true, force: true });
    }

    const obsoletePostInstallSelections = path.join(configDirectory, "postinstall-project-selections");
    const obsoleteState = await pathState(obsoletePostInstallSelections);
    if (obsoleteState?.isDirectory()) {
      try {
        await fs.rm(obsoletePostInstallSelections, { recursive: true, force: true });
        removedPaths.push(obsoletePostInstallSelections);
      } catch {
        preservedPaths.push(obsoletePostInstallSelections);
      }
    } else if (obsoleteState) {
      preservedPaths.push(obsoletePostInstallSelections);
    }

    const status: MolisWorkHomeInstallStatus = releaseChanged
      ? existingRelease === "refreshable"
        ? "refreshed"
        : promoted?.backupDirectory
          ? "repaired"
        : previousInstall
          ? "upgraded"
          : "installed"
      : installChanged
        ? "repaired"
        : "unchanged";

    return {
      status,
      runtime_layout: "self_contained",
      home_directory: homeDirectory,
      version: source.version,
      release_directory: releaseDirectory,
      program_directory: path.join(releaseDirectory, "dist"),
      skill_directory: path.join(releaseDirectory, "skills"),
      project_directory: projectDirectory,
      logs_directory: logsDirectory,
      launchers,
      next_steps: {
        message:
          `Molis Work 只完成了本体安装；没有创建项目，也没有修改 Runtime 配置或用户项目文件。Runtime 接入、项目设置和 Web 常驻服务必须通过后续单独的显式流程完成。接入 Codex / Claude Code 后需要新开 Session，因为 Runtime 只在 Session 启动时读取 MCP 与 Skill 清单，当前对话不会动态出现新工具。重开后说「继续用 Molis Work」；Molis Work 会展示当前目录以前用过的项目并请你确认，不会把普通选择偷偷设成目录默认。${status === "unchanged" ? "" : " 如果此前已启用常驻 Web 服务，请先执行 service status；返回 needs_repair 时执行 service_install_command，不要先执行 service_restart_command；返回 running 或 unhealthy 且仅需加载新内容时，才执行 service_restart_command。安装器不会静默终止未知进程。"}`,
        web_command: [launchers.web, "--home", homeDirectory],
        service_install_command: [launchers.cli, "service", "install", "--home", homeDirectory, "--confirm"],
        service_restart_command: [launchers.cli, "service", "restart", "--home", homeDirectory, "--confirm"],
      },
      written_paths: writtenPaths,
      preserved_paths: preservedPaths,
      removed_paths: removedPaths,
    };
  } catch (error) {
    await rollbackTextMutations(mutations);
    if (promoted) await rollbackPromotedRelease(promoted);
    throw error;
  }
}

export async function runStep(options: MolisWorkHomeInstallOptions, step: MolisWorkHomeInstallStep): Promise<void> {
  await options.beforeStep?.(step);
}

