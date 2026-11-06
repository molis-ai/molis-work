import { readFileSync } from 'node:fs';

/** Built from the type-checked browser entry, before the workbench client is assembled. */
export const PERSONAL_ACCOUNT_CLIENT_SCRIPT = readFileSync(new URL('../../dist/scripts/personal-account-client.js', import.meta.url), 'utf8');
