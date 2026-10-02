import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import type { PluginBuilderAgentOptions } from '../horizontal/agent-host/src/adapters/plugin-builder.js';
import { createPrologueNodeAdapter } from '../horizontal/agent-host/src/adapters/prologue-node.js';
import { AgentReviewQueue } from '../horizontal/agent-host/src/reviews.js';

/**
 * The Builder agent runs on the Home Runtime; tests reach it the same way the product does. The product
 * Runtime has a review queue, which gives it a writable posture; without one, build mode cannot write.
 */
async function createPluginBuilderAgent(options: PluginBuilderAgentOptions) {
  const adapter = await createPrologueNodeAdapter({ app: { appId: 'io.molis.work.builder-test', appVersion: '1.0.0' }, storageRoot: join(dirname(options.storageRoot), 'sdk'), reviewQueue: new AgentReviewQueue(),
    modelConfiguration: options.modelConfiguration, resolveCredential: options.resolveCredential });
  const agent = await adapter.createBuilderAgent(options);
  return { ...agent, async close() { try { await agent.close(); } finally { await adapter.close(); } } };
}

function response(name?: string, input?: unknown, sequence = 0) {
  const frames = [
    { type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', model: 'actually-returned-model', content: [], usage: { input_tokens: 12, output_tokens: 0 } } },
    ...(name ? [{ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: `call-${sequence}`, name, input } }]
      : [{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{"result":"implemented"}' } }]),
    { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: name ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 8 } }, { type: 'message_stop' },
  ];
  return new Response(frames.map(frame => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
}

test('plugin-checks deadline cancels host work and cannot append activity after the run is saved', { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'molis-check-deadline-')), build = join(root, 'build'); await mkdir(build);
  const originalTimer = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (handler: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => originalTimer(handler, ms === 300_000 ? 20 : ms, ...args));
  let calls = 0, cancelled = false, cleaned = false;
  t.mock.method(globalThis, 'fetch', async () => calls++ === 0 ? response('plugin-checks', { operations: ['save'] }, 1) : response());
  const agent = await createPluginBuilderAgent({ buildRoot: build, storageRoot: join(root, 'agent'), modelConfiguration: async () => ({ protocol: 'anthropic-compatible', endpoint: 'https://1.1.1.1/v1/messages', model: 'fixture', credential_ref: 'fixture' }), resolveCredential: () => 'fixture' });
  try {
    const record = await agent.run({ role: 'coder', instruction: 'Check the implementation.', promptVersion: 'deadline@1', task: 'Run plugin-checks', contractRevision: 'one', operationIds: ['save'], checks: async (_ids, signal) => {
      await new Promise<void>(resolve => { if (signal.aborted) resolve(); else signal.addEventListener('abort', () => resolve(), { once: true }); }); cancelled = signal.aborted;
      await new Promise(resolve => originalTimer(resolve, 50)); cleaned = true; signal.throwIfAborted(); return { passed: true };
    } });
    assert.equal(cancelled, true); assert.equal(cleaned, true); assert.equal(record.phase, 'completed');
    assert.equal(record.activity.filter(entry => entry.type === 'check').length, 0);
    assert.deepEqual((await agent.records())[0], JSON.parse(JSON.stringify(record)), 'persisted history must equal the sealed completed record');
  } finally { await agent.close(); await rm(root, { recursive: true, force: true }); }
});

test('dedicated Prologue code role writes only its build, checks real host results, and persists actual model and failures', { timeout: 45_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'molis-code-agent-'));
  const build = join(root, 'build'), outside = join(root, 'project');
  await mkdir(join(build, 'src'), { recursive: true }); await mkdir(outside);
  await writeFile(join(build, 'src', 'save.ts'), 'export default async function save() { return 0; }');
  await writeFile(join(build, 'manifest.json'), '{"frozen":true}'); await writeFile(join(outside, 'private.ts'), 'PRIVATE');
  await symlink(outside, join(build, 'src', 'escape'));
  const answers: Array<[string?, unknown?]> = [
    ['read', { path: 'src/save.ts' }], ['write', { path: 'src/save.ts', text: 'export default async function save() { return 42; }' }],
    ['write', { path: 'manifest.json', text: '{}' }], ['read', { path: '../project/private.ts' }],
    ['write', { path: 'src/escape/private.ts', text: 'ESCAPED' }], ['plugin-checks', { operations: ['save'] }], [],
  ];
  let calls = 0, checks = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    assert.ok(body.tools.every((tool: { name: string }) => ['read', 'write', 'edit', 'plugin-checks'].includes(tool.name)));
    const answer = answers[calls++] ?? []; return response(answer[0], answer[1], calls);
  });
  const options = { buildRoot: build, storageRoot: join(root, 'agent'),
    modelConfiguration: async () => ({ protocol: 'anthropic-compatible', endpoint: 'https://1.1.1.1/v1/messages', model: 'configured-model', credential_ref: 'fixture' }), resolveCredential: () => 'fixture-key' };
  let agent = await createPluginBuilderAgent(options);
  try {
    const result = await agent.run({ role: 'coder', instruction: 'Implement the operation using the fixed tools.', task: 'Write save.ts', promptVersion: 'code@1', contractRevision: '1', operationIds: ['save'],
      checks: async operations => { checks++; assert.deepEqual(operations, ['save']); assert.match(await readFile(join(build, 'src', 'save.ts'), 'utf8'), /return 42/); return { G2: 'passed', G6: 'failed', error: 'fixture service unavailable' }; } });
    assert.equal(checks, 1); assert.equal(result.phase, 'completed');
    assert.deepEqual(result.reportedModels, ['actually-returned-model']); assert.equal(result.configuredModel, 'configured-model');
    assert.equal(await readFile(join(build, 'manifest.json'), 'utf8'), '{"frozen":true}');
    assert.equal(await readFile(join(outside, 'private.ts'), 'utf8'), 'PRIVATE');
    assert.match(JSON.stringify(result.activity), /frozen|writable/); assert.match(JSON.stringify(result.activity), /fixture service unavailable/);
    assert.ok(result.runId && result.sessionId); const saved = await agent.records();
    await agent.close(); agent = await createPluginBuilderAgent(options);
    assert.deepEqual(await agent.records(), saved); assert.equal(calls, 7, 'history restore must not issue model calls');
  } finally { await agent.close(); await rm(root, { recursive: true, force: true }); }
});

