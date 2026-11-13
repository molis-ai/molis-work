import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// Resolve the installed public SDK from its actual consumer, never SDK source or internal dist paths.
const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime, isTerminalEventType, createConservativeCounter } = await import(requireSdk.resolve("@prologue/sdk"));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
const APP = { appId: "prologue.memory-run-facts", appVersion: "1.0.0" };
const OWNER = { scope: "project", owner: "facts-project" }, OTHER = { scope: "app", owner: APP.appId };
const FACTS = { plugins: ["coding"], objectKinds: ["code"], goals: ["ship"] };
const BODY = 'amber matching convention: quote "alpha", slash \\, newline\n下一行。' + " bounded identity".repeat(5);
const BUDGET = 160;
type Wire = { messages: { role: string; content?: string }[] };
type Block = { source: string; text: string; memory: { id: string; scope: string } };
type ContextReceipt = { type: "memory-context"; callId: string; status: string; tokens: number; budgetTokens: number; basis: string;
  references: { receiptId: string; id: string; version: number }[]; parts: { index: number; tokens: number; form: string }[] };
type Event = ContextReceipt | { type: string };
type Run = { ref: { id: string }; subscribe(listener: (event: Event) => void): () => void };
type Authorization = { appId: string; action: string; context: { consumer: string; currentScene: string; purpose: string; sessionRef?: { id: string }; facts?: unknown };
  target: { scope: string; owner: string; namespace?: string } };
function blocks(wire: Wire) {
  return wire.messages.flatMap((message, index) => {
    if (!message.content?.startsWith("Untrusted context data.")) return [];
    const value = JSON.parse(message.content.slice(message.content.indexOf("\n") + 1)) as Block;
    return value.source === "memory-recall" ? [{ value, text: message.content, index }] : [];
  });
}
function observe(run: Run) {
  const events: Event[] = [];
  const done = new Promise<Event>(resolve => run.subscribe(event => { events.push(event); if (isTerminalEventType(event.type)) resolve(event); }));
  return { run, events, done };
}

