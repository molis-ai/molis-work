/**
 * What a generated plugin tells the model. The code declares it (`export const prompts = [...]`, literals only) and
 * calls it by id (`model.generate` with `{ prompt: id, input }`); the Host reads the declarations from the source, the
 * checks refuse a call that names nothing declared, and an installed plugin's prompts are registered with the rest of
 * the Home's prompts, where the person sees and edits them.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';
import type { AgentDefinitionRegistration } from '@molis-ai/molis-work-contracts/services/agent-definitions';
import type { AgentRelease, PluginPrompt } from '@molis-ai/molis-work-plugin-builder';
import { agentDefinitionsFor } from '../agent-definitions/agent-definitions.js';
import { builtinRegistrations } from '../agent-definitions/builtin-registrations.js';

export const PROMPT_ID = /^[a-z][a-z0-9-]{0,39}$/;
const MAX_BODY = 8000;

/** One `model.generate` call as written: the prompt id it names, or that it still sends inline instructions. */
export interface PromptCall { file: string; line: number; prompt: string | null; instructions: boolean }

const text = (node: ts.Expression | undefined): string | null => {
  let value = node;
  while (value && (ts.isParenthesizedExpression(value) || ts.isAsExpression(value) || ts.isSatisfiesExpression(value))) value = value.expression;
  return value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) ? value.text : null;
};
const unwrap = (node: ts.Expression): ts.Expression => ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
const property = (object: ts.ObjectLiteralExpression, name: string) =>
  object.properties.find((item): item is ts.PropertyAssignment => ts.isPropertyAssignment(item) && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) && item.name.text === name);

