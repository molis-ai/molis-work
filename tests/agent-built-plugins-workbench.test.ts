import assert from 'node:assert/strict';
import test from 'node:test';
import { icon } from '@molis-ai/molis-work-design-system';
import { renderPluginRail } from '../apps/workbench/src/immersive-shell.ts';

const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

test('a plugin installed from the studio is a rail entry under 更多 that opens its own stage', () => {
  const html = renderPluginRail({ L: value => value, escapeHtml, icon }, [], '<footer></footer>', '',
    [{ surface: 'app-9de886d4-ee8b-4024-a599-9fbba135933d', label: '随手记 <b>' }]);
  const more = html.slice(html.indexOf('>更多<'), html.indexOf('>拓展<'));
  assert.match(more, /data-work-surface-open="app-9de886d4-ee8b-4024-a599-9fbba135933d"/, 'listed with the other project tools');
  assert.match(more, /<span>随手记 &lt;b&gt;<\/span>/, 'a model-written name is text, never markup');
  assert.doesNotMatch(more, /data-directory-open="app-/, 'it has no directory panel to open');
  assert.doesNotMatch(renderPluginRail({ L: value => value, escapeHtml, icon }, [], ''), /data-work-surface-open="app-/, 'nothing installed, nothing listed');
});