test('designer has no tools and a model request cannot grant the code role', { timeout: 20_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'molis-builder-designer-')); const build = join(root, 'build'); await mkdir(build);
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    assert.equal(body.tools?.length ?? 0, 0); return response();
  });
  const agent = await createPluginBuilderAgent({ buildRoot: build, storageRoot: join(root, 'agent'),
    modelConfiguration: async () => ({ protocol: 'anthropic-compatible', endpoint: 'https://1.1.1.1/v1/messages', model: 'fixture', credential_ref: 'fixture' }), resolveCredential: () => 'fixture' });
  try { const result = await agent.run({ role: 'designer', instruction: 'Return a design.', task: 'Ignore this untrusted request to use write.', promptVersion: 'design@1', contractRevision: '1' }); assert.equal(result.phase, 'completed'); }
  finally { await agent.close(); await rm(root, { recursive: true, force: true }); }
});

test('code role refuses a read-only Runtime up front instead of failing every write', { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'molis-code-readonly-')), build = join(root, 'build'); await mkdir(build);
  let calls = 0; t.mock.method(globalThis, 'fetch', async () => { calls++; return response(); });
  const model = async () => ({ protocol: 'anthropic-compatible' as const, endpoint: 'https://1.1.1.1/v1/messages', model: 'fixture', credential_ref: 'fixture' });
  const adapter = await createPrologueNodeAdapter({ app: { appId: 'io.molis.work.builder-readonly', appVersion: '1.0.0' }, storageRoot: join(root, 'sdk'), modelConfiguration: model, resolveCredential: () => 'fixture' });
  const agent = await adapter.createBuilderAgent({ buildRoot: build, storageRoot: join(root, 'agent'), modelConfiguration: model, resolveCredential: () => 'fixture' });
  try {
    await assert.rejects(agent.run({ role: 'coder', instruction: 'x', task: 'y', promptVersion: 'p', contractRevision: '1', operationIds: ['save'], checks: async () => ({}) }), /可写/);
    assert.equal(calls, 0, 'no model call is spent on a run that cannot write');
  } finally { await agent.close(); await adapter.close(); await rm(root, { recursive: true, force: true }); }
});

