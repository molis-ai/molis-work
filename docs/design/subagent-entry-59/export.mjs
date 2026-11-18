// Prototype only: current Coding cards/results and the shipped B58 conversation, never a product asset route.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import * as ds from '@molis-ai/molis-work-design-system';
import { CODING_STYLES } from '@molis-ai/molis-work-plugin-coding';
import { TASK_FLOAT_STYLES } from '../../../apps/workbench/dist/styles/task-float.js';
const here=dirname(fileURLToPath(import.meta.url));await mkdir(join(here,'dist'),{recursive:true});
await writeFile(join(here,'dist/parts.css'),[`:root{--font:${ds.FONT_STACK};--font-mono:${ds.MONO_FONT_STACK}}`,CODING_STYLES,ds.SUBTASK_CONVERSATION_STYLES,ds.COMPOSER_STYLES,TASK_FLOAT_STYLES].join('\n'));
await writeFile(join(here,'dist/primitives.js'),ds.COMPOSER_CLIENT_SCRIPT+'\n'+ds.SCROLL_FOLLOW_CLIENT_SCRIPT);
await build({entryPoints:[join(here,'app.js')],outfile:join(here,'dist/app.js'),bundle:true,format:'iife',platform:'browser',charset:'utf8'});
