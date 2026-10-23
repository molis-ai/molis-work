import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The SandboxSdk declaration closure. Keep the contracts' relative paths so their type imports resolve inside the build snapshot.
const CONTRACT_DECLARATIONS = [
  'platform/plugin-sandbox.d.ts',
  'platform/plugin-interaction.d.ts',
  'services/agent-interaction.d.ts',
  'services/assistant-cards.d.ts',
  'platform/action-result.d.ts',
] as const;
const SDK_ENTRY = `export * from './contracts/platform/plugin-sandbox.js';
import type { SandboxJson, SandboxSdk } from './contracts/platform/plugin-sandbox.js';
export interface SandboxTestAssert {
  same(actual: SandboxJson, expected: SandboxJson): void;
  includes(actual: SandboxJson, expected: SandboxJson): void;
  rejectsCode(call: () => Promise<unknown>, code: string): Promise<void>;
}
export type SandboxTest = (sdk: SandboxSdk, call: (input: SandboxJson) => Promise<SandboxJson>, assert: SandboxTestAssert) => Promise<void>;
`;

/** One host-owned set for project creation, G1 authority checks and the isolated compiler's snapshot. */
export async function sdkDeclarations(): Promise<ReadonlyMap<string, string>> {
  const location = fileURLToPath(import.meta.resolve('@molis-ai/molis-work-contracts/platform/plugin-sandbox'));
  const root = dirname(dirname(location));
  const declarations = new Map<string, string>([['developer/sdk.d.ts', SDK_ENTRY]]);
  for (const path of CONTRACT_DECLARATIONS) {
    const declaration = await readFile(join(root, path), 'utf8');
    if (path === 'platform/plugin-sandbox.d.ts' && !declaration.includes('interface SandboxSdk')) throw new Error('Packaged SandboxSdk declaration is unavailable; build contracts first');
    declarations.set(`developer/contracts/${path}`, declaration.replace(/^\/\/# sourceMappingURL=.*$/m, ''));
  }
  return declarations;
}
