import assert from "node:assert/strict";
import test from "node:test";
import { createReadLimiter } from "../apps/local-host/src/project-arrival-http.js";

// Looking at a project opens it, so the chooser's brief reads are limited to a couple at a time however fast the person
// moves down the list (specs/archive/project-arrival-flow → 数据与 owner).

const settle = () => new Promise<void>(resolve => setImmediate(resolve));
const gate = () => { let open!: () => void; const wait = new Promise<void>(resolve => { open = resolve; }); return { open, wait }; };

test("only a few reads run at once, and the rest go in the order they were asked", async () => {
  const limited = createReadLimiter(2);
  const gates = Array.from({ length: 5 }, gate);
  const started: number[] = [];
  let running = 0, peak = 0;
  const runs = gates.map((entry, index) => limited(async () => {
    started.push(index); running++; peak = Math.max(peak, running);
    await entry.wait;
    running--;
    return index;
  }));
  await settle();
  assert.deepEqual(started, [0, 1], "two start, three wait");
  gates[1].open();
  await settle();
  assert.deepEqual(started, [0, 1, 2], "a finished read hands its place to the next in line");
  gates[0].open(); gates[2].open();
  await settle();
  assert.deepEqual(started, [0, 1, 2, 3, 4]);
  gates[3].open(); gates[4].open();
  assert.deepEqual(await Promise.all(runs), [0, 1, 2, 3, 4]);
  assert.equal(peak, 2, "never more than the limit, not even for a moment");
});

test("a read that fails gives its place to the next, and the failure reaches whoever asked", async () => {
  const limited = createReadLimiter(1);
  const first = limited(async () => { throw new Error("项目读不到"); });
  const second = limited(async () => "读到了");
  await assert.rejects(first, /项目读不到/);
  assert.equal(await second, "读到了");
});

test("a limiter that has gone quiet starts the next read at once", async () => {
  const limited = createReadLimiter(2);
  for (let round = 0; round < 4; round++) {
    assert.deepEqual(await Promise.all([limited(async () => round), limited(async () => round + 10)]), [round, round + 10]);
  }
  const gates = [gate(), gate()];
  const started: number[] = [];
  const both = gates.map((entry, index) => limited(async () => { started.push(index); await entry.wait; }));
  await settle();
  assert.deepEqual(started, [0, 1], "no place was lost along the way");
  gates.forEach(entry => entry.open());
  await Promise.all(both);
});
