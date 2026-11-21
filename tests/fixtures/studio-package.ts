import { readFileSync } from "node:fs";
import { SANDBOX_PACKAGE_FILES, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentRelease } from "@molis-ai/molis-work-plugin-builder";
import { sandboxPluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { signPluginPackage, verifyPluginPackageSignature } from "@molis-ai/molis-work-plugin-runtime";
import { HomeConsentLedger, SandboxPackageStore } from "@molis-ai/molis-work-app-local-host";
import { readKeptPackage } from "../../apps/local-host/dist/sandbox-package.js";
import type { InstalledRelease } from "../../apps/local-host/dist/installed-release.js";
import { pluginComponentChoices, type PluginComponentPlan } from "@molis-ai/molis-work-design-system";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { newPublisher, payloadOf } from "./sandbox-package.js";

// A plugin the studio made is installed from its signed package like any other (PG-083). These fixtures stand where the studio's
// publication stands in production: they sign a release's files as one publisher, and leave the package and the person's pin of that
// publisher in the Home, which is all an installation reads.

export type StudioPublisher = ReturnType<typeof newPublisher>;
type Published = Pick<AgentRelease, "pluginId" | "version" | "bundlePath" | "design" | "nodes" | "prompts">;

/** The person's pin of a publisher, as confirming its first package leaves it. */
export function pinStudioPublisher(home: string, publisher: StudioPublisher, label = "这台电脑"): void {
  const ledger = new HomeConsentLedger(home);
  if (!ledger.publishers().some(item => item.key_id === publisher.identity))
    ledger.pinPublisher({ key_id: publisher.identity, public_key_spki_base64: publisher.signer.public_key_spki_base64, label, pinned_at: new Date().toISOString(), pinned_by: "test" });
}

/** A release's signed package: version `n` is `n.0.0`, and upgrades the versions in `upgradesFrom`. */
export function studioPackage(release: Published, publisher: StudioPublisher, options: { upgradesFrom?: readonly number[]; scope?: "home" } = {}): PluginPackageBundle {
  // A package has a page with at least one part; a fixture with none gets a heading, which no test reads.
  const bare = release.design.parts.length === 0;
  const contract: SandboxPluginContract = bare ? { ...release.design.contract, pages: [{ id: "home", title: release.design.title, regions: [{ id: "main", title: release.design.title, operationIds: [] }] }] } : release.design.contract;
  const parts: PluginComponentPlan[] = bare ? [{ id: "title", pageId: "home", regionId: "main", intent: "heading", purpose: "说明插件", props: { title: release.design.title } }] : release.design.parts;
  const nodes = bare ? parts.map(part => ({ ...part, kind: pluginComponentChoices(part, contract)[0]!.kind })) : release.nodes;
  const manifest = sandboxPluginManifest({ pluginId: release.pluginId, name: release.design.title, version: release.version + ".0.0",
    publisher: { publisher_id: "molis-studio", signature: publisher.identity }, presentation: release.design.presentation !== undefined, contract,
    upgradesFrom: (options.upgradesFrom ?? []).map(version => version + ".0.0"), ...(options.scope === "home" ? { runtime: { scope: "home" as const } } : {}) });
  return signPluginPackage({ payload: payloadOf(manifest, {
    [SANDBOX_PACKAGE_FILES.entrypoint]: readFileSync(release.bundlePath, "utf8"), [SANDBOX_PACKAGE_FILES.contract]: JSON.stringify(contract),
    [SANDBOX_PACKAGE_FILES.interface]: JSON.stringify({ parts, nodes, ...(release.design.presentation ? { presentation: release.design.presentation } : {}) }),
    [SANDBOX_PACKAGE_FILES.prompts]: JSON.stringify(release.prompts ?? []),
  }), signature: null, publisher_key: null }, publisher.signer);
}

/** The release an installation runs: read back from the package kept in the Home, under a publisher the person pinned. */
export function packagedStudioRelease(home: string, release: Published, publisher: StudioPublisher, options: { upgradesFrom?: readonly number[]; scope?: "home" } = {}): InstalledRelease {
  const bundle = studioPackage(release, publisher, options), packages = new SandboxPackageStore(home);
  pinStudioPublisher(home, publisher);
  packages.save(bundle, readKeptPackage(verifyPluginPackageSignature(bundle).bundle.payload));
  return packages.load(release.pluginId, publisher.identity, release.version + ".0.0");
}