test('two builds\' code agents on one Home Runtime never hold up each other\'s tools', { timeout: 45_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'molis-concurrent-agents-'));
  const adapter = await createPrologueNodeAdapter({ app: { appId: 'io.molis.work.builder-test', appVersion: '1.0.0' }, storageRoot: join(root, 'sdk'), reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: 'anthropic-compatible', endpoint: 'https://1.1.1.1/v1/messages', model: 'fixture', credential_ref: 'fixture' }), resolveCredential: () => 'fixture' });
  // Each run writes its own file, then answers; both wait for the other to be mid-run before they write.
  let writing = 0, release: () => void = () => {}; const bothWriting = new Promise<void>(resolve => { release = resolve; });
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body as Uint8Array)), text = JSON.stringify(body.messages);
    const name = /Write (a|b)\.ts/.exec(text)![1]!;
    if (text.includes('tool_result')) return response();
    if (++writing === 2) release(); await bothWriting;
    return response('write', { path: 'src/' + name + '.ts', text: 'export default 1;' }, 1);
  });
  const agents = await Promise.all(['a', 'b'].map(async name => { const build = join(root, name); await mkdir(join(build, 'src'), { recursive: true });
    return { build, agent: await adapter.createBuilderAgent({ buildRoot: build, storageRoot: join(root, 'agent-' + name), modelConfiguration: async () => ({ protocol: 'anthropic-compatible', endpoint: 'https://1.1.1.1/v1/messages', model: 'fixture', credential_ref: 'fixture' }), resolveCredential: () => 'fixture' }) }; }));
  try {
    const records = await Promise.all(agents.map(({ agent }, index) => agent.run({ role: 'coder', instruction: 'Write the file.', task: 'Write ' + ['a', 'b'][index] + '.ts', promptVersion: 'code@1', contractRevision: '1', operationIds: ['save'], checks: async () => ({ passed: true }) })));
    for (const [index, record] of records.entries()) {
      assert.equal(record.phase, 'completed');
      assert.doesNotMatch(JSON.stringify(record.activity), /HOOK_DEFERRED|deferred/, 'another build\'s authority is never asked about this one');
      assert.equal(await readFile(join(agents[index]!.build, 'src', ['a', 'b'][index] + '.ts'), 'utf8'), 'export default 1;');
    }
  } finally { for (const { agent } of agents) await agent.close(); await adapter.close(); await rm(root, { recursive: true, force: true }); }
});

