import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { Session } from "node:inspector/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

import { ChromeHarness, launchHeadlessChrome, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";

// ---- locateTestChrome -------------------------------------------------------------------------------------------

const FIXED = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

test("the Chrome locator tries MOLIS_WORK_TEST_CHROME first, then the fixed places in order, then gives up", () => {
  const present = (...paths) => (path) => paths.includes(path);
  assert.equal(locateTestChrome({ MOLIS_WORK_TEST_CHROME: "/opt/chrome" }, present("/opt/chrome", ...FIXED)), "/opt/chrome");
  assert.equal(locateTestChrome({}, present(...FIXED)), FIXED[0]);
  assert.equal(locateTestChrome({}, present(FIXED[2], FIXED[3])), FIXED[2]);
  assert.equal(locateTestChrome({}, present(FIXED[3])), FIXED[3]);
  // An override that does not exist, or is empty, does not hide the machine's own Chrome.
  assert.equal(locateTestChrome({ MOLIS_WORK_TEST_CHROME: "/opt/missing" }, present(FIXED[1])), FIXED[1]);
  assert.equal(locateTestChrome({ MOLIS_WORK_TEST_CHROME: "" }, present(FIXED[1])), FIXED[1]);
  assert.equal(locateTestChrome({}, present()), null);
});

// ---- launchHeadlessChrome, against a fake executable --------------------------------------------------------------

/** A stand-in for Chrome: reports its flags, then behaves as FAKE_CHROME_MODE says. */
const FAKE_CHROME = `#!/usr/bin/env node
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
writeFileSync(process.env.FAKE_CHROME_REPORT, JSON.stringify({ args: process.argv.slice(2), pid: process.pid }));
const mode = process.env.FAKE_CHROME_MODE;
if (mode === "exit") { process.stderr.write("first line\\nbad flag: --nonsense\\n"); process.exitCode = 1; }
else {
  process.on("SIGTERM", () => { if (mode !== "ignore-term") process.exit(0); });
  if (mode === "helper-holds-stderr") {
    // Chrome's helper processes can inherit its stderr and outlive it: the pipe stays open for seconds after the main process is gone.
    const helper = spawn(process.execPath, ["-e", "setTimeout(() => {}, 4000)"], { detached: true, stdio: ["ignore", "ignore", "inherit"] });
    helper.unref();
    writeFileSync(process.env.FAKE_CHROME_REPORT, JSON.stringify({ args: process.argv.slice(2), pid: process.pid, helperPid: helper.pid }));
  }
  process.stderr.write("noise before the address\\nDevTools listening on ws://127.0.0.1:9/devtools/browser/fake\\n");
  setInterval(() => {}, 1000);
}
`;

async function withFakeChrome(mode, run) {
  const directory = await mkdtemp(join(tmpdir(), "test-kit-fake-chrome-"));
  const executable = join(directory, "fake-chrome.mjs");
  const report = join(directory, "report.json");
  await writeFile(executable, FAKE_CHROME);
  await chmod(executable, 0o755);
  const previous = { mode: process.env.FAKE_CHROME_MODE, report: process.env.FAKE_CHROME_REPORT };
  process.env.FAKE_CHROME_MODE = mode;
  process.env.FAKE_CHROME_REPORT = report;
  try { await run({ directory, executable, report: () => readFile(report, "utf8").then(JSON.parse) }); }
  finally {
    for (const [key, value] of [["FAKE_CHROME_MODE", previous.mode], ["FAKE_CHROME_REPORT", previous.report]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test("launching reads the debugger address from stderr and passes the standard flags, the profile and the extra flags", async () => {
  await withFakeChrome("ready", async ({ directory, executable, report }) => {
    const chrome = await launchHeadlessChrome({ executable, profileDirectory: join(directory, "profile"), extraArgs: ["--window-size=800,600"] });
    try {
      assert.equal(chrome.debuggerUrl, "ws://127.0.0.1:9/devtools/browser/fake");
      const { args } = await report();
      for (const flag of ["--headless=new", "--remote-debugging-port=0", "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding", `--user-data-dir=${join(directory, "profile")}`, "--window-size=800,600"]) {
        assert.ok(args.includes(flag), `missing ${flag}`);
      }
      assert.equal(args.at(-1), "about:blank");
      assert.ok(args.indexOf("--window-size=800,600") < args.indexOf("about:blank"));
    } finally { await chrome.close(); }
  });
});

test("the standard flags the README lists are exactly the ones the launcher passes", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const line = readme.split("\n").find((entry) => entry.trimStart().startsWith("- 经 `launchHeadlessChrome`"));
  assert.ok(line, "the README states the standard launch flags");
  const listed = [...line.matchAll(/`(--[a-z0-9-]+(?:=[^`]*)?)`/g)].map((match) => match[1]);
  await withFakeChrome("ready", async ({ directory, executable, report }) => {
    const chrome = await launchHeadlessChrome({ executable, profileDirectory: join(directory, "profile") });
    try {
      const { args } = await report();
      const passed = args.filter((arg) => !arg.startsWith("--user-data-dir=") && arg !== "about:blank");
      assert.deepEqual([...listed].sort(), [...passed].sort());
    } finally { await chrome.close(); }
  });
});

test("a Chrome that exits before announcing the debugger rejects with the tail of its stderr", async () => {
  await withFakeChrome("exit", async ({ directory, executable }) => {
    await assert.rejects(launchHeadlessChrome({ executable, profileDirectory: join(directory, "profile") }),
      /Chrome exited before debugger start: [\s\S]*bad flag: --nonsense/);
  });
});

test("a Chrome that never announces the debugger is stopped when the start timeout passes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "test-kit-silent-chrome-"));
  const executable = join(directory, "silent.mjs");
  await writeFile(executable, "#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n");
  await chmod(executable, 0o755);
  try {
    const started = Date.now();
    await assert.rejects(launchHeadlessChrome({ executable, profileDirectory: join(directory, "profile"), startTimeoutMs: 300 }), /Chrome debugger did not start/);
    assert.ok(Date.now() - started < 3_000);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("closing ends a Chrome that ignores SIGTERM with SIGKILL after about a second, and closing again is harmless", async () => {
  await withFakeChrome("ignore-term", async ({ directory, executable, report }) => {
    const chrome = await launchHeadlessChrome({ executable, profileDirectory: join(directory, "profile") });
    const { pid } = await report();
    assert.ok(alive(pid));
    const started = Date.now();
    await chrome.close();
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 800 && elapsed < 3_000, `the forced stop took ${elapsed} ms`);
    assert.equal(alive(pid), false);
    await chrome.close();
  });
});

test("closing a Chrome that obeys SIGTERM does not wait for the forced stop", async () => {
  await withFakeChrome("ready", async ({ directory, executable }) => {
    const chrome = await launchHeadlessChrome({ executable, profileDirectory: join(directory, "profile") });
    const started = Date.now();
    await chrome.close();
    assert.ok(Date.now() - started < 900);
  });
});

test("closing waits for the main process to exit and only briefly for its stderr to close: a helper that keeps the pipe open delays it by half a second at most", async () => {
  await withFakeChrome("helper-holds-stderr", async ({ directory, executable, report }) => {
    const chrome = await launchHeadlessChrome({ executable, profileDirectory: join(directory, "profile") });
    const { pid, helperPid } = await report();
    assert.ok(Number.isInteger(helperPid) && alive(helperPid), "the helper holds the pipe");
    try {
      const started = Date.now();
      await chrome.close();
      const elapsed = Date.now() - started;
      // Waiting for the pipe would take the helper's full four seconds; closing gives the helpers 500 ms, then stops waiting.
      assert.ok(elapsed >= 450 && elapsed < 1_400, `close() took ${elapsed} ms`);
      assert.equal(alive(pid), false);
      assert.ok(alive(helperPid), "the helper outlives close() and still holds the pipe");
    } finally {
      try { process.kill(helperPid, "SIGKILL"); } catch { /* it has already ended */ }
    }
  });
});

test("an executable that cannot be started is an error, not a skip: only the locator decides that there is no Chrome", async () => {
  const directory = await mkdtemp(join(tmpdir(), "test-kit-no-chrome-"));
  try {
    await assert.rejects(ChromeHarness.start(directory, { executable: join(directory, "missing") }));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

// ---- ChromeHarness and ChromePage, against a minimal WebSocket server -----------------------------------------------

/** Server-to-client text frame (never masked). */
function textFrame(text) {
  const payload = Buffer.from(text);
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  assert.ok(payload.length < 65_536);
  return Buffer.concat([Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255]), payload]);
}

/** Reads the (masked) text frames a client sent; keeps an incomplete tail for the next chunk. */
function readFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const opcode = buffer[offset] & 0x0f;
    let length = buffer[offset + 1] & 0x7f;
    let header = 2;
    if (length === 126) { if (buffer.length - offset < 4) break; length = buffer.readUInt16BE(offset + 2); header = 4; }
    else if (length === 127) { if (buffer.length - offset < 10) break; length = Number(buffer.readBigUInt64BE(offset + 2)); header = 10; }
    const total = header + 4 + length;
    if (buffer.length - offset < total) break;
    const mask = buffer.subarray(offset + header, offset + header + 4);
    const payload = Buffer.from(buffer.subarray(offset + header + 4, offset + total));
    for (let index = 0; index < payload.length; index++) payload[index] ^= mask[index % 4];
    if (opcode === 0x1) messages.push(payload.toString("utf8"));
    offset += total;
  }
  return { messages, rest: buffer.subarray(offset) };
}

/** A DevTools stand-in: `handle(message, reply, push)` answers each command; `push` sends an event to the client. */
async function fakeDevTools(handle) {
  const received = [];
  const sockets = new Set();
  const server = createServer();
  server.on("upgrade", (request, socket) => {
    const accept = createHash("sha1").update(request.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    const push = (event) => socket.write(textFrame(JSON.stringify(event)));
    let pending = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      const { messages, rest } = readFrames(Buffer.concat([pending, chunk]));
      pending = rest;
      for (const text of messages) {
        const message = JSON.parse(text);
        received.push(message);
        handle(message, (result) => socket.write(textFrame(JSON.stringify({ id: message.id, ...result }))), push);
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `ws://127.0.0.1:${server.address().port}/devtools/browser/fake`,
    received,
    dropConnections: () => { for (const socket of sockets) socket.destroy(); },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function withHarness(handle, options, run) {
  const devtools = await fakeDevTools(handle);
  const harness = await ChromeHarness.connect(devtools.url, options);
  try { await run(harness, devtools); }
  finally { await harness.close(); await devtools.close(); }
}

/** Delays handing back the first `Profiler.stop` result, modelling a slow read of the sample. */
async function withDelayedProfileStop(delayMs, run) {
  const original = Session.prototype.post;
  let delayed = false;
  Session.prototype.post = async function post(...args) {
    const result = await original.apply(this, args);
    if (args[0] === "Profiler.stop" && !delayed) {
      delayed = true;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return result;
  };
  try { await run(); } finally { Session.prototype.post = original; }
}

/** Holds the first `Profiler.stop` back until the test releases it, modelling a read whose request never answers. */
async function withHungProfileStop(run) {
  const original = Session.prototype.post;
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let hung = false;
  Session.prototype.post = async function post(...args) {
    if (args[0] === "Profiler.stop" && !hung) { hung = true; await held; }
    return original.apply(this, args);
  };
  try { return await run(() => release()); } finally { Session.prototype.post = original; }
}

test("a command resolves with the result and an error reply rejects with the protocol error", async () => {
  await withHarness((message, reply) => {
    if (message.method === "Good") reply({ result: { value: 7 } });
    else reply({ error: { code: -32000, message: "no such thing" } });
  }, {}, async (harness, devtools) => {
    assert.deepEqual(await harness.command("Good", { a: 1 }, "session-1"), { value: 7 });
    assert.deepEqual(devtools.received[0], { id: 1, method: "Good", params: { a: 1 }, sessionId: "session-1" });
    await assert.rejects(harness.command("Bad"), /no such thing/);
  });
});

test("a command that gets no reply times out at the given limit and the error names the expression", async () => {
  await withHarness(() => {}, { commandTimeoutMs: 5_000 }, async (harness) => {
    const started = Date.now();
    await assert.rejects(harness.command("Runtime.evaluate", { expression: "document.title + ' ' + 'x'.repeat(10)" }, undefined, 150),
      /CDP timeout: Runtime\.evaluate · document\.title/);
    assert.ok(Date.now() - started < 2_000);
    // Without an expression, keep the method, measured elapsed time, exact limit and caller; a long expression is cut.
    await assert.rejects(harness.command("Browser.getVersion", {}, undefined, 50), (error) => {
      assert.match(error.message, /^CDP timeout: Browser\.getVersion \(elapsed \d+ms; limit 50ms\)$/);
      assert.deepEqual(Object.keys(error.cause).sort(), ["eventLoopActiveMs", "eventLoopIdleMs", "nodeCpuMs"]);
      assert.ok(Object.values(error.cause).every(value => Number.isFinite(value) && value >= 0));
      assert.match(error.stack, /browser\.test\.mjs:\d+:\d+/);
      return true;
    });
    await assert.rejects(harness.command("Runtime.evaluate", { expression: "y".repeat(1000) }, undefined, 50), (error) => error.message.length < 400);
  });
});

test("a reply that arrived before its timer still wins, even when the timer runs first (RAC-1450)", async () => {
  await withHarness((message, reply) => {
    if (message.method !== "Slow") { reply({ result: {} }); return; }
    // Put the reply on the wire first, then block this thread past the command's limit: by the time the event loop
    // comes back the timer is overdue while the reply is already in the socket, so the timer must not decide the outcome.
    reply({ result: { value: 42 } });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
  }, {}, async (harness) => {
    assert.deepEqual(await harness.command("Slow", {}, undefined, 50), { value: 42 });
    // The deferred timer decision does not reject anything after the reply settled the command.
    assert.deepEqual(await harness.command("After", {}, undefined, 500), {});
  });
});

test("a timed-out command carries how much Chrome said while it waited (RAC-1451)", async () => {
  await withHarness((message, reply, push) => {
    if (message.method !== "Quiet") { reply({ result: {} }); return; }
    for (let index = 0; index < 200; index++) push({ method: "Page.frameNavigated", params: { frame: { id: String(index) } } });
  }, {}, async (harness) => {
    await assert.rejects(harness.command("Quiet", {}, undefined, 120), (error) => {
      assert.match(error.message, /^CDP timeout: Quiet \(elapsed \d+ms; limit 120ms\)$/);
      assert.deepEqual(Object.keys(error.cause).sort(), ["eventLoopActiveMs", "eventLoopIdleMs", "nodeCpuMs"]);
      const diagnostics = error.diagnostics;
      assert.ok(diagnostics, "a timeout error carries diagnostics");
      assert.ok(diagnostics.chromeMessages >= 200, `saw ${diagnostics.chromeMessages} messages`);
      assert.equal(diagnostics.chromeTopMethods[0].method, "Page.frameNavigated");
      assert.ok(diagnostics.chromeTopMethods[0].count >= 200);
      return true;
    });
  });
});

test("a timed-out command profiles what kept Node busy, without the script URL's query string (RAC-1451)", async () => {
  const sentinel = "SENTINEL-T036";
  // The busy function lives in a script whose sourceURL carries a query string: the profile sees it, the error must not.
  const busy = vm.runInThisContext(`(function cdpSentinelBusyWork() {
    const until = Date.now() + 200;
    let sum = 0;
    while (Date.now() < until) sum += Math.sqrt(sum + 1);
    return sum;
  })
  //# sourceURL=/tmp/t036-sentinel.js?token=${sentinel}`);

  await withHarness(() => {}, { profileTimeouts: true }, async (harness) => {
    const command = harness.command("Busy", {}, undefined, 120);
    const observed = command.then(
      () => { throw new Error("the busy command resolved, but nothing answers it"); },
      (error) => error,
    );
    busy(); // keep the main thread working inside the command's window, past the 120 ms limit
    const error = await observed;
    assert.match(error.message, /^CDP timeout: Busy \(elapsed \d+ms; limit 120ms\)$/);
    const diagnostics = error.diagnostics;
    assert.ok(diagnostics, "a timeout error carries diagnostics");
    assert.ok(Array.isArray(diagnostics.nodeSelfTime), "the profile is in the diagnostics");
    assert.equal(diagnostics.nodeSelfTimeComplete, true);
    assert.ok(
      diagnostics.nodeSelfTime.some(({ functionName }) => functionName === "cdpSentinelBusyWork"),
      `the busy function is listed: ${JSON.stringify(diagnostics.nodeSelfTime)}`,
    );
    const dumped = JSON.stringify({ message: error.message, cause: error.cause, diagnostics });
    assert.ok(!dumped.includes(sentinel), "the script URL's query string is not copied into the error");
  });
});

test("a slow profile read cannot postpone the timeout past its grace, and elapsed says how long it waited (RAC-1452)", async () => {
  await withDelayedProfileStop(400, async () => {
    await withHarness(() => {}, { profileTimeouts: true }, async (harness) => {
      const started = performance.now();
      // RAC-1452: with `profileTimeouts` on the rejection still lands between the limit and limit + 250 ms, even when the
      // bounded profile read is slower than its grace. Same clock as the harness, so `elapsed` can be held to the wait.
      await assert.rejects(harness.command("Never", {}, undefined, 100), (error) => {
        const settledAfter = performance.now() - started;
        assert.ok(settledAfter >= 100 && settledAfter <= 350, `settled after ${settledAfter.toFixed(1)}ms, outside limit..limit + 250`);
        const stated = Number(/\(elapsed (\d+)ms; limit 100ms\)/.exec(error.message)?.[1]);
        assert.ok(stated >= 140, `elapsed ${stated}ms includes the profile wait`);
        assert.ok(stated <= settledAfter, `elapsed ${stated}ms claims more than the ${settledAfter.toFixed(1)}ms the caller waited`);
        assert.ok(error.diagnostics, "Chrome counters still ride along without the profile");
        assert.deepEqual(error.diagnostics.nodeSelfTime, [], "no samples without a profile");
        assert.equal(error.diagnostics.nodeSelfTimeComplete, false, "an unread profile does not claim coverage");
        assert.ok(error.diagnostics.profileReadMs >= 140, `profileReadMs ${error.diagnostics.profileReadMs} says how long the read held the rejection`);
        assert.ok(error.diagnostics.profileReadMs <= settledAfter, "the bounded read cannot outlast the settlement");
        return true;
      });
    });
  });
});

test("a timeout's elapsed is the whole milliseconds the command waited, rounded down, never more (RAC-1674)", async () => {
  // merge_group run 40790882078 (#1415): RAC-1452 read "elapsed 250ms" against the 249 ms its caller had waited, because
  // the harness rounded to the nearest millisecond. Here the command starts on a whole millisecond and every later
  // reading is 0.6 ms past one, so rounding would claim a millisecond the command never waited.
  await withHarness(() => {}, {}, async (harness) => {
    const real = performance.now.bind(performance), readings = [];
    performance.now = () => {
      const reading = Math.floor(real()) + (readings.length === 0 ? 0 : 0.6);
      readings.push(reading);
      return reading;
    };
    try {
      await assert.rejects(harness.command("Never", {}, undefined, 50), (error) => {
        const stated = Number(/\(elapsed (\d+)ms; limit 50ms\)/.exec(error.message)?.[1]);
        const waited = readings.at(-1) - readings[0];
        assert.equal(stated, Math.floor(waited), `elapsed ${stated}ms for ${waited.toFixed(1)}ms measured`);
        return true;
      });
    } finally {
      delete performance.now;
    }
  });
});

test("a close during the bounded profile read still rejects the timed-out command (RAC-1452)", async () => {
  await withDelayedProfileStop(400, async () => {
    const devtools = await fakeDevTools(() => {});
    const harness = await ChromeHarness.connect(devtools.url, { profileTimeouts: true });
    try {
      const command = harness.command("Never", {}, undefined, 100);
      // Past the timeout decision, while the bounded read is still waiting: closing must stop the read and keep the
      // rejection the command already earned.
      await new Promise((resolve) => setTimeout(resolve, 240));
      const closing = harness.close();
      const error = await command.then(
        () => { throw new Error("a timed-out command must not resolve"); },
        (rejection) => rejection,
      );
      assert.match(error.message, /^CDP timeout: Never \(elapsed \d+ms; limit 100ms\)$/);
      assert.deepEqual(error.diagnostics.nodeSelfTime, []);
      assert.equal(error.diagnostics.nodeSelfTimeComplete, false);
      await closing;
    } finally {
      await devtools.close();
    }
  });
});

test("a close finishes while a diagnostic read waits for an inspector answer that never comes (RAC-1452)", async () => {
  await withHungProfileStop(async (release) => {
    const devtools = await fakeDevTools(() => {});
    const harness = await ChromeHarness.connect(devtools.url, { profileTimeouts: true });
    try {
      const command = harness.command("Never", {}, undefined, 60);
      const error = await command.then(
        () => { throw new Error("a timed-out command must not resolve"); },
        (rejection) => rejection,
      );
      assert.match(error.message, /^CDP timeout: Never \(elapsed \d+ms; limit 60ms\)$/);
      // The command has already rejected through the bounded read; close() must not wait for the inspector answer
      // that the fake never sends.
      const started = Date.now();
      const outcome = await Promise.race([
        harness.close().then(() => "closed"),
        new Promise((resolve) => setTimeout(() => resolve("hung"), 2_000)),
      ]);
      assert.equal(outcome, "closed", `close() waited ${Date.now() - started}ms behind the hung diagnostic read`);
    } finally {
      release();
      await devtools.close();
    }
  });
});

test("a profile read queued behind another times its window against the segment it was taken from (RAC-1451)", async () => {
  await withDelayedProfileStop(80, async () => {
    await withHarness(() => {}, { profileTimeouts: true }, async (harness) => {
      const first = harness.command("FirstSlow", {}, undefined, 30).catch((error) => error);
      await new Promise((resolve) => setTimeout(resolve, 40));
      const second = harness.command("SecondSlow", {}, undefined, 30).catch((error) => error);
      const [firstError, secondError] = await Promise.all([first, second]);
      assert.equal(firstError.diagnostics.nodeSelfTimeComplete, true);
      assert.equal(secondError.diagnostics.nodeSelfTimeComplete, false,
        "the second window started before the segment its profile came from");
    });
  });
});

test("a timeout is still a timeout: the limit, the message and the requests do not change (RAC-1452)", async () => {
  // A reply that arrives after the limit is dropped: the timeout already happened and its error does not change.
  await withHarness((message, reply) => {
    if (message.method === "Never") {
      setTimeout(() => reply({ result: { late: true } }), 250);
      return;
    }
    reply({ result: {} });
  }, {}, async (harness, devtools) => {
    assert.equal(harness.commandTimeoutMs, 20_000);
    await harness.command("Ping");
    const started = Date.now();
    await assert.rejects(harness.command("Never", {}, undefined, 120), (error) => {
      assert.match(error.message, /^CDP timeout: Never \(elapsed \d+ms; limit 120ms\)$/);
      return true;
    });
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 120 && elapsed <= 370, `failed after ${elapsed}ms`);
    // The late reply settles nothing: the command after it still works, and the timeout added no requests.
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.deepEqual(await harness.command("Ping"), {});
    assert.equal(devtools.received.length, 3, "only the three commands were sent to Chrome: the timeout adds no requests");
  });

  // An unexpected disconnect fails the commands in flight the way it does today.
  await withHarness((message, reply) => {
    if (message.method !== "Hang") reply({ result: {} });
  }, {}, async (harness, devtools) => {
    await harness.command("Ping");
    const pending = harness.command("Hang", {}, undefined, 5_000);
    await new Promise((resolve) => setTimeout(resolve, 20));
    devtools.dropConnections();
    await assert.rejects(pending, /CDP connection closed/);
  });

  // Calling close() after the limit passed but before the deferred decision runs drops the command: it is not settled.
  await withHarness(() => {}, {}, async (harness) => {
    let outcome = "pending";
    const command = harness.command("Never", {}, undefined, 50);
    const settled = command.then(() => { outcome = "resolved"; }, () => { outcome = "rejected"; });
    // Hold the loop until both 50 ms timers are due in one timers pass: the command's timer (registered first) yields
    // to the check phase, then close() runs in the same timers pass and clears pending before that phase.
    const hold = new Promise((resolve) => setTimeout(() => {
      const until = Date.now() + 40;
      while (Date.now() < until) { /* hold the timers pass until both timers are due together */ }
      resolve();
    }, 30));
    const closed = new Promise((resolve) => {
      setTimeout(() => { resolve(harness.close().then(() => "closed", () => "closed")); }, 50);
    });
    await hold;
    const raced = await Promise.race([
      settled.then(() => outcome),
      closed,
      new Promise((resolve) => setTimeout(() => resolve("pending"), 500)),
    ]);
    assert.equal(raced, "closed", "close() ran before the command settled");
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(outcome, "pending", "close() drops pending work without settling it");
  });
});

test("the default command limit comes from the options", async () => {
  await withHarness(() => {}, { commandTimeoutMs: 120 }, async (harness) => {
    const started = Date.now();
    await assert.rejects(harness.command("Never"), /CDP timeout: Never/);
    assert.ok(Date.now() - started < 2_000);
  });
});

test("on() keeps seeing events until it is switched off, and event() resolves once for the first match", async () => {
  await withHarness((message, reply, push) => {
    if (message.method === "Burst") {
      push({ method: "Page.tick", params: { n: 1 }, sessionId: "s" });
      push({ method: "Page.tick", params: { n: 2 } });
      push({ method: "Page.tick", params: { n: 3 } });
    }
    reply({ result: {} });
  }, {}, async (harness) => {
    const seen = [];
    const off = harness.on("Page.tick", (params, sessionId) => seen.push([params.n, sessionId]));
    const second = harness.event("Page.tick", (params) => params.n === 2);
    await harness.command("Burst");
    assert.deepEqual(await second, { n: 2 });
    assert.deepEqual(seen, [[1, "s"], [2, undefined], [3, undefined]]);
    off();
    await harness.command("Burst");
    assert.equal(seen.length, 3);
  });
});

test("event() rejects at its own limit and stops listening", async () => {
  await withHarness((message, reply) => reply({ result: {} }), {}, async (harness) => {
    const started = Date.now();
    await assert.rejects(harness.event("Page.never", () => true, 120), /CDP event timeout: Page\.never/);
    assert.ok(Date.now() - started < 2_000);
  });
});

test("a connection that drops fails what is waiting at once, and closing on purpose settles nothing", async () => {
  const devtools = await fakeDevTools(() => {});
  const harness = await ChromeHarness.connect(devtools.url, { commandTimeoutMs: 30_000 });
  try {
    const command = harness.command("Slow");
    const event = harness.event("Page.never", () => true, 30_000);
    const outcomes = Promise.allSettled([command, event]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    devtools.dropConnections();
    const [first, second] = await outcomes;
    assert.match(String(first.reason), /CDP connection closed/);
    assert.match(String(second.reason), /CDP connection closed/);
    await assert.rejects(harness.command("After"), /CDP connection closed/);
  } finally { await harness.close(); await devtools.close(); }
  // A command left waiting when the test ends is dropped without a late rejection.
  const quiet = await fakeDevTools(() => {});
  const other = await ChromeHarness.connect(quiet.url, { commandTimeoutMs: 100 });
  const left = other.command("Left");
  let settled = false;
  left.then(() => { settled = true; }, () => { settled = true; });
  await other.close();
  await new Promise((resolve) => setTimeout(resolve, 250));
  await quiet.close();
  assert.equal(settled, false);
});

/** Runs the script `ChromePage.wait` sends with `document` as the test describes it, like the page would. */
function pageRuntime(document) {
  return async (expression) => {
    const context = vm.createContext({ document, Date, setTimeout, Promise, Error, String });
    try { return { result: { result: { value: await vm.runInContext(expression, context) } } }; }
    catch (error) {
      return { result: { result: { type: "object" }, exceptionDetails: { text: "Uncaught (in promise)", exception: { description: String(error.stack || error) } } } };
    }
  };
}

test("page.wait polls in the page, and a timeout names the expression and appends the describe text", async () => {
  const document = { state: "loading" };
  const run = pageRuntime(document);
  await withHarness((message, reply) => {
    if (message.method === "Target.createTarget") reply({ result: { targetId: "target-1" } });
    else if (message.method === "Target.attachToTarget") reply({ result: { sessionId: "session-1" } });
    else if (message.method === "Runtime.evaluate") void run(message.params.expression).then(reply);
    else reply({ result: {} });
  }, {}, async (harness, devtools) => {
    const page = await harness.page();
    assert.equal(page.sessionId, "session-1");
    assert.equal(page.targetId, "target-1");
    const sentSession = () => devtools.received.at(-1).sessionId;
    setTimeout(() => { document.state = "ready"; }, 80);
    await page.wait("document.state === 'ready'", { timeoutMs: 2_000, pollMs: 10 });
    assert.equal(sentSession(), "session-1");
    // The describe text of the call wins over the harness default; both are page expressions.
    await assert.rejects(page.wait("document.state === 'never'", { timeoutMs: 100, pollMs: 10, describe: "'state=' + document.state" }),
      /DOM timeout: document\.state === 'never'; state=ready/);
    // Without any describe text the message ends at the expression.
    await assert.rejects(page.wait("document.state === 'never'", { timeoutMs: 100, pollMs: 10 }),
      (error) => /DOM timeout: document\.state === 'never'/.test(error.message) && !/DOM timeout: document\.state === 'never';/.test(error.message));
  });
});

test("the harness-wide describe text is appended unless the call gives its own, and a describe that throws is reported", async () => {
  const document = { status: "building" };
  const run = pageRuntime(document);
  await withHarness((message, reply) => {
    if (message.method === "Target.attachToTarget") reply({ result: { sessionId: "s" } });
    else if (message.method === "Runtime.evaluate") void run(message.params.expression).then(reply);
    else reply({ result: {} });
  }, { describe: "'status=' + document.status" }, async (harness) => {
    const page = await harness.page("existing-target");
    assert.equal(page.targetId, "existing-target");
    await assert.rejects(page.wait("false", { timeoutMs: 60, pollMs: 10 }), /DOM timeout: false; status=building/);
    await assert.rejects(page.wait("false", { timeoutMs: 60, pollMs: 10, describe: "document.missing.deep" }), /DOM timeout: false; describe failed: /);
  });
});

test("a wait longer than the command limit still gets the time it asked for", async () => {
  await withHarness((message, reply) => {
    if (message.method === "Target.attachToTarget") reply({ result: { sessionId: "s" } });
    else if (message.method === "Runtime.evaluate") setTimeout(() => reply({ result: { result: { value: true } } }), 250);
    else reply({ result: {} });
  }, { commandTimeoutMs: 100 }, async (harness) => {
    const page = await harness.page("t");
    // The evaluation takes 250 ms; the 100 ms command limit would reject it, the wait's own limit (plus margin) must not.
    await page.wait("true", { timeoutMs: 1_000 });
  });
});

test("an evaluation that throws in the page fails with the exception details", async () => {
  await withHarness((message, reply) => {
    if (message.method === "Target.attachToTarget") reply({ result: { sessionId: "s" } });
    else reply({ result: { result: {}, exceptionDetails: { text: "Uncaught", exception: { description: "ReferenceError: nope" } } } });
  }, {}, async (harness) => {
    const page = await harness.page("t");
    await assert.rejects(page.evaluate("nope"), /ReferenceError: nope/);
  });
});
