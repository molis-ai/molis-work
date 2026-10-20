import type { PluginAppContribution, PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';

/** Missing implementations are unavailable, but undeclared or malformed implementations cannot activate. */
export function syncContributionProblems(manifest: PluginManifest, contribution: PluginAppContribution): string[] {
  if (contribution.sync === undefined) return [];
  if (!Array.isArray(contribution.sync)) return ['同步实现须为集合列表'];
  const declared = new Set(manifest.sync?.collections.map(collection => collection.id) ?? []);
  const seen = new Set<string>(), problems: string[] = [];
  for (const binding of contribution.sync) {
    if (!binding || !declared.has(binding.collection_id) || seen.has(binding.collection_id)) {
      problems.push('同步集合未声明或重复'); continue;
    }
    seen.add(binding.collection_id);
    const replica = binding.replica;
    if (!replica || typeof replica !== 'object' || ['next', 'acknowledge', 'receive', 'cursor', 'counts', 'conflicts', 'resolve'].some(name =>
      typeof Reflect.get(replica, name) !== 'function')) problems.push('同步集合缺少增量实现');
    if (binding.content && (typeof binding.content.encode !== 'function' || typeof binding.content.decode !== 'function')) problems.push('同步附件实现不完整');
  }
  return problems;
}