/** The prompts a plugin's sources declare and the model calls they make, with what is wrong in how they are written. */
export function readPluginPrompts(sources: ReadonlyMap<string, string>): { prompts: PluginPrompt[]; calls: PromptCall[]; problems: string[] } {
  const prompts: PluginPrompt[] = [], calls: PromptCall[] = [], problems: string[] = [], seen = new Map<string, string>();
  for (const [file, source] of sources) {
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
    const line = (node: ts.Node) => tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
    const visit = (node: ts.Node) => {
      if (ts.isVariableStatement(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const declaration of node.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'prompts') continue;
          const list = declaration.initializer && unwrap(declaration.initializer);
          if (!list || !ts.isArrayLiteralExpression(list)) { problems.push(`${file}:${line(declaration)} export const prompts must be an array literal`); continue; }
          for (const element of list.elements) {
            const item = unwrap(element as ts.Expression);
            const values = ts.isObjectLiteralExpression(item) ? { id: text(property(item, 'id')?.initializer), title: text(property(item, 'title')?.initializer),
              purpose: text(property(item, 'purpose')?.initializer), body: text(property(item, 'body')?.initializer) } : null;
            if (!values || Object.values(values).some(value => value === null)) { problems.push(`${file}:${line(element)} each prompt is { id, title, purpose, body }, all string literals`); continue; }
            const prompt = values as PluginPrompt;
            if (!PROMPT_ID.test(prompt.id)) problems.push(`${file}:${line(element)} prompt id "${prompt.id}" must be lowercase letters, digits and hyphens (at most 40)`);
            else if (seen.has(prompt.id)) problems.push(`${file}:${line(element)} prompt id "${prompt.id}" is already declared in ${seen.get(prompt.id)}`);
            if (!prompt.title.trim() || !prompt.purpose.trim() || !prompt.body.trim()) problems.push(`${file}:${line(element)} prompt "${prompt.id}" needs a title, a purpose and a body`);
            if (prompt.body.length > MAX_BODY) problems.push(`${file}:${line(element)} prompt "${prompt.id}" body is longer than ${MAX_BODY} characters`);
            seen.set(prompt.id, file); prompts.push({ id: prompt.id, title: prompt.title.trim(), purpose: prompt.purpose.trim(), body: prompt.body.trim() });
          }
        }
      }
      if (ts.isCallExpression(node) && node.arguments.length && text(node.arguments[0]) === 'model.generate') {
        const argument = node.arguments[1] && unwrap(node.arguments[1]);
        if (!argument || !ts.isObjectLiteralExpression(argument)) problems.push(`${file}:${line(node)} write model.generate's input as an object literal: { prompt: 'id', input }`);
        else {
          const named = property(argument, 'prompt'), id = named ? text(named.initializer) : null;
          if (named && id === null) problems.push(`${file}:${line(node)} model.generate's prompt must be a string literal id, not a computed value`);
          calls.push({ file, line: line(node), prompt: id, instructions: Boolean(property(argument, 'instructions')) || argument.properties.some(item => ts.isShorthandPropertyAssignment(item) && item.name.text === 'instructions') });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  const declared = new Set(prompts.map(prompt => prompt.id));
  for (const call of calls) {
    if (call.instructions) problems.push(`${call.file}:${call.line} model.generate still sends instructions: declare them in export const prompts and call { prompt: 'id', input }, so the person can see and edit them`);
    else if (call.prompt === null) problems.push(`${call.file}:${call.line} model.generate names no prompt: add { prompt: 'id', input } with an id from export const prompts`);
    else if (!declared.has(call.prompt)) problems.push(`${call.file}:${call.line} model.generate names prompt "${call.prompt}", which no export const prompts declares`);
  }
  return { prompts, calls, problems };
}

/** A build's sources as they stand: settled operation files where a check passed, the working copy otherwise. */
export async function buildSources(directory: string, settled: string, operations: number): Promise<Map<string, string>> {
  const sources = new Map<string, string>();
  for (const entry of await readdir(join(directory, 'src'), { withFileTypes: true }).catch(() => [])) {
    if (entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'index.ts') sources.set('src/' + entry.name, await readFile(join(directory, 'src', entry.name), 'utf8'));
  }
  for (let index = 0; index < operations; index++) {
    const name = 'src/operations/' + index + '.ts';
    const source = await readFile(join(settled, name), 'utf8').catch(() => readFile(join(directory, name), 'utf8').catch(() => null));
    if (source !== null) sources.set(name, source);
  }
  return sources;
}

/**
 * The version the register counts a prompt at: the release where its current text first appeared. An unchanged prompt
 * keeps its version across releases, so only a changed default tells the person “默认已更新”.
 */
export function promptVersions(release: AgentRelease, releases: readonly AgentRelease[]): Map<string, number> {
  const versions = new Map<string, number>();
  const ordered = [...releases].filter(item => item.version <= release.version).sort((a, b) => a.version - b.version);
  for (const prompt of release.prompts ?? []) {
    let since = release.version;
    for (let index = ordered.length - 1; index >= 0; index--) {
      const earlier = ordered[index]!.prompts?.find(item => item.id === prompt.id);
      if (earlier?.body !== prompt.body) break;
      since = ordered[index]!.version;
    }
    versions.set(prompt.id, since);
  }
  return versions;
}

/** An installed generated plugin's prompts, registered with the Home's so the person sees and edits them. */
export function generatedRegistration(release: AgentRelease, releases: readonly AgentRelease[], state: 'enabled' | 'disabled', pluginVersion: string): AgentDefinitionRegistration {
  const versions = promptVersions(release, releases);
  const callsModel = release.design.contract.operations.some(operation => operation.effects.capabilities?.includes('model.generate'));
  return { owner_id: release.pluginId, source: { kind: 'plugin', plugin_id: release.pluginId, plugin_version: pluginVersion, title: release.design.title, origin: 'generated', state },
    prompts: (release.prompts ?? []).map(prompt => ({ prompt_id: prompt.id, version: versions.get(prompt.id) ?? release.version, kind: 'instruction' as const,
      title: prompt.title, purpose: prompt.purpose, used_by: [release.design.title], body: prompt.body })), roles: [],
    // A release from before prompts were declared writes its model instructions in code: they run, but nobody can see or edit them.
    ...(callsModel && !release.prompts ? { notes: ['这个版本生成于登记 Prompt 之前：调用模型的要求写在代码里，设置里看不到也改不了。在插件创作台修改后重新发布一次即可登记。'] } : {}) };
}

export function registerGeneratedPrompts(home: string, registration: AgentDefinitionRegistration): void {
  agentDefinitionsFor(home, builtinRegistrations).register(registration);
}

export function unregisterGeneratedPrompts(home: string, pluginId: string): void {
  agentDefinitionsFor(home, builtinRegistrations).unregister(pluginId);
}

/**
 * What an installed or trial plugin's `model.generate` call runs with: the registered text (the person's edit, if
 * any) when the installed plugin declares that prompt, else what the build or release declares. Unknown ids fail.
 */
export async function resolvePluginPrompt(home: string, pluginId: string, promptId: string, declared: () => Promise<readonly PluginPrompt[]>): Promise<{ body: string; version: string }> {
  const registry = agentDefinitionsFor(home, builtinRegistrations);
  if (registry.hasPrompt(pluginId, promptId)) {
    const resolved = registry.instruction(pluginId, promptId, 'plugin:' + pluginId);
    return { body: resolved.body, version: `${promptId}@${resolved.version}${resolved.user_revision === null ? '' : '+user.' + resolved.user_revision}` };
  }
  const prompt = (await declared()).find(item => item.id === promptId);
  if (!prompt) throw new Error('插件调用了没有声明的模型要求：' + promptId);
  return { body: prompt.body, version: `${promptId}@build` };
}
