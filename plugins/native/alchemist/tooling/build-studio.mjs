import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist/studio/web', { recursive: true, force: true });
await rm('dist/studio/assets', { recursive: true, force: true });
for (const suffix of ['js', 'js.map', 'd.ts', 'd.ts.map']) await rm('dist/studio-document.' + suffix, { force: true });
await mkdir('dist/studio/server/db/migrations', { recursive: true });
await cp('src/studio/server/db/migrations', 'dist/studio/server/db/migrations', { recursive: true });
