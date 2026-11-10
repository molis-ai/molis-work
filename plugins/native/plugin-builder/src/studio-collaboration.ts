import { TEXT_REF_LIMITS, type TextRef } from '@molis-ai/molis-work-contracts/platform/ui';
import { textArgs, tryOwnedTextRef } from '@molis-ai/molis-work-plugin-sdk/ui';
import { BUILDER_PLUGIN_ID } from './manifest.js';
import type { AgentBuild, AgentDesign } from './agent-model.js';

export type StudioTextRef = Extract<TextRef, { key: string }>;
export interface StudioBuildFailure {
  readonly title: StudioTextRef;
  readonly guidance?: StudioTextRef;
  readonly detail: string;
}

// These are the only references this part of a Builder draft can hold. The SDK checks the wire shape and owner.
const STEP = 'plugin-builder.studio-step.';
const STUDIO = 'plugin-builder.agent-studio.';
const stepArguments = {
  'plugins-needed': {}, 'plugins-enabled': {}, 'plugins-declined': {},
  'model-retry': { round: 'positive' },
  'repair-design': { round: 'repair' }, 'repair-experience': { round: 'repair' }, 'repair-ui': { round: 'repair' },
  'understanding-request': {}, 'questions': { count: 'positive' }, 'proposed': { count: 'positive' },
  'sketching-experience': {}, 'experience-shared': {}, 'detailing-proposal': { title: 'text' },
  'choosing-capability': { purpose: 'text' }, 'capability-selected': { purpose: 'text', capability: 'text' },
  'revising-design': {}, 'revising-display': {}, 'display-revised': {}, 'design-copy-revised': {},
  'design-revised': { added: 'count', removed: 'count', changed: 'count', parts: 'count', reworked: 'count' },
  'design-frozen': { operations: 'count', parts: 'count', checks: 'count' },
  'capability-needed': { purpose: 'text', capability: 'text' },
  'repairing-live-read': { operation: 'text' }, 'live-read-failed': {}, 'live-read-fixed': {},
  'designing-layout': {}, 'layout-applied': {}, 'checking-layout': {}, 'layout-kept': {},
  'layout-needs-work': {}, 'layout-reviewed-with-notes': {}, 'layout-reviewed': {}, 'layout-review-unavailable': {},
  'choosing-component': { purpose: 'text' }, 'using-design-choice': {}, 'waiting-for-component': {},
  'component-placed': {}, 'using-persons-component': {},
  'implementing-operation': { operation: 'text' }, 'repair-operation': { operation: 'text', round: 'repair' },
  'operation-connected': { operation: 'text' }, 'operation-not-verified': { operation: 'text' },
  'round-unfinished': {}, 'running-acceptance': {}, 'rerunning-acceptance': {}, 'acceptance-passed': {}, 'acceptance-failed': {},
  'repairing-acceptance': { count: 'positive' }, 'acceptance-repaired': {}, 'repair-not-verified': {},
} as const;
const titleArguments = {
  'build-interrupted': {}, 'build-checks-failed': {}, 'build-target-incomplete': {}, 'build-target-checks-failed': {},
  'build-target-capability-unavailable': { capability: 'text' },
  'build-target-acceptance-failed': {}, 'build-acceptance-blocked': {}, 'build-acceptance-failed': {},
  'build-live-read-failed': { operation: 'text' }, 'build-visual-checks-failed': {},
  'build-model-unreachable': { count: 'count' }, 'name-did-not-work-expected-trial': { name: 'text' },
  'one-feature-could-not-be-written': {}, 'design-step-did-not-finish': {},
} as const;
const guidanceArguments = {
  'build-continue-after-restart': {}, 'build-continue-after-network': {},
  'choose-continue-let-ai-fix-once-more-tell': {}, 'choose-continue-let-ai-try-again-if-keeps': {},
  'choose-continue-let-ai-design-again-describe-what': {},
} as const;

type Argument = 'text' | 'count' | 'positive' | 'repair';
type Words = Readonly<Record<string, Readonly<Record<string, Argument>>>>;
type Values = Readonly<Record<string, string | number>>;
const reference = (key: string, values?: Values): StudioTextRef => ({ key, ...(values ? { args: textArgs(values) } : {}) });

export const studioStep = (key: keyof typeof stepArguments, values?: Values): StudioTextRef => reference(STEP + key, values);

function validReference(value: unknown, prefix: string, words: Words): boolean {
  const ref = tryOwnedTextRef(value, BUILDER_PLUGIN_ID);
  if (!ref || !('key' in ref) || ref.owner !== BUILDER_PLUGIN_ID || ref.fallback !== undefined || !ref.key.startsWith(prefix)) return false;
  const key = ref.key.slice(prefix.length);
  if (!Object.hasOwn(words, key)) return false;
  const expected = words[key]!, args = ref.args ?? [];
  return args.length === Object.keys(expected).length && args.every(arg => {
    const kind = Object.hasOwn(expected, arg.name) ? expected[arg.name] : undefined;
    if (kind === 'text') return arg.kind === 'text';
    if (kind === undefined || arg.kind !== 'number' || arg.style !== undefined || !Number.isSafeInteger(arg.number)) return false;
    return arg.number >= (kind === 'count' ? 0 : 1) && (kind !== 'repair' || arg.number <= 3);
  });
}

