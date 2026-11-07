import { pluginErrors, type SandboxAgentBody, type SandboxPackageManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import { readPackagedSkills, sandboxRoleIdentity } from '@molis-ai/molis-work-plugin-sdk';

/** Every file the package's text declarations name: each role material's body, and each method's body and resources. */
export function sandboxAgentBodyPaths(manifest: SandboxPackageManifest): string[] {
  return [...(manifest.agent ?? []).map(item => item.body),
    ...(manifest.methods ?? []).flatMap(method => [...(method.body ? [method.body] : []), ...(method.resources ?? []).map(resource => resource.path)])];
}

/**
 * Reads only declared resources from the verified package's in-memory file map, never a filesystem path. Role materials are the
 * package's derived text roles; methods are read as every package's Skills are (`readPackagedSkills`): a method's id is its own.
 */
export function readSandboxAgentBodies(manifest: SandboxPackageManifest, files: ReadonlyMap<string, Uint8Array>): SandboxAgentBody[] {
  const result: SandboxAgentBody[] = [];
  for (const entry of manifest.agent ?? []) {
    const bytes = files.get(entry.body);
    if (!bytes || bytes.length > 32_000) throw pluginErrors.declaration_invalid('正文资源缺失或超过字节上限');
    let body: string;
    try { body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { throw pluginErrors.declaration_invalid('正文资源不是有效 UTF-8'); }
    if (!body.trim() || body.length > 8000) throw pluginErrors.declaration_invalid('正文必须非空且不超过 8000 字');
    const ids = sandboxRoleIdentity(manifest.plugin_id, entry.name);
    result.push({ kind: 'role', entry_id: ids.entry_id, prompt_id: ids.prompt_id, name: entry.name, purpose: entry.purpose, body });
  }
  const methods = manifest.methods ?? [], skills = readPackagedSkills(methods, files);
  if (skills.problems.length) {
    throw pluginErrors.declaration_invalid('沙箱包：' + skills.problems.map(problem => `${problem.path}：${problem.reason}`).join('；'), { problems: skills.problems });
  }
  for (const method of methods) {
    const body = skills.bodies.find(item => item.skill_id === method.skill_id)!.body;
    result.push({ kind: 'method', entry_id: method.skill_id, name: method.name, purpose: method.summary, body });
  }
  return result;
}
