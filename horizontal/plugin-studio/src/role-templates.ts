/** Authored text that the person may choose to adopt after installing a Studio release. */
export interface StudioRoleTemplate { name: string; purpose: string; body: string }

export function studioRoleTemplates(value: unknown): StudioRoleTemplate[] | undefined {
  if (value === undefined) return undefined;
  const refuse = (): never => { throw new Error('角色模板需要名称、用途和正文，请检查重复名称或过长的文字'); };
  const text = (word: unknown, limit: number): word is string => typeof word === 'string' && !!word.trim() && word.length <= limit;
  if (!Array.isArray(value) || value.length > 64) return refuse();
  const names = new Set<string>();
  return value.map(row => {
    if (!row || typeof row !== 'object' || Object.keys(row).some(key => !['name', 'purpose', 'body'].includes(key))
      || !text(row.name, 80) || !text(row.purpose, 300) || !text(row.body, 8000) || names.has(row.name)) return refuse();
    names.add(row.name);
    return { name: row.name, purpose: row.purpose, body: row.body };
  });
}
