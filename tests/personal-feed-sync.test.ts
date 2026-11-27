import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { withMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { LocalProjectDatabase, availableProjectPluginIds, molisWorkHostProjectReference } from '@molis-ai/molis-work-app-local-host';
import { AttentionModule } from '@molis-ai/molis-work-module-attention-resumption';
import { createContextLedger } from '@molis-ai/molis-work-module-context-ledger';
import {
  FEED_PLUGIN_ID,
  FeedOutRuleStore,
  feedManifest,
  feedQueryActions,
  feedSourceActions,
} from '@molis-ai/molis-work-plugin-feed';
import { FeedModule, SourcesModule, fromProjectConnection } from '@molis-ai/molis-work-plugin-feed/store';
import {
  createEvidenceContentStore,
  createLazyFileSecretStore,
  runWithMolisWorkHome,
} from '@molis-ai/molis-work-storage';
import { feedLedgerPort, unassignedFeedAttention } from './fixtures/feed-ledger.js';
import { personalSyncFixture } from './fixtures/personal-sync-coordinator.js';
import { runtimePersonalSync } from './fixtures/runtime-personal-sync.js';

test('PERSAF-05 incoming Feed content cannot re-enable an explicitly removed plugin',async t=>{
  const f=personalSyncFixture(t),previous=process.env.MOLIS_WORK_SYNC_LOCAL;process.env.MOLIS_WORK_SYNC_LOCAL='1';
  t.after(()=>{if(previous===undefined)delete process.env.MOLIS_WORK_SYNC_LOCAL;else process.env.MOLIS_WORK_SYNC_LOCAL=previous;});
  t.mock.method(globalThis,'fetch',f.transport);
  const project=await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},async catalog=>{
    const value=await catalog.createProject({display_name:'Explicit choice',actor_id:'alice'});
    catalog.addProjectPlugin({project_id:value.project_id,plugin_id:'feed',actor_id:'alice'});return value;
  });
  const target=await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},async catalog=>{
    const value=await catalog.ensureSyncedProject({project_id:project.project_id,display_name:project.display_name,actor_id:'alice'},()=>{});
    catalog.addProjectPlugin({project_id:project.project_id,plugin_id:'feed',actor_id:'alice'});
    catalog.removeProjectPlugin({project_id:project.project_id,plugin_id:'feed',actor_id:'alice'});return value;
  });
  const writer=new LocalProjectDatabase(project.database_path);let ruleId:string;
  try{ruleId=new FeedOutRuleStore(fromProjectConnection(writer.db)).create(project.project_id,{name:'User choice is retained',match:{contains:'fact'},enabled:false}).rule_id;}finally{writer.close();}
  const a=await runtimePersonalSync(f.homes[0],f.space),b=await runtimePersonalSync(f.homes[1],f.space);f.closeWith(a.close);f.closeWith(b.close);
  const collection=feedManifest.sync!.collections.find(row=>row.id==='capture_rules')!;
  await a.sync.save({...a.sync.policy(),selections:[{plugin_id:feedManifest.plugin_id,publisher_id:feedManifest.publisher.publisher_id,publisher_signature:feedManifest.publisher.signature,collection_id:collection.id,schema_version:collection.schema_version}]});
  await a.sync.run();assert.equal(a.sync.status().error,null);assert.ok(f.events.length>0);
  await b.sync.run();
  await b.withCatalog({homeDirectory:f.homes[1]},catalog=>{
    assert.equal(availableProjectPluginIds(catalog.listProjectPlugins(project.project_id)).has('feed'),false);
  });
  const disabled=new LocalProjectDatabase(target.database_path);
  try{assert.throws(()=>new FeedOutRuleStore(fromProjectConnection(disabled.db)).get(project.project_id,ruleId));}finally{disabled.close();}
  await b.withCatalog({homeDirectory:f.homes[1]},catalog=>catalog.addProjectPlugin({project_id:project.project_id,plugin_id:'feed',actor_id:'alice'}));
  await b.host.closeProject(molisWorkHostProjectReference({databasePath:target.database_path,projectId:project.project_id}));
  await b.openProjects();await b.sync.run();assert.equal(b.sync.status().error,null);
  const received=new LocalProjectDatabase(target.database_path);
  try{assert.equal(new FeedOutRuleStore(fromProjectConnection(received.db)).get(project.project_id,ruleId).name,'User choice is retained');}finally{received.close();}
});

