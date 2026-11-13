import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);

test("APR-11 / S-25: the native input fence refuses replacements and releases only the original gesture", {
  skip: process.platform !== "darwin", timeout: 60_000,
}, async t => {
  const source = resolve("apps/local-host/native/computer/Sources"), scratch = await mkdtemp(join(tmpdir(), "molis-native-original-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const main = await readFile(join(source, "main.swift"), "utf8"), bootstrap = main.indexOf("// MARK: - Start");
  assert.ok(bootstrap > 0);
  // Use the native decoder and commit code with a controlled OS reader and event sinks.
  await writeFile(join(scratch, "main.swift"), main.slice(0, bootstrap) + String.raw`
func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() { fatalError(message) }
}
let frame = CGRect(x: 10, y: 20, width: 300, height: 200)
let original = WindowTarget(bundleId: "io.fixture.app", pid: 42, launchTime: 1, windowId: 17, frame: frame, titleHash: "original", focus: "first-field", documentHash: "first-doc")
func target(launch: Double = 1, window: Int = 17, frame: CGRect = frame, title: String = "original", focus: String? = "first-field", document: String = "first-doc", forbidden: Bool = false) -> WindowTarget {
    WindowTarget(bundleId: "io.fixture.app", pid: 42, launchTime: launch, windowId: window, frame: frame, titleHash: title, focus: focus, documentHash: document, forbidden: forbidden)
}
var live: WindowTarget? = original
var inputCount = 0
let input = Input(postEvent: { _ in inputCount += 1 }, releaseEvent: { _, _ in fatalError("no press to release") },
                  validateEnvironment: {}, readWindow: { _ in live })
let params: [String: Any] = ["pid": 42, "expected_window": original.wire]
for replacement in [target(window: 18), target(launch: 2), target(frame: frame.offsetBy(dx: 1, dy: 0)), target(title: "other"), target(focus: "other-field"), target(document: "other-doc"), target(forbidden: true), nil] {
    live = original
    do {
        try input.withWindow(params, focus: true) { _ in
            live = replacement
            try input.post(CGEvent(keyboardEventSource: nil, virtualKey: 1, keyDown: true))
        }
        fatalError("replacement target received input")
    } catch let error as HelperError {
        check(error.code == "window.changed" && error.partial == false, "replacement was refused before the first event")
    }
}
check(inputCount == 0, "no business input in any replacement")
do {
    try input.withWindow(["pid": 42]) { _ in fatalError("missing target started input") }
    fatalError("missing target accepted")
} catch let error as HelperError {
    check(error.code == "window.changed" && error.partial == false, "missing target is a proven refusal")
}
let match: [String: Any] = ["rect": frame, "layer": 0, "id": 17]
let overlap: [String: Any] = ["rect": frame, "layer": 0, "id": 18]
check(Observe.windowId(frame: frame, among: [match]) == 17, "one exact candidate")
check(Observe.windowId(frame: frame, among: [match, overlap]) == nil, "identical frames cannot pick another window")

live = original
var pressed: [CGEventType] = [], releases: [(CGEventType, pid_t)] = []
let gesture = Input(postEvent: { pressed.append($0.type) }, releaseEvent: { releases.append(($0.type, $1)) }, validateEnvironment: {})
do {
    try gesture.perform(42, validateTarget: { try original.check(read: { _ in live }) }) {
        try gesture.post(CGEvent(keyboardEventSource: nil, virtualKey: 1, keyDown: true))
        live = target(window: 18)
        try gesture.post(CGEvent(keyboardEventSource: nil, virtualKey: 1, keyDown: false))
    }
    fatalError("replacement consumed the normal key up")
} catch let error as HelperError {
    check(error.code == "window.changed" && error.partial == true, "an already posted press stays partial")
}
check(pressed == [.keyDown] && releases.count == 1 && releases[0].0 == .keyUp && releases[0].1 == 42,
      "only release the held original key")

live = original; pressed.removeAll(); releases.removeAll()
try gesture.perform(42, validateTarget: { try original.check(read: { _ in live }) }) {
    try gesture.post(CGEvent(keyboardEventSource: nil, virtualKey: 48, keyDown: true), flags: .maskShift)
    live = target(focus: "after-tab")
    try gesture.releaseKey(42, canRelease: { live?.launchTime == original.launchTime })
}
check(pressed == [.keyDown] && releases.count == 1 && releases[0].0 == .keyUp && releases[0].1 == 42,
      "a key that moved focus finishes using only its original process release")

live = original
var fingerprint = "save"
let pointer = Input(postEvent: { _ in fatalError("changed control received input") }, validateEnvironment: {}, readWindow: { _ in live }, probePoint: { _ in
    ["window": ["pid": 42, "id": 17], "element": ["pid": 42, "fingerprint": fingerprint]]
})
let point = CGPoint(x: 20, y: 40)
try pointer.land(point, original, control: "save")
fingerprint = "send"
do {
    try pointer.withWindow(params) { target in
        try pointer.commit(check: { try pointer.land(point, target, control: "save") }) { fatalError("replacement was not refused") }
    }
} catch let error as HelperError {
    check(error.code == "window.changed" && error.partial == false, "a riskier same-window control refuses before input")
}

let file: [String: Any] = ["pid": 42, "expected_window": original.wire, "path": "/isolated/fixture.txt"]
var deliveries: [pid_t] = []
for outcome in ["unavailable", "replaced", "unknown", "accepted"] {
    live = original
    let delivery = Input(validateEnvironment: {}, readWindow: { _ in live }, prepareFile: { pid, _ in
        if outcome == "unavailable" { throw HelperError("file.delivery_unavailable", "permission refused") }
        if outcome == "replaced" { live = target(launch: 2) }
        return {
            deliveries.append(pid)
            if outcome == "unknown" { throw HelperError("file.delivery_failed", "original reply lost") }
            return ["accepted": true]
        }
    })
    do {
        let result = try delivery.giveFile(file)
        check(outcome == "accepted" && result["accepted"] as? Bool == true, "only the accepted original delivery succeeds")
    } catch let error as HelperError {
        if outcome == "unavailable" { check(error.code == "file.delivery_unavailable" && error.partial == false, "permission refused before send") }
        else if outcome == "replaced" { check(error.code == "window.changed" && error.partial == false, "process changed before send") }
        else { check(outcome == "unknown" && error.code == "file.delivery_failed" && error.partial == true, "lost reply remains unknown") }
    }
}
check(deliveries == [42, 42], "only the original process gets the accepted and unknown sends")
`);
  const executable = join(scratch, "original-window");
  await run("/usr/bin/xcrun", ["swiftc", "-swift-version", "5", "-module-cache-path", join(scratch, "cache"),
    join(scratch, "main.swift"), join(source, "Input.swift"), join(source, "Observe.swift"), join(source, "Presence.swift"), "-o", executable]);
  await run(executable);
});