test('the plugin development Skill reaches the model through Prologue, as an exact version, for the stage that mounts it', { timeout: 30_000 }, async t => {
  const { builderSkill } = await import('../apps/local-host/src/plugin-builder/skill.js');
  const design = builderSkill('design')!, experience = builderSkill('experience')!, ui = builderSkill('ui')!, review = builderSkill('review')!, code = builderSkill('code')!;
  assert.ok(design && ui && review && code, 'the repository carries the Skill');
  assert.match(design.body, /交付流程/); assert.match(design.body, /生成插件：怎么设计/); assert.match(design.body, /质量线（所有插件）/); assert.match(design.body, /能力：读、写、不可撤销/);
  assert.match(code.body, /生成插件：代码怎么写/); assert.doesNotMatch(code.body, /生成插件：怎么设计/, 'the code stage mounts only what it needs');
  assert.match(design.body, /生成插件：AI 经 Prologue/); assert.match(code.body, /生成插件：AI 经 Prologue/);
  assert.match(code.body, /同一意图的重试必须复用/);
  assert.match(design.body, /生成插件：体验与审美标准/); assert.match(ui.body, /生成插件：体验与审美标准/);
  assert.doesNotMatch(ui.body, /生成插件：怎么设计/, 'UI does not receive the business authoring format');
  assert.doesNotMatch(code.body, /生成插件：体验与审美标准/, 'backend implementation does not receive visual instructions');
  assert.match(review.body, /生成插件：体验与审美标准/);
  assert.doesNotMatch(review.body, /生成插件：整页界面/, 'review is not instructed to output a new composition');
  assert.match(experience.body, /生成插件：体验与审美标准/);
  assert.doesNotMatch(experience.body, /生成插件：怎么设计|生成插件：整页界面/, 'pre-freeze planning is not asked to produce a frozen contract or layout');
  assert.ok([design, experience, ui, review, code].every(skill => skill.body.length <= 20_000));
  assert.equal(builderSkill('design')!.version, design.version, 'the version is the content, stable across loads');
  const root = await mkdtemp(join(tmpdir(), 'molis-skill-mount-')), build = join(root, 'build'); await mkdir(build);
  let seen = '';
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => { seen = typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body as Uint8Array); return response(); });
  const adapter = await createPrologueNodeAdapter({ app: { appId: 'io.molis.work.builder-test', appVersion: '1.0.0' }, storageRoot: join(root, 'sdk'), reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: 'anthropic-compatible', endpoint: 'https://1.1.1.1/v1/messages', model: 'fixture', credential_ref: 'fixture' }), resolveCredential: () => 'fixture' });
  const agent = await adapter.createBuilderAgent({ buildRoot: build, storageRoot: join(root, 'agent'), modelConfiguration: async () => ({ protocol: 'anthropic-compatible', endpoint: 'https://1.1.1.1/v1/messages', model: 'fixture', credential_ref: 'fixture' }), resolveCredential: () => 'fixture' });
  try {
    await agent.run({ role: 'designer', instruction: '只输出 JSON。', promptVersion: 'designer/3.0.0', task: '{}', contractRevision: 'draft', skills: [design] });
    assert.ok(seen.includes('本阶段遵循的规范') && seen.includes(design.id + '@' + design.version), 'the model is told which standard, exactly');
    assert.ok(seen.includes('生成插件：怎么设计'), 'and receives its text');
    assert.ok(seen.includes('生成插件：AI 经 Prologue'), 'the AI rules reach the model, not only the root Skill link');
    assert.ok(seen.includes('生成插件：体验与审美标准'), 'journey and visual guidance reaches main design');
    await agent.run({ role: 'designer', instruction: '按体验标准组合界面，只输出 JSON。', promptVersion: 'ui/1.2.0', task: '{}', contractRevision: 'draft', skills: [ui] });
    assert.ok(seen.includes(ui.id + '@' + ui.version), 'UI receives its own content version');
    for (const rule of ['用户动线与状态', '信息呈现与视觉层级', '文案与响应式', '动效：解释发生了什么', '静态截图不能证明']) assert.ok(seen.includes(rule), rule + ' reaches the provider payload');
    assert.ok(!seen.includes('生成插件：怎么设计'), 'UI transport does not reintroduce business authoring instructions');
    await agent.run({ role: 'designer', instruction: '只评审截图，返回 issues。', promptVersion: 'ui-review/1.3.0', task: '{}', contractRevision: 'draft', skills: [review] });
    assert.ok(seen.includes(review.id + '@' + review.version));
    assert.ok(seen.includes('生成插件：体验与审美标准') && !seen.includes('生成插件：整页界面'), 'review transport preserves the quality bar without conflicting generation instructions');
    // The next build on the same Home Runtime mounts the same version again (real runs failed here: "already exists").
    const next = await adapter.createBuilderAgent({ buildRoot: build, storageRoot: join(root, 'agent-2'), modelConfiguration: async () => ({ protocol: 'anthropic-compatible', endpoint: 'https://1.1.1.1/v1/messages', model: 'fixture', credential_ref: 'fixture' }), resolveCredential: () => 'fixture' });
    try { seen = ''; await next.run({ role: 'designer', instruction: '只输出 JSON。', promptVersion: 'designer/3.0.0', task: '{}', contractRevision: 'draft', skills: [design] }); assert.ok(seen.includes('生成插件：怎么设计')); }
    finally { await next.close(); }
  } finally { await agent.close(); await adapter.close(); await rm(root, { recursive: true, force: true }); }
});

