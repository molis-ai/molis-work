import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);

test("APR-11: native interrupted gestures release only their own pressed key or button to the original process", { skip: process.platform !== "darwin", timeout: 60_000 }, async t => {
  const root = resolve("apps/local-host/native/computer/Sources"), home = await mkdtemp(join(tmpdir(), "molis-native-gesture-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const source = await readFile(join(root, "main.swift"), "utf8"), start = source.indexOf("// MARK: - Start");
  assert.ok(start > 0);
  // Keep the real helper definitions and every production source; replace only the app/socket bootstrap with this entry.
  // Both event sinks are captured, so this executable never posts operating-system input or opens the real helper.
  await writeFile(join(home, "main.swift"), source.slice(0, start) + String.raw`
func check(_ condition: @autoclosure () -> Bool, _ detail: String) {
    if !condition() { fatalError(detail) }
}
func interrupted(_ type: CGEventType, _ expected: CGEventType) throws {
    var sent: [CGEvent] = [], releases: [(CGEvent, pid_t)] = []
    var input: Input!
    input = Input(postEvent: { event in sent.append(event) },
                  releaseEvent: { event, pid in releases.append((event, pid)) }, validateEnvironment: {})
    let down: CGEvent?
    if type == .keyDown {
        down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true)
        let text: [UniChar] = [0x79d8, 0x5bc6]
        text.withUnsafeBufferPointer { down?.keyboardSetUnicodeString(stringLength: text.count, unicodeString: $0.baseAddress) }
    } else {
        let button: CGMouseButton = type == .rightMouseDown ? .right : type == .otherMouseDown ? .center : .left
        down = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: CGPoint(x: 10, y: 20), mouseButton: button)
        down?.setIntegerValueField(.mouseEventClickState, value: 3)
    }
    var refused = false
    do {
        try input.perform(24680) {
            try input.post(down, flags: [.maskCommand])
            input.personTouched()
            try input.post(CGEvent(keyboardEventSource: nil, virtualKey: 3, keyDown: true))
        }
    } catch let error as HelperError { refused = error.code == "person.present"; check(error.partial == true, "the original press remains a partial effect") }
    check(refused, "the original checkpoint must refuse")
    check(sent.count == 1 && releases.count == 1, "no later business input; exactly one cleanup")
    let (release, pid) = releases[0]
    check(pid == 24680 && release.type == expected, "only the original gesture and process")
    check(release.flags.isEmpty, "cleanup cannot repeat a shortcut")
    check(release.getIntegerValueField(.eventSourceUserData) == SYNTHETIC_MARKER, "cleanup remains synthetic")
    if type == .keyDown {
        var count = 0
        var units = [UniChar](repeating: 0, count: 16)
        release.keyboardGetUnicodeString(maxStringLength: 16, actualStringLength: &count, unicodeString: &units)
        // CoreGraphics reports the key's default character even on a fresh keyUp without explicit Unicode.
        // Compare with that independent OS event; copying the original two-character payload must fail.
        let bare = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false)!
        var bareCount = 0
        var bareUnits = [UniChar](repeating: 0, count: 16)
        bare.keyboardGetUnicodeString(maxStringLength: 16, actualStringLength: &bareCount, unicodeString: &bareUnits)
        check(count == bareCount && Array(units.prefix(count)) == Array(bareUnits.prefix(bareCount)), "cleanup cannot carry original typed text")
        check(Array(units.prefix(count)) != [0x79d8, 0x5bc6], "explicit original Unicode must not survive")
    } else {
        check(release.location == CGPoint(x: -1, y: -1), "cleanup cannot click the approved or replacement point")
        check(release.getIntegerValueField(.mouseEventClickState) == 0, "cleanup has no click count")
    }
    // A completed pair in a later call does not inherit the prior failed gesture.
    var cleanSent = 0, cleanReleased = 0
    let clean = Input(postEvent: { _ in cleanSent += 1 }, releaseEvent: { _, _ in cleanReleased += 1 }, validateEnvironment: {})
    try clean.perform(24681) {
        try clean.post(CGEvent(keyboardEventSource: nil, virtualKey: 1, keyDown: true))
        try clean.post(CGEvent(keyboardEventSource: nil, virtualKey: 1, keyDown: false))
    }
    check(cleanSent == 2 && cleanReleased == 0, "successful up is not repeated")
}
if CommandLine.arguments.count > 1 {
    var sent = 0, released = 0
    let input = Input(postEvent: { _ in sent += 1; channel?.send(["event": "pressed"]) }, releaseEvent: { event, pid in
        check(event.type == .keyUp && event.flags.isEmpty && pid == 24683, "EOF releases only the held original key")
        released += 1
    }, validateEnvironment: {})
    channel = try Channel(path: CommandLine.arguments[1], input: input)
    let brokenPipe = CommandLine.arguments.last == "pipe"
    if !brokenPipe { DispatchQueue.global().async { channel!.readLines(handle) } }
    work.async {
        if brokenPipe {
            do {
                try input.perform(24683) {
                    try input.post(CGEvent(keyboardEventSource: nil, virtualKey: 2, keyDown: true))
                    Thread.sleep(forTimeInterval: 0.1)
                    channel?.send(["event": "after-closed-peer"])
                    throw HelperError("test.stop", "stop the original gesture")
                }
            } catch { /* the original input's defer must still run after EPIPE */ }
            check(sent == 1 && released == 1, "SIGPIPE cannot bypass original gesture cleanup")
            FileHandle.standardOutput.write(Data("broken-pipe-cleaned\n".utf8))
            exit(0)
        }
        if CommandLine.arguments.count > 2 {
            check(!channel!.isClosed, "request already dequeued")
            channel?.send(["event": "ready-before-perform"])
            while !channel!.isClosed { Thread.sleep(forTimeInterval: 0.001) }
            do { try input.perform(24683) { try input.post(CGEvent(keyboardEventSource: nil, virtualKey: 2, keyDown: true)) }; fatalError("closed input restarted") }
            catch let error as HelperError { check(error.code == "helper.closed" && error.partial == false, "dequeued request never started input") }
            catch { fatalError("unexpected initial EOF failure") }
            var committed = false
            do { try input.commit { committed = true }; fatalError("closed input accepted AX effect") }
            catch let error as HelperError { check(error.code == "helper.closed", "AX effect is refused after EOF") }
            catch { fatalError("unexpected AX refusal") }
            check(sent == 0 && released == 0 && !committed, "EOF before perform has zero effect")
            FileHandle.standardOutput.write(Data("eof-before-input-refused\n".utf8))
            return
        }
        do {
            try input.perform(24683) {
                try input.post(CGEvent(keyboardEventSource: nil, virtualKey: 2, keyDown: true), flags: [.maskCommand])
                while !channel!.isClosed { Thread.sleep(forTimeInterval: 0.001) }
                try input.post(CGEvent(keyboardEventSource: nil, virtualKey: 3, keyDown: true))
            }
            fatalError("EOF did not refuse the next input")
        } catch let error as HelperError {
            check(error.code == "helper.closed" && error.partial == true, "EOF preserves the partial original press")
        } catch { fatalError("unexpected EOF failure") }
        check(sent == 1 && released == 1, "current request drains cleanup before process exit")
        FileHandle.standardOutput.write(Data("eof-cleanup-drained\n".utf8))
    }
    dispatchMain()
}
try interrupted(.keyDown, .keyUp)
try interrupted(.leftMouseDown, .leftMouseUp)
try interrupted(.rightMouseDown, .rightMouseUp)
try interrupted(.otherMouseDown, .otherMouseUp)
var refusedSent = 0, refusedReleases = 0
let stopped = Input(postEvent: { _ in refusedSent += 1 }, releaseEvent: { _, _ in refusedReleases += 1 }, validateEnvironment: {})
do {
    try stopped.perform(24682) {
        stopped.personTouched()
        try stopped.post(CGEvent(keyboardEventSource: nil, virtualKey: 2, keyDown: true))
    }
} catch let error as HelperError { check(error.code == "person.present" && error.partial == false, "initial checkpoint proves no effect") }
check(refusedSent == 0 && refusedReleases == 0, "no cleanup before a press")
var environmentAllowed = true, environmentalEffects = 0, environmentalReleases = 0
let environment = Input(postEvent: { _ in environmentalEffects += 1 }, releaseEvent: { _, _ in environmentalReleases += 1 }, validateEnvironment: {
    if !environmentAllowed { throw HelperError("permission.input_monitoring", "permission revoked before actual input") }
})
do {
    try environment.perform(24684) {
        environmentAllowed = false
        try environment.commit { environmentalEffects += 1 }
    }
    fatalError("revoked permission allowed an AX effect")
} catch let error as HelperError { check(error.code == "permission.input_monitoring" && error.partial == false, "current environment refused before any effect") }
check(environmentalEffects == 0 && environmentalReleases == 0, "no output before environment permission")
environmentAllowed = true
do {
    try environment.perform(24684) {
        try environment.post(CGEvent(keyboardEventSource: nil, virtualKey: 2, keyDown: true))
        environmentAllowed = false
        try environment.post(CGEvent(keyboardEventSource: nil, virtualKey: 3, keyDown: true))
    }
} catch let error as HelperError { check(error.code == "permission.input_monitoring" && error.partial == true, "permission loss after press remains partial") }
check(environmentalEffects == 1 && environmentalReleases == 1, "cleanup of our original press survives revoked permissions")
print("original-gesture-refusals-passed")
`);
  const binary = join(home, "gesture-test");
  await run(process.execPath, ["scripts/machine-slot.mjs", "run", "build", "--label", "batch39-native-gesture", "--", "swiftc", "-swift-version", "5",
    "-framework", "Cocoa", "-framework", "ApplicationServices", "-framework", "ScreenCaptureKit", "-framework", "Carbon", "-framework", "Vision",
    join(home, "main.swift"), ...["Input.swift", "Observe.swift", "Presence.swift"].map(name => join(root, name)), "-o", binary], { timeout: 40_000, maxBuffer: 1_000_000 });
  const output = await run(binary, [], { timeout: 10_000 });
  assert.equal(output.stdout.trim(), "original-gesture-refusals-passed");
  const socketPath = join(home, "eof.sock"), frames: string[] = [];
  let breakPeer = false;
  const server = createServer(socket => {
    let buffer = "";
    socket.on("data", bytes => {
      buffer += bytes.toString();
      for (let at = buffer.indexOf("\n"); at >= 0; at = buffer.indexOf("\n")) {
        const line = buffer.slice(0, at); buffer = buffer.slice(at + 1); frames.push(line);
        if (["pressed", "ready-before-perform"].includes(JSON.parse(line).event)) {
          if (breakPeer) socket.destroy(); else socket.end(JSON.stringify({ id: 99, op: "status" }) + "\n");
        }
      }
    });
  });
  server.listen(socketPath); await once(server, "listening");
  try {
    const eof = await run(binary, [socketPath], { timeout: 10_000 });
    assert.equal(eof.stdout.trim(), "eof-cleanup-drained");
    assert.deepEqual(frames.map(line => JSON.parse(line)), [{ event: "pressed" }]);
    frames.length = 0;
    const before = await run(binary, [socketPath, "before"], { timeout: 10_000 });
    assert.equal(before.stdout.trim(), "eof-before-input-refused");
    assert.deepEqual(frames.map(line => JSON.parse(line)), [{ event: "ready-before-perform" }]);
    breakPeer = true; frames.length = 0;
    const pipe = await run(binary, [socketPath, "pipe"], { timeout: 10_000 });
    assert.equal(pipe.stdout.trim(), "broken-pipe-cleaned");
    assert.deepEqual(frames.map(line => JSON.parse(line)), [{ event: "pressed" }]);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }

});