function withBlobTransport(base: typeof fetch): typeof fetch {
  const chunkSize = 4 * 1024 * 1024;
  const blobs = new Map<string, { size: number; ready: boolean; chunks: Map<number, { bytes: Uint8Array; checksum: string }> }>();
  const attachmentsByOp = new Map<string, unknown[]>();
  const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    const method = init?.method ?? 'GET';

    if (url.pathname === '/v1/changes' && method === 'POST') {
      const payload = typeof init?.body === 'string' ? JSON.parse(init.body) as { mutation?: { operationId?: string }; attachments?: unknown[] } : null;
      if (payload?.mutation?.operationId && Array.isArray(payload.attachments) && payload.attachments.length > 0) {
        attachmentsByOp.set(payload.mutation.operationId, payload.attachments);
      }
      return base(input, init);
    }

    if (url.pathname === '/v1/changes' && method === 'GET') {
      const response = await base(input, init);
      const data = await response.json() as { events: Array<Record<string, unknown>>; more: boolean };
      const enriched = data.events.map((event) => {
        const attachments = typeof event.operationId === 'string' ? attachmentsByOp.get(event.operationId) : undefined;
        return attachments ? { ...event, attachments } : event;
      });
      return Response.json({ events: enriched, more: data.more });
    }

    if (!url.pathname.startsWith('/v1/blobs/')) {
      return base(input, init);
    }

    if (url.pathname === '/v1/blobs/reserve') {
      const body = JSON.parse(String(init?.body)) as { digest: string; size: number };
      let entry = blobs.get(body.digest);
      if (!entry) {
        entry = { size: body.size, ready: false, chunks: new Map() };
        blobs.set(body.digest, entry);
      }
      return Response.json({
        digest: body.digest,
        size: entry.size,
        ready: entry.ready,
        parts: [...entry.chunks.entries()].map(([part, info]) => ({ part, checksum: info.checksum })),
      });
    }

    if (url.pathname === '/v1/blobs/status') {
      const digest = url.searchParams.get('digest') ?? '';
      const entry = blobs.get(digest);
      assert.ok(entry, `blob ${digest} should exist in synthetic cloud`);
      return Response.json({
        digest,
        size: entry.size,
        ready: entry.ready,
        parts: [...entry.chunks.entries()].map(([part, info]) => ({ part, checksum: info.checksum })),
      });
    }

    if (url.pathname === '/v1/blobs/chunk') {
      const digest = url.searchParams.get('digest') ?? '';
      const part = Number(url.searchParams.get('part'));
      const entry = blobs.get(digest);
      assert.ok(entry, `blob ${digest} should be reserved`);
      if (method === 'PUT') {
        const raw = init?.body;
        const bytes = raw instanceof ArrayBuffer
          ? new Uint8Array(raw)
          : ArrayBuffer.isView(raw)
            ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
            : Buffer.from(String(raw ?? ''));
        const copy = new Uint8Array(bytes);
        entry.chunks.set(part, { bytes: copy, checksum: sha256(copy) });
        return new Response(null);
      }
      const saved = entry.chunks.get(part);
      assert.ok(saved, `chunk ${part} of ${digest} should exist`);
      assert.ok(saved.bytes.byteLength <= chunkSize);
      return new Response(Buffer.from(saved.bytes));
    }

    assert.equal(url.pathname, '/v1/blobs/complete');
    const body = JSON.parse(String(init?.body)) as { digest: string };
    const entry = blobs.get(body.digest);
    assert.ok(entry);
    entry.ready = true;
    return Response.json({ ready: true });
  };
}

