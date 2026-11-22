import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {executeLocalProjectsCopy,handleProjectRecycleHttp,listCopyableLocalProjects,previewLocalProjectsCopy,ProjectDeletionService,type LocalProjectsCopyContext} from '@molis-ai/molis-work-app-local-host';

test('PCSYNC-OPT-15 foundation: copies project structure offline, rejects account changes, and replays without touching source files', async t => {
  const root = mkdtempSync(join(tmpdir(), 'molis-opt15-copy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const localHome = join(root, 'local'), personalHome = join(root, 'personal');
  ensureStorageSpace(localHome);
  const personal = personalStorageSpace('https://auth.example.test', 'work', 'alice');
  ensureStorageSpace(personalHome, personal);

  const p1 = await withMolisWorkProjectCatalog({ homeDirectory: localHome }, c => c.createProject({ display_name: '本地项目一', actor_id: 'local-user' }));
  const p2 = await withMolisWorkProjectCatalog({ homeDirectory: localHome }, c => c.createProject({ display_name: '本地项目二', actor_id: 'local-user' }));
  const p3 = await withMolisWorkProjectCatalog({ homeDirectory: localHome }, c => c.createProject({ display_name: '未选项目三', actor_id: 'local-user' }));
  const sourceSnapshot1 = readFileSync(p1.database_path);
  const sourceSnapshot2 = readFileSync(p2.database_path);

  let active = true;
  const ctx = {
    sourceHome: localHome,
    targetHome: personalHome,
    targetSpaceId: personal.spaceId,
    actorId: 'alice',
    sourceWithCatalog: withMolisWorkProjectCatalog,
    targetWithCatalog: withMolisWorkProjectCatalog,
    authorize() { if (!active) throw new Error('ACCOUNT_SWITCHED'); },
  };

  const listed = await listCopyableLocalProjects(localHome, withMolisWorkProjectCatalog, ctx.authorize);
  assert.deepEqual(listed.map(p => p.project_id).sort(), [p1.project_id, p2.project_id, p3.project_id].sort());

  const preview = await previewLocalProjectsCopy(ctx, [p1.project_id, p2.project_id]);
  assert.equal(preview.targetSpaceId, personal.spaceId);
  assert.equal(preview.projects.length, 2);
  assert.equal(preview.preview.assetCount, 2);
  assert.ok(preview.preview.savedBytes > 0);
  assert.deepEqual(preview.preview.blockers, []);

  // Account switch rejects stale copy execution before touching target
  active = false;
  await assert.rejects(() => executeLocalProjectsCopy(ctx, { projectIds: [p1.project_id, p2.project_id], fingerprint: preview.preview.fingerprint, operationId: 'op-copy-1' }), /ACCOUNT_SWITCHED/);
  active = true;

  // Execute offline (no network/sync service needed)
  const first = await executeLocalProjectsCopy(ctx, { projectIds: [p1.project_id, p2.project_id], fingerprint: preview.preview.fingerprint, operationId: 'op-copy-1' });
  assert.equal(first.status, 'local_ready_pending_sync');
  assert.equal(first.receipt.state, 'complete');
  assert.equal(first.receipt.plan.projects.length, 2);
  for (const mapping of first.receipt.plan.projects) {
    assert.notEqual(mapping.targetId, mapping.sourceId, 'copied projects receive independent target identities');
  }

  // Idempotent retry with same operationId returns exact same receipt without duplicating projects
  const replay = await executeLocalProjectsCopy(ctx, { projectIds: [p1.project_id, p2.project_id], fingerprint: preview.preview.fingerprint, operationId: 'op-copy-1' });
  assert.deepEqual(replay.receipt.plan.projects, first.receipt.plan.projects);

  await withMolisWorkProjectCatalog({ homeDirectory: personalHome }, c => {
    const targetProjects = c.listProjects().filter(p => p.project_id !== 'personal');
    assert.equal(targetProjects.length, 2, 'only the two selected projects were published; retry created no duplicates');
    assert.deepEqual(targetProjects.map(p => p.display_name).sort(), ['本地项目一', '本地项目二']);
  });

  // Original local projects and their database bytes remain untouched
  assert.deepEqual(readFileSync(p1.database_path), sourceSnapshot1);
  assert.deepEqual(readFileSync(p2.database_path), sourceSnapshot2);
});

test('PCSYNC-OPT-15 S-122: atomic hidden staging never exposes partial copies, reconciles exact plugin list, and recovers on retry', async t => {
  const root = mkdtempSync(join(tmpdir(), 'molis-opt15-atomic-stage-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const localHome = join(root, 'local');
  const personalHome = join(root, 'personal');
  ensureStorageSpace(localHome);
  const personal = personalStorageSpace('https://auth.example.test', 'work', 'alice');
  ensureStorageSpace(personalHome, personal);

  // Create a local project, remove the default-enabled plugin (`schedule`), and add an optional plugin (`goals`).
  const sourceProject = await withMolisWorkProjectCatalog({ homeDirectory: localHome }, async c => {
    const p = await c.createProject({ display_name: '精确插件清单项目', actor_id: 'local-user' });
    c.removeProjectPlugin({ project_id: p.project_id, plugin_id: 'schedule', actor_id: 'local-user' });
    c.addProjectPlugin({ project_id: p.project_id, plugin_id: 'goals', actor_id: 'local-user' });
    return p;
  });
  const expectedPlugins = await withMolisWorkProjectCatalog({ homeDirectory: localHome }, c => c.listProjectPlugins(sourceProject.project_id));
  assert.equal(expectedPlugins.includes('schedule'), false);
  assert.equal(expectedPlugins.includes('goals'), true);

  let failOnce = true;
  const ctx: LocalProjectsCopyContext = {
    sourceHome: localHome,
    targetHome: personalHome,
    targetSpaceId: personal.spaceId,
    actorId: 'alice',
    sourceWithCatalog: withMolisWorkProjectCatalog,
    targetWithCatalog: withMolisWorkProjectCatalog,
    async extraSources() {
      const owner = {
        kinds: Object.freeze(['test.extra:item']),
        read: () => null,
        snapshot: (projectId: string) => [{ key: JSON.stringify([projectId, 'item']), value: { ok: true } }],
        references: () => [],
        fork: (asset: { key: string; value: unknown }, identity: { targetProjectId: string | null }) => ({ key: JSON.stringify([identity.targetProjectId, 'item']), value: asset.value }),
        apply() {
          if (failOnce) {
            failOnce = false;
            throw new Error('INTERRUPTED_DURING_STAGE');
          }
        },
      };
      return { sources: [{ ownerId: 'test.extra', owner }], close() {} };
    },
    extraTarget(ownerId: string) {
      if (ownerId !== 'test.extra') return null;
      return {
        owner: {
          kinds: Object.freeze(['test.extra:item']),
          read: () => null,
          snapshot: () => [],
          references: () => [],
          fork: (asset: { key: string; value: unknown }) => asset,
          apply() {
            if (failOnce) {
              failOnce = false;
              throw new Error('INTERRUPTED_DURING_STAGE');
            }
          },
        },
        close() {},
      };
    },
    authorize() {},
  };

  const preview = await previewLocalProjectsCopy(ctx, [sourceProject.project_id]);
  // First attempt fails after staging: staged target project MUST remain hidden (never in listProjects()).
  await assert.rejects(
    () => executeLocalProjectsCopy(ctx, { projectIds: [sourceProject.project_id], fingerprint: preview.preview.fingerprint, operationId: 'op-atomic-stage' }),
    /INTERRUPTED_DURING_STAGE/,
  );
  let stagedTargetId = '';
  let stagedState = '';
  await withMolisWorkProjectCatalog({ homeDirectory: personalHome }, c => {
    const visible = c.listProjects().filter(p => p.project_id !== 'personal');
    assert.equal(visible.length, 0, 'S-122 interrupted copy never exposes a partial project in listProjects()');
    const recycled = c.recycle.list();
    assert.equal(recycled.length, 1, 'staged project stays hidden in recycle state');
    stagedTargetId = recycled[0]!.project_id;
    stagedState = recycled[0]!.state;
  });

  // P2-7: interrupted hidden staged copy must NOT appear in GET /api/settings/projects/recycle
  // and must be rejected on GET/POST /api/settings/projects/:id/recycle and changeRecycled with 409 actions.conflict.
  const recyclePorts = { isPanelAlive: () => false, isProjectBusy: () => false, async releaseProject() {} };
  const recycleServer = createServer((req, res) => {
    void handleProjectRecycleHttp(req, res, new URL(req.url!, 'http://127.0.0.1'), personalHome, withMolisWorkProjectCatalog, recyclePorts)
      .then(handled => { if (!handled) { res.statusCode = 404; res.end(); } });
  });
  await new Promise<void>(resolve => recycleServer.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => recycleServer.close(() => resolve())));
  const recycleOrigin = `http://127.0.0.1:${(recycleServer.address() as { port: number }).port}`;

  const listWhileStaged = await fetch(`${recycleOrigin}/api/settings/projects/recycle`);
  assert.equal(listWhileStaged.status, 200);
  assert.deepEqual((await listWhileStaged.json()).items, [], 'P2-7: recycle bin list omits unfinished staged copy projects');

  const inspectWhileStaged = await fetch(`${recycleOrigin}/api/settings/projects/${encodeURIComponent(stagedTargetId)}/recycle`);
  assert.equal(inspectWhileStaged.status, 409);
  assert.equal((await inspectWhileStaged.json()).code, 'actions.conflict');

  const restoreWhileStaged = await fetch(`${recycleOrigin}/api/settings/projects/${encodeURIComponent(stagedTargetId)}/recycle`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recycled: false, confirmed: true, expected_state: stagedState, operation_id: 'manual-premature-restore' }),
  });
  assert.equal(restoreWhileStaged.status, 409);
  assert.equal((await restoreWhileStaged.json()).code, 'actions.conflict');

  await assert.rejects(
    new ProjectDeletionService(withMolisWorkProjectCatalog, recyclePorts).changeRecycled(personalHome, {
      project_id: stagedTargetId, actor_id: 'alice', operation_id: 'direct-premature-restore', expected_state: stagedState, recycled: false, confirmed: true,
    }, () => {}),
    { code: 'actions.conflict' },
  );

  // Idempotent retry completes, reconciles exact plugin membership, and publishes atomically.
  const finished = await executeLocalProjectsCopy(ctx, { projectIds: [sourceProject.project_id], fingerprint: preview.preview.fingerprint, operationId: 'op-atomic-stage' });
  assert.equal(finished.receipt.state, 'complete');
  await withMolisWorkProjectCatalog({ homeDirectory: personalHome }, c => {
    const visible = c.listProjects().filter(p => p.project_id !== 'personal');
    assert.equal(visible.length, 1);
    const copiedId = visible[0]!.project_id;
    assert.deepEqual(c.listProjectPlugins(copiedId), expectedPlugins, 'copied project matches source plugins exactly without excess defaults');
  });

  // Once published, the copied project is visible in the recycle settings endpoint normally.
  const listAfterPublish = await fetch(`${recycleOrigin}/api/settings/projects/recycle`);
  assert.equal(listAfterPublish.status, 200);
  const afterItems = (await listAfterPublish.json()).items as Array<{ project_id: string; recycled: boolean }>;
  assert.ok(afterItems.some(item => item.project_id === stagedTargetId && item.recycled === false));
});