// MEM-13: both role read ceilings apply; MEM-27: accepted parent facts stay frozen across child dispatch.
// MEM-33: each Run measures its complete identity wrapper against its own budget with independent receipts.
// The authority/roles below preserve SDK715 memory-run-facts.live's explicit owner/action grants.
for (const [parentRecall, childRecall, forged] of [[true, true, false], [false, true, false], [true, false, false], [true, true, true]]) {
  test(`SDK715 child identity: parent=${parentRecall} child=${childRecall} forged=${forged}`, { timeout: 30_000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), "sdk-child-identity-")), storageRoot = join(home, "sdk");
    const project = join(home, "project"); await mkdir(project);
    assert.ok(home.startsWith(tmpdir() + "/")); assert.equal(storageRoot, join(home, "sdk"));
    t.diagnostic(JSON.stringify({ kind: "isolated-sdk", home, storageRoot }));
    const requests: Wire[] = [], reads: Authorization[] = [], responses: string[] = [];
    const firstRequest = Promise.withResolvers<void>(), releaseDispatch = Promise.withResolvers<void>();
    const server = createServer(async (request, response) => {
      let body = ""; for await (const chunk of request) body += chunk;
      const wire = JSON.parse(body) as Wire; requests.push(wire);
      // A scripted answer derives any identity from the actual received block, never the saved test expectation.
      const answer = JSON.stringify(blocks(wire).map(({ value }) => value.memory)); responses.push(answer);
      if (requests.length === 1) { firstRequest.resolve(); await releaseDispatch.promise; }
      const delta = requests.length === 1 ? { tool_calls: [{ index: 0, id: "child-call", type: "function", function: {
        name: "dispatch-subagent", arguments: JSON.stringify({ instruction: "amber conventions CHILD_IDENTITY", idempotencyKey: "child", tools: [], character: "child@1",
          ...(forged ? { memory: { facts: { plugins: ["mail"] } } } : {}) }),
      } }] } : { content: answer };
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\ndata: [DONE]\n\n`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    let runtime: Awaited<ReturnType<typeof createRuntime>> | undefined;
    t.after(async () => { releaseDispatch.resolve(); try { await runtime?.shutdown(); } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true }); } });
    const scopes = [OWNER, OTHER], actions = ["save", "read", "manage-read"];
    const contextAllowed = (context: Authorization["context"]) => context.currentScene === "coding"
      && (context.purpose === "management" ? context.consumer === "test-person" : context.consumer === "test-agent");
    const scopeAllowed = (target: { scope: string; owner: string; namespace?: string }) => target.namespace === undefined
      && scopes.some(scope => scope.scope === target.scope && scope.owner === target.owner);
    runtime = await createRuntime({ app: APP, host: createNodeHost({ storageRoot }), preset: "local-agent",
      network: { model: true, loopback: true }, posture: { sandbox: "read-only" }, rules: [{ source: "user", effect: "allow", match: { what: "tool" } }],
      config: { memory: { version: 1, preset: "manual", taxonomy: { version: 1,
        scenes: { values: [{ id: "coding", label: "Coding" }], default: ["coding"] },
        kinds: { values: [{ id: "convention", label: "Convention" }], default: "convention" },
        lifecycles: { values: [{ id: "long-term", label: "Long term", retention: "persistent" }], default: "long-term" } },
        matrix: { default: { actions, formation: [], read: { modes: ["explicit", "task"] } } } } },
      memoryAuthority: { defaultContext: { consumer: "test-person", currentScene: "coding", purpose: "management" },
        async authorizeManagement(request: { appId: string; context: Authorization["context"]; scope: string; owner: string; filter: { namespace?: string } }) {
          return { allowed: request.appId === APP.appId && contextAllowed(request.context) && request.context.purpose === "management"
            && scopeAllowed({ ...request, namespace: request.filter.namespace }) };
        },
        async authorizeRecall(request: { appId: string; context: Authorization["context"]; scopes: typeof scopes; filter: { namespace?: string } }) {
          return { allowed: request.appId === APP.appId && contextAllowed(request.context) && request.filter.namespace === undefined && request.scopes.every(scopeAllowed) };
        },
        async authorize(batch: Authorization[]) { reads.push(...batch); return batch.every(request => request.appId === APP.appId && contextAllowed(request.context)
          && (request.context.purpose === "management" || request.action === "read") && actions.includes(request.action) && scopeAllowed(request.target)); },
      } });
    const saved = await runtime.memory.write({ ...OWNER, text: BODY, origin: "person", meta: { appliesWhen: FACTS } });
    const excluded: Array<{ ref: { id: string } }> = [];
    for (const [text, owner, appliesWhen] of [["amber wrong plugin", OWNER, { plugins: ["mail"] }],
      ["amber wrong object", OWNER, { objectKinds: ["message"] }], ["amber wrong goal", OWNER, { goals: ["later"] }],
      ["amber outside scope", OTHER, FACTS]] as const) excluded.push(await runtime.memory.write({ ...owner, text, origin: "person", meta: { appliesWhen } }));
    let parentCharacter;
    for (const [id, recall] of [["parent", true], ["child", childRecall]] as const) {
      const character = runtime.characters.create({ id, version: 1, name: id, role: "Read conventions", tools: id === "parent" ? ["dispatch-subagent"] : [], memoryPolicy: { recall, write: false } });
      runtime.characters.publish(character.ref); if (id === "parent") parentCharacter = character.ref;
    }
    const root = await runtime.workspace.authorize({ path: project, posture: "read-only" });
    const credentialRef = (await runtime.credentials.write({ label: "loopback", secret: { plaintext: new TextEncoder().encode("synthetic") } })).ref;
    const session = await runtime.sessions.create();
    const board = await runtime.boards.admit({ standing: { keepFinished: 5 }, nodes: [{ id: "root", title: "root", dependsOn: [], onFailure: "block-for-human", assignee: session.ref }] });
    const children: ReturnType<typeof observe>[] = [];
    let childSession = "";
    const facts = structuredClone(FACTS);
    const starting = runtime.startAgentRun({ session, collaboration: { board: board.ref.id, node: "root" }, rootRef: root.ref,
      start: { protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/chat`, credentialRef, model: "local-script", messages: [{ role: "user", text: "amber conventions" }] },
      agent: { idempotencyKey: "identity-parent", mode: "plan", characterRef: parentCharacter,
        memory: { consumer: "test-agent", currentScene: "coding", addressable: true, budgetTokens: BUDGET, budgetChars: 2000, facts,
          ...(parentRecall ? { task: true, scopes: [OWNER] } : { recall: false }) } },
      subagents: { onStarted: ({ run, childSession: ownSession }: { run: Run; childSession: { ref: { id: string } } }) => {
        childSession = ownSession.ref.id; children.push(observe(run)); // Observation only; no parent executor/binding is passed.
      } },
    });
    const started = await starting, parent = observe(started.run);
    await firstRequest.promise;
    assert.equal(children.length, 0, "the first parent dispatch response is still held; no child has started");
    facts.plugins[0] = "mail"; // Accepted recipe is frozen; child dispatch has not yet been released.
    releaseDispatch.resolve();
    assert.equal((await parent.done).type, "completed");
    const child = children[0];
    if (forged) {
      assert.equal(child, undefined); assert.equal(requests.length, 2); assert.match(JSON.stringify(requests[1]), /TOOL_ARGUMENTS_INVALID/);
      assert.ok(reads.filter(one => one.action === "read").every(one => one.context.sessionRef?.id === session.ref.id));
    } else {
      assert.ok(child); assert.equal((await child.done).type, "completed"); assert.equal(requests.length, 3);
      assert.notEqual(child.run.ref.id, parent.run.ref.id); assert.notEqual(childSession, session.ref.id);
      const childReads = reads.filter(one => one.action === "read" && one.context.sessionRef?.id === childSession);
      if (parentRecall && childRecall) { assert.ok(childReads.length > 1); for (const one of childReads) assert.deepEqual(one.context.facts, FACTS); }
      else assert.deepEqual(childReads, []);
    }
    const verify = (observation: ReturnType<typeof observe>, wires: Wire[], expected: boolean) => {
      const receipts = observation.events.filter((event): event is ContextReceipt => event.type === "memory-context");
      const final = receipts.filter(event => event.status === "response-observed");
      for (const wire of wires) {
        assert.deepEqual(blocks(wire).map(({ value }) => ({ ...value.memory, text: value.text })), expected ? [{ id: saved.ref.id, scope: OWNER.scope, text: BODY }] : []);
        assert.ok(excluded.every(entry => !JSON.stringify(wire).includes(entry.ref.id)));
      }
      if (!expected) { assert.ok(final.every(event => event.references.length === 0)); return undefined; }
      assert.equal(final.length, wires.length);
      const counter = createConservativeCounter();
      for (const [index, receipt] of final.entries()) {
        const wire = wires[index]!, canonical = blocks(wire);
        assert.ok(receipt.callId); assert.equal(receipt.budgetTokens, BUDGET); assert.equal(receipt.basis, "conservative-estimate");
        assert.ok(receipt.tokens > 0 && receipt.tokens <= BUDGET);
        assert.deepEqual(receipt.references.map(({ id, version }) => ({ id, version })), [{ id: saved.ref.id, version: saved.version }]);
        assert.ok(receipt.references.every(ref => ref.receiptId));
        assert.equal(receipt.tokens, canonical.reduce((sum, block) => sum + counter.count(block.text).tokens, 0));
        assert.deepEqual(receipt.parts, canonical.map(block => ({ index: block.index, tokens: counter.count(block.text).tokens, form: "entry" })));
        assert.equal(receipt.parts.reduce((sum, part) => sum + part.tokens, 0), receipt.tokens);
        assert.deepEqual(receipts.filter(event => event.callId === receipt.callId).map(event => event.status), ["prepared", "response-observed"]);
      }
      assert.equal(new Set(final.map(receipt => receipt.callId)).size, wires.length);
      return final[0]!;
    };
    const parentWires = requests.filter(wire => !wire.messages.some(message => message.role === "user" && message.content?.includes("CHILD_IDENTITY")));
    assert.equal(parentWires.length, 2);
    const parentReceipt = verify(parent, parentWires, parentRecall);
    const childWires = requests.filter(wire => wire.messages.some(message => message.role === "user" && message.content?.includes("CHILD_IDENTITY")));
    assert.equal(childWires.length, forged ? 0 : 1);
    const childReceipt = child && verify(child, childWires, parentRecall && childRecall);
    if (parentReceipt && childReceipt) {
      assert.notEqual(childReceipt.callId, parentReceipt.callId);
      assert.notEqual(childReceipt.references[0]!.receiptId, parentReceipt.references[0]!.receiptId);
      assert.ok(parentReceipt.tokens + childReceipt.tokens > BUDGET, "each Run has its own allowance, not a shared remaining balance");
      assert.deepEqual(JSON.parse(responses[1]!), [{ id: saved.ref.id, scope: OWNER.scope }]);
    }
    t.diagnostic(JSON.stringify({ kind: "identity-evidence", parentRecall, childRecall, forged, saved, requests, parentRun: parent.run.ref,
      childRun: child?.run.ref, childSession, parentEvents: parent.events.filter(event => event.type === "memory-context"), childEvents: child?.events.filter(event => event.type === "memory-context") }));
  });
}
