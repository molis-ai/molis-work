// Preview-only bundle of the current component board parts; never builds the Host or native helper.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
await build({
  stdin: { contents: `
    import { renderComposer } from './packages/plugin-sdk/src/ui/composer.ts';
    import { COMPOSER_STYLES, composerRestRules, composerRestTouch } from './packages/design-system/src/composer-styles.ts';
    window.voicePreviewParts = { renderComposer, COMPOSER_STYLES, composerRestRules, composerRestTouch };
  `, loader: 'ts', resolveDir: root },
  bundle: true, platform: 'browser', format: 'iife', minify: true,
  alias: {
    '@molis-ai/molis-work-plugin-sdk/ui': path.join(root, 'packages/plugin-sdk/src/ui.ts'),
    '@molis-ai/molis-work-contracts/platform/ui': path.join(root, 'packages/contracts/src/platform/ui.ts'),
  },
  outfile: path.join(here, 'components.js'),
});