test('P0-08 personal sync round-trips Feed and Gmail Attention references without attention.invalid_reference', async (t) => {
  const f = personalSyncFixture(t);
  const previous = process.env.MOLIS_WORK_SYNC_LOCAL;
  process.env.MOLIS_WORK_SYNC_LOCAL = '1';
  t.after(() => {
    if (previous === undefined) delete process.env.MOLIS_WORK_SYNC_LOCAL;
    else process.env.MOLIS_WORK_SYNC_LOCAL = previous;
  });
  t.mock.method(globalThis, 'fetch', f.transport);

  const project = await withMolisWorkProjectCatalog({ homeDirectory: f.homes[0]! }, async (catalog) => {
    const value = await catalog.createProject({ display_name: 'Attention Sync', actor_id: 'alice' });
    catalog.addProjectPlugin({ project_id: value.project_id, plugin_id: 'feed', actor_id: 'alice' });
    return value;
  });
  const target = await withMolisWorkProjectCatalog({ homeDirectory: f.homes[1]! }, async (catalog) => {
    const value = await catalog.ensureSyncedProject({ project_id: project.project_id, display_name: project.display_name, actor_id: 'alice' }, () => {});
    catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: 'feed', actor_id: 'alice' });
    return value;
  });

  const expected = [
    { entry_id: 'att-manual', subject_type: 'feed_item', subject_id: 'item-1', reason: 'manual', detail: { added_by: 'web_user' } },
    { entry_id: 'att-rule', subject_type: 'feed_item', subject_id: 'item-2', reason: 'source_rule', detail: { rule_id: 'rule-1', rule_name: '关键进展' } },
    {
      entry_id: 'att-judgment',
      subject_type: 'feed_item',
      subject_id: 'item-3',
      reason: 'source_rule',
      detail: { rule_id: 'rule-2', rule_name: '评审', judgment_id: 'jdg-1', function_key: 'triage', function_version: 2, needs_review: true },
    },
    {
      entry_id: 'att-failure',
      subject_type: 'feed_item',
      subject_id: 'item-4',
      reason: 'artifact_out_failed',
      detail: { rule_ids: ['rule-1'], error_codes: ['artifacts.artifact.unavailable'] },
    },
    {
      entry_id: 'att-fault',
      subject_type: 'source_fault',
      subject_id: 'src-1',
      reason: 'source_fault',
      detail: { error_code: 'feed.source_connection_changed', category: 'auth', retryable: false, user_action: 'reconnect', detected_at: '2026-11-26T10:00:00.000Z' },
    },
    {
      entry_id: 'att-gmail',
      subject_type: 'feed_item',
      subject_id: 'item-gmail',
      reason: 'source_rule',
      detail: { rule: 'gmail_attention_v1', matched_by: ['starred', 'direct_recipient'], system_labels: ['STARRED', 'IMPORTANT'] },
    },
  ] as const;

  const writer = new LocalProjectDatabase(project.database_path);
  try {
    const attention = new AttentionModule(writer.db, { exists: () => true });
    for (const row of expected) {
      attention.commands.create({
        project_id: project.project_id,
        entry_id: row.entry_id,
        owner_plugin_id: FEED_PLUGIN_ID,
        subject_type: row.subject_type,
        subject_id: row.subject_id,
        reason: row.reason,
        detail: { ...row.detail },
      });
    }
  } finally {
    writer.close();
  }

  const a = await runtimePersonalSync(f.homes[0]!, f.space);
  const b = await runtimePersonalSync(f.homes[1]!, f.space);
  f.closeWith(a.close);
  f.closeWith(b.close);

  const attentionSelection = {
    plugin_id: 'system.attention',
    publisher_id: 'molis',
    publisher_signature: 'official-attention-binding',
    collection_id: 'attention',
    schema_version: 1,
  };
  await a.sync.save({ ...a.sync.policy(), selections: [attentionSelection] });
  await a.sync.run();
  assert.equal(a.sync.status().error, null);
  assert.ok(f.events.length > 0);

  await b.sync.run();
  assert.equal(b.sync.status().error, null);
  for (const col of b.sync.status().collections) {
    assert.deepEqual(col.conflicts, [], col.selection.collection_id);
  }

  const reader = new LocalProjectDatabase(target.database_path);
  try {
    const entries = new AttentionModule(reader.db, { exists: () => false }).query.list(project.project_id);
    for (const row of expected) {
      const synced = entries.find((entry) => entry.entry_id === row.entry_id);
      assert.ok(synced, `expected synced entry ${row.entry_id}`);
      assert.deepEqual(synced.detail, row.detail);
    }
  } finally {
    reader.close();
  }
});