export const isStudioStepLabel = (value: unknown): boolean => typeof value === 'string' || validReference(value, STEP, stepArguments);

export function isStudioBuildFailure(value: unknown): boolean {
  if (value === null || typeof value === 'string') return true;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).every(key => key === 'title' || key === 'guidance' || key === 'detail') && typeof row.detail === 'string'
    && validReference(row.title, STUDIO, titleArguments) && (!Object.hasOwn(row, 'guidance') || validReference(row.guidance, STUDIO, guidanceArguments));
}

type FailureOptions = { readonly values?: Values; readonly guidance?: keyof typeof guidanceArguments };
const failure = Symbol('studio-build-failure');

export function studioBuildFailure(key: keyof typeof titleArguments, detail: string, { values, guidance }: FailureOptions = {}): StudioBuildFailure {
  return { title: reference(STUDIO + key, values), detail, ...(guidance ? { guidance: reference(STUDIO + guidance) } : {}) };
}

/** Attach a fixed recovery explanation at the branch that knows the cause, keeping the original error for callers. */
export function failStudioBuild(key: keyof typeof titleArguments, cause: unknown, options?: FailureOptions): Error {
  const error = cause instanceof Error ? cause : new Error(String(cause));
  return Object.assign(error, { [failure]: studioBuildFailure(key, error.message, options) });
}

/** The Host's target catalog has already refused this exact capability. */
export function studioScopeCapabilityUnavailable(capability: string): Error {
  const diagnostic = '目标范围没有开放给插件的能力：' + capability;
  return capability.length <= TEXT_REF_LIMITS.arg_text
    ? failStudioBuild('build-target-capability-unavailable', diagnostic, { values: { capability } })
    : failStudioBuild('build-target-checks-failed', diagnostic);
}

export function studioBuildFailureOf(error: unknown): StudioBuildFailure | string {
  if (!(error instanceof Error)) return String(error);
  return (error as Error & { [failure]?: StudioBuildFailure })[failure] ?? error.message;
}

/** Diagnostic tools read the same original as the Studio's technical details. */
export function studioBuildDiagnostic(error: StudioBuildFailure | string | null): string | null {
  return typeof error === 'object' && error !== null ? error.detail : error;
}

export function studioAcceptanceFailure(result: NonNullable<AgentBuild['browserResult']>, tests: AgentDesign['acceptance']): Error {
  if (result.blocked) return failStudioBuild('build-acceptance-blocked', result.blocked);
  const failed = result.cases.find(item => !item.passed), name = tests.find(test => test.id === failed?.id)?.description;
  const detail = failed?.detail ?? '';
  const guidance = 'choose-continue-let-ai-fix-once-more-tell';
  return name && name.length <= TEXT_REF_LIMITS.arg_text
    ? failStudioBuild('name-did-not-work-expected-trial', detail, { values: { name }, guidance })
    : failStudioBuild('build-acceptance-failed', name ? name + '\n' + detail : detail, { guidance });
}

/** Keep the affected operations' names as data, even when the complete list is too long for a reference argument. */
export function studioRevisionStep(before: AgentDesign, after: AgentDesign, reworked: readonly string[], visual: boolean) {
  const ops = (design: AgentDesign) => new Map(design.contract.operations.map(item => [item.id, item]));
  const a = ops(before), b = ops(after);
  const added = [...b.keys()].filter(key => !a.has(key)), removed = [...a.keys()].filter(key => !b.has(key));
  const changed = [...b.keys()].filter(key => a.has(key) && JSON.stringify(a.get(key)) !== JSON.stringify(b.get(key)));
  const parts = (design: AgentDesign) => new Map(design.parts.map(item => [item.id, JSON.stringify(item)]));
  const p = parts(before), q = parts(after);
  const partChanges = [...q.keys()].filter(key => p.get(key) !== q.get(key)).length + [...p.keys()].filter(key => !q.has(key)).length;
  const label = visual ? studioStep('display-revised') : added.length || removed.length || changed.length || partChanges || reworked.length
    ? studioStep('design-revised', { added: added.length, removed: removed.length, changed: changed.length, parts: partChanges, reworked: reworked.length })
    : studioStep('design-copy-revised');
  const detail = [added, removed, changed, reworked].flatMap((group, i) => group.map(id =>
    ['+', '−', '↻', '↳'][i] + ' ' + (b.get(id)?.description || a.get(id)?.description || id))).join('\n');
  return { label, detail };
}