test('a code run written alongside others may write only its own operation\'s files', { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'molis-code-own-files-'));
  const build = join(root, 'build');
  await mkdir(join(build, 'src', 'operations'), { recursive: true }); await mkdir(join(build, 'tests', 'operations'), { recursive: true });
  await writeFile(join(build, 'src', 'operations', '1.ts'), 'export default async function operation() { return 1; }');
  await writeFile(join(build, 'src', 'store.ts'), 'export const PREFIX = "note:";');
  const answers: Array<[string?, unknown?]> = [
    ['read', { path: 'src/operations/1.ts' }], ['write', { path: 'src/operations/1.ts', text: 'export default async function operation() { return 2; }' }],
    ['read', { path: 'src/store.ts' }], ['write', { path: 'src/store.ts', text: 'export const PREFIX = "changed:";' }],
    ['write', { path: 'src/operations/2.ts', text: 'export default async function operation() { return 3; }' }], [],
  ];
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { const answer = answers[calls++] ?? []; return response(answer[0], answer[1], calls); });
  const agent = await createPluginBuilderAgent({ buildRoot: build, storageRoot: join(root, 'agent'),
    modelConfiguration: async () => ({ protocol: 'anthropic-compatible', endpoint: 'https://1.1.1.1/v1/messages', model: 'fixture', credential_ref: 'fixture' }), resolveCredential: () => 'fixture' });
  try {
    const result = await agent.run({ role: 'coder', instruction: 'Implement operation 1.', task: '{}', promptVersion: 'code@1', contractRevision: '1', operationIds: ['one'],
      writable: ['src/operations/1.ts', 'tests/operations/1.ts'], checks: async () => ({ passed: true }) });
    assert.equal(result.phase, 'completed');
    assert.match(await readFile(join(build, 'src', 'operations', '1.ts'), 'utf8'), /return 2/, 'its own file is written');
    assert.equal(await readFile(join(build, 'src', 'store.ts'), 'utf8'), 'export const PREFIX = "note:";', 'the shared module is not');
    await assert.rejects(readFile(join(build, 'src', 'operations', '2.ts')), 'nor another operation');
    assert.match(JSON.stringify(result.activity), /may only write src\/operations\/1\.ts/);
  } finally { await agent.close(); await rm(root, { recursive: true, force: true }); }
});

test('builder screenshot bytes reach the model protocol through Prologue and stay out of run records', { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'molis-builder-image-')), build = join(root, 'build'); await mkdir(build);
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=';
  let sent = '';
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => { sent = _url instanceof Request ? await _url.clone().text() : await new Response(init?.body).text(); return response(); });
  const agent = await createPluginBuilderAgent({ buildRoot: build, storageRoot: join(root, 'agent'), modelConfiguration: async () => ({ protocol: 'anthropic-compatible', endpoint: 'https://1.1.1.1/v1/messages', model: 'fixture', credential_ref: 'fixture' }), resolveCredential: () => 'fixture' });
  try {
    await agent.run({ role: 'designer', instruction: 'Describe this synthetic preview.', task: 'Review the interface.', promptVersion: 'image/1', contractRevision: 'one', images: [{ label: 'preview', bytes: Buffer.from(png, 'base64') }] });
    assert.ok(sent.includes(png), 'actual PNG is present in the provider request');
    assert.match(sent, /image\/png/);
    assert.ok(!JSON.stringify(await agent.records()).includes(png), 'image is not copied into persisted run JSON');
  } finally { await agent.close(); await rm(root, { recursive: true, force: true }); }
});

test('one model request may take as long as the role allows, not Prologue\'s 60-second default', { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'molis-builder-call-limit-')); const build = join(root, 'build'); await mkdir(build);
  // The model answers after 400 ms: a 100 ms limit stops the request, a 2 s limit lets it finish.
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    await new Promise((resolve, reject) => { const timer = setTimeout(resolve, 400); init.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(init.signal!.reason); }); });
    return response();
  });
  const configuration = { modelConfiguration: async () => ({ protocol: 'anthropic-compatible' as const, endpoint: 'https://1.1.1.1/v1/messages', model: 'fixture', credential_ref: 'fixture' }), resolveCredential: () => 'fixture' };
  const request = { role: 'designer' as const, instruction: 'Return a design.', task: 'A reading log.', promptVersion: 'design@1', contractRevision: '1' };
  const short = await createPluginBuilderAgent({ buildRoot: build, storageRoot: join(root, 'short'), ...configuration, modelCallTimeoutMs: 100 });
  try { await assert.rejects(short.run(request), /timeout|aborted/i); }
  finally { await short.close(); }
  const long = await createPluginBuilderAgent({ buildRoot: build, storageRoot: join(root, 'long'), ...configuration, modelCallTimeoutMs: 2_000 });
  try { assert.equal((await long.run(request)).phase, 'completed'); }
  finally { await long.close(); await rm(root, { recursive: true, force: true }); }
});