test('P0-09 synced Feed evidence registers Home ledger holds so another project deleting a source keeps shared evidence readable', async (t) => {
  const f = personalSyncFixture(t);
  const previous = process.env.MOLIS_WORK_SYNC_LOCAL;
  process.env.MOLIS_WORK_SYNC_LOCAL = '1';
  t.after(() => {
    if (previous === undefined) delete process.env.MOLIS_WORK_SYNC_LOCAL;
    else process.env.MOLIS_WORK_SYNC_LOCAL = previous;
  });
  t.mock.method(globalThis, 'fetch', withBlobTransport(f.transport));

  const projectA = await withMolisWorkProjectCatalog({ homeDirectory: f.homes[0]! }, async (catalog) => {
    const value = await catalog.createProject({ display_name: 'Project A', actor_id: 'alice' });
    catalog.addProjectPlugin({ project_id: value.project_id, plugin_id: 'feed', actor_id: 'alice' });
    return value;
  });
  const targetA = await withMolisWorkProjectCatalog({ homeDirectory: f.homes[1]! }, async (catalog) => {
    const value = await catalog.ensureSyncedProject({ project_id: projectA.project_id, display_name: projectA.display_name, actor_id: 'alice' }, () => {});
    catalog.addProjectPlugin({ project_id: projectA.project_id, plugin_id: 'feed', actor_id: 'alice' });
    return value;
  });
  const projectB = await withMolisWorkProjectCatalog({ homeDirectory: f.homes[1]! }, async (catalog) => {
    const value = await catalog.createProject({ display_name: 'Project B', actor_id: 'alice' });
    catalog.addProjectPlugin({ project_id: value.project_id, plugin_id: 'feed', actor_id: 'alice' });
    return value;
  });

  const sharedBody = 'Shared encrypted evidence body across Project A (synced) and Project B (local).\n';
  const at = '2026-11-26T10:00:00.000Z';

  const evidenceA = runWithMolisWorkHome(f.homes[0]!, () =>
    createEvidenceContentStore({ secretStore: createLazyFileSecretStore(f.homes[0]!) }),
  );
  const evidenceB = runWithMolisWorkHome(f.homes[1]!, () =>
    createEvidenceContentStore({ secretStore: createLazyFileSecretStore(f.homes[1]!) }),
  );
  const refShared = evidenceA.write(sharedBody).contentRef;
  assert.equal(evidenceB.write(sharedBody).contentRef, refShared);

  const seedSourceAndItem = (databasePath: string, projectId: string, sourceId: string, itemExternalId: string) => {
    const db = new LocalProjectDatabase(databasePath);
    try {
      const sql = fromProjectConnection(db.db);
      const sources = new SourcesModule(sql);
      sources.commands.save({
        project_id: projectId,
        source_id: sourceId,
        kind: 'manual',
        definition_id: null,
        sync_kind: 'manual',
        name: `Source ${sourceId}`,
        description: '',
        status: 'active',
        enabled: true,
        origin: 'molis_work',
        config: {},
        schedule: { mode: 'manual' },
        connection_ref: null,
        account_label: null,
        last_sync_at: null,
        last_outcome: null,
        last_error_code: null,
        imported_at: at,
        updated_at: at,
      });
      const attention = new AttentionModule(db.db, { exists: () => true });
      const feed = new FeedModule(sql, unassignedFeedAttention(attention), {
        ledger: feedLedgerPort(createContextLedger(db.db, { authorize: () => true })),
      });
      return feed.commands.ingest({
        project_id: projectId,
        source_id: sourceId,
        source_kind: 'manual',
        source_label: `Source ${sourceId}`,
        external_id: itemExternalId,
        title: `Shared article ${sourceId}`,
        summary: 'Summary',
        occurred_at: at,
        attention: false,
        material: {
          material_id: `mat-${sourceId}`,
          canonical_url: `https://example.test/${sourceId}`,
          title: 'Original',
          source_name: `Source ${sourceId}`,
          published_at: at,
          preview: 'Shared preview',
          content_hash: 'sha256:shared',
          content_ref: refShared,
          content_available: true,
          content_type: 'text/markdown',
          character_count: sharedBody.length,
          captured_at: at,
          provenance: { source: sourceId },
          selected_for_context: false,
        },
      }).item;
    } finally {
      db.close();
    }
  };

  const itemA = seedSourceAndItem(projectA.database_path, projectA.project_id, 'src-a', 'ext-shared-a');
  seedSourceAndItem(projectB.database_path, projectB.project_id, 'src-b', 'ext-shared-b');

  const a = await runtimePersonalSync(f.homes[0]!, f.space);
  const b = await runtimePersonalSync(f.homes[1]!, f.space);
  f.closeWith(a.close);
  f.closeWith(b.close);

  const sourceDescCollection = feedManifest.sync!.collections.find((row) => row.id === 'source_descriptions')!;
  const messagesCollection = feedManifest.sync!.collections.find((row) => row.id === 'messages')!;
  const toSelection = (col: typeof messagesCollection) => ({
    plugin_id: feedManifest.plugin_id,
    publisher_id: feedManifest.publisher.publisher_id,
    publisher_signature: feedManifest.publisher.signature,
    collection_id: col.id,
    schema_version: col.schema_version,
  });

  await a.sync.save({ ...a.sync.policy(), selections: [toSelection(sourceDescCollection), toSelection(messagesCollection)] });
  await a.sync.run();
  assert.equal(a.sync.status().error, null);

  await b.sync.run();
  assert.equal(b.sync.status().error, null);
  for (const col of b.sync.status().collections) {
    assert.deepEqual(col.conflicts, [], col.selection.collection_id);
  }

  // Without restarting Home B, Project B deletes its source and releases references in the shared Home ledger.
  const refB = molisWorkHostProjectReference({ databasePath: projectB.database_path, projectId: projectB.project_id });
  const callerB = await b.host.localPersonContext(refB);
  await b.host.actionClient(refB).invoke(callerB, feedSourceActions.delete, {
    source_id: 'src-b',
    history_decision: 'delete_local_history',
  });

  assert.equal(evidenceB.has(refShared), true, 'shared encrypted evidence must remain on disk after Project B release');
  assert.equal(evidenceB.read(refShared), sharedBody);

  const refA = molisWorkHostProjectReference({ databasePath: targetA.database_path, projectId: projectA.project_id });
  const callerA = await b.host.localPersonContext(refA);
  const readerResult = await b.host.actionClient(refA).invoke(callerA, feedQueryActions.reader, {
    object_id: itemA.item_id,
  }) as { item: { materials: Array<{ content_available?: boolean; content?: string }> } };
  assert.equal(readerResult.item.materials[0]?.content_available, true);
  assert.equal(readerResult.item.materials[0]?.content, sharedBody);
});
