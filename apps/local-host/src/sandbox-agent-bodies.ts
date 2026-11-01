import { pluginErrors, type SandboxAgentBody, type SandboxPackageManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import { sandboxAgentBodyIdentity } from '@molis-ai/molis-work-plugin-sdk';

/** Reads only declared resources from the verified package's in-memory file map, never a filesystem path. */
export function readSandboxAgentBodies(manifest: SandboxPackageManifest, files: ReadonlyMap<string, Uint8Array>): SandboxAgentBody[] {
  const result: SandboxAgentBody[] = [];
  for (const [kind, entries] of [['role', manifest.agent ?? []], ['method', manifest.methods ?? []]] as const) {
    for (const entry of entries) {
      const bytes = files.get(entry.body);
      if (!bytes || bytes.length > 32_000) throw pluginErrors.declaration_invalid('正文资源缺失或超过字节上限');
      let body: string;
      try { body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
      catch { throw pluginErrors.declaration_invalid('正文资源不是有效 UTF-8'); }
      if (!body.trim() || body.length > 8000) throw pluginErrors.declaration_invalid('正文必须非空且不超过 8000 字');
      const ids = sandboxAgentBodyIdentity(manifest.plugin_id, kind, entry.name);
      result.push({ kind, entry_id: ids.entry_id, ...(kind === 'role' ? { prompt_id: ids.prompt_id } : {}), name: entry.name, purpose: entry.purpose, body });
    }
  }
  return result;
}
