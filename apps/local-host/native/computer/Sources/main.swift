import Cocoa
import ApplicationServices

/*
 * Molis Work Computer Helper (specs/computer-use).
 *
 * The one process on this Mac that looks at other apps and moves the mouse and keyboard for the Assistant. It decides
 * nothing: local-host's desktop driver says what to look at and what to do, Prologue's policy and the person's approval
 * come before any of it. The helper only does it, refuses what it can see is unsafe at the last moment (a covered
 * landing point, a password field, the person's hands on the input), and reports what the person does with the input
 * and whether the screen is locked.
 *
 * It is an app of its own, launched through LaunchServices, so macOS attributes Screen Recording, Accessibility and
 * Input Monitoring to "Molis Work Computer Helper" whichever way local-host was started (desktop app, LaunchAgent,
 * terminal). It speaks JSON lines over the Unix socket local-host opened, and exits when that socket closes.
 */

let HELPER_VERSION = "1"

/// Every event this helper posts carries this in `eventSourceUserData`, so its own input is never taken for the person's.
let SYNTHETIC_MARKER: Int64 = 0x4D4F_4C49_5357 // "MOLISW"

struct HelperError: Error {
    let code: String
    let message: String
    let partial: Bool?
    init(_ code: String, _ message: String, partial: Bool? = nil) { self.code = code; self.message = message; self.partial = partial }
}

final class Channel {
    private let fd: Int32
    private let input: Input
    private let writeLock = NSLock()
    private var closed = false
    var isClosed: Bool { writeLock.lock(); defer { writeLock.unlock() }; return closed }

    init(path: String, input: Input = .shared) throws {
        self.input = input
        fd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { throw HelperError("helper.socket", "socket() failed") }
        var noPipe: Int32 = 1
        guard setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &noPipe, socklen_t(MemoryLayout<Int32>.size)) == 0 else { throw HelperError("helper.socket", "cannot disable SIGPIPE") }
        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        let bytes = Array(path.utf8)
        guard bytes.count < MemoryLayout.size(ofValue: address.sun_path) else { throw HelperError("helper.socket", "socket path too long") }
        withUnsafeMutableBytes(of: &address.sun_path) { raw in
            raw.copyBytes(from: bytes)
            raw[bytes.count] = 0
        }
        let size = socklen_t(MemoryLayout<sockaddr_un>.size)
        let result = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(fd, $0, size) }
        }
        guard result == 0 else { throw HelperError("helper.socket", "connect() failed: \(errno)") }
    }

    func send(_ message: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: message, options: []) else { return }
        writeLock.lock()
        defer { writeLock.unlock() }
        if closed { return }
        var line = data
        line.append(0x0A)
        line.withUnsafeBytes { raw in
            var offset = 0
            while offset < raw.count {
                let written = write(fd, raw.baseAddress!.advanced(by: offset), raw.count - offset)
                if written <= 0 { return }
                offset += written
            }
        }
    }

    /// Reads lines until local-host closes the socket; then the helper has nothing left to serve and exits.
    func readLines(_ handle: @escaping ([String: Any]) -> Void) {
        var buffer = Data()
        var chunk = [UInt8](repeating: 0, count: 65_536)
        while true {
            let count = read(fd, &chunk, chunk.count)
            if count <= 0 { break }
            buffer.append(chunk, count: count)
            while let newline = buffer.firstIndex(of: 0x0A) {
                let line = buffer.subdata(in: buffer.startIndex..<newline)
                buffer.removeSubrange(buffer.startIndex...newline)
                if let object = try? JSONSerialization.jsonObject(with: line) as? [String: Any] { handle(object) }
            }
        }
        input.disconnect()
        writeLock.lock(); closed = true; writeLock.unlock()
        // The current serial request releases its own held gesture before orderly EOF exits the helper.
        work.async { exit(0) }
    }
}

/// Requests run one at a time, in order, off the main thread (which keeps the input monitor and presence watch).
let work = DispatchQueue(label: "molis.computer.work")
var channel: Channel?

func respond(_ id: Any, _ body: () throws -> Any) {
    do {
        channel?.send(["id": id, "ok": true, "result": try body()])
    } catch let error as HelperError {
        var failure: [String: Any] = ["code": error.code, "message": error.message]
        if let partial = error.partial { failure["partial"] = partial }
        channel?.send(["id": id, "ok": false, "error": failure])
    } catch {
        channel?.send(["id": id, "ok": false, "error": ["code": "helper.failed", "message": String(describing: error)]])
    }
}

func handle(_ request: [String: Any]) {
    guard let id = request["id"], let op = request["op"] as? String else { return }
    let params = request["params"] as? [String: Any] ?? [:]
    work.async {
        if channel?.isClosed != false { return }
        respond(id) {
            switch op {
            case "status": return Presence.shared.status()
            case "permissions.request": return try Presence.shared.request(params.string("kind"))
            case "apps.running": return Observe.runningApps()
            case "apps.installed": return Observe.installedApps()
            case "app.open": return try Input.shared.openApp(params)
            case "app.state": return try Observe.appState(params.int32("pid"))
            case "observe.tree": return try Observe.tree(params.originalWindow(), maxNodes: params.optionalInt("max_nodes") ?? 600)
            case "observe.screenshot":
                return try params.capture { try Observe.screenshot(pid: $0.pid, rect: params.rect("rect"), scale: params.optionalDouble("scale") ?? 1, expected: $0) }
            case "observe.ocr":
                return try params.capture { try Observe.ocr(pid: $0.pid, rect: params.rect("rect"), scale: params.optionalDouble("scale") ?? 2, expected: $0) }
            case "observe.menus": return try params.capture { try Observe.menus(pid: $0.pid, path: params.optionalStrings("path") ?? []) }
            case "probe.point": return try params.capture { _ in try Observe.probe(params.point("point")) }
            case "focused.field": return try Observe.focusedField(params.originalWindow())
            case "document": return try Observe.document(params.originalWindow())
            case "input.pointer": return try Input.shared.pointer(params)
            case "input.scroll": return try Input.shared.scroll(params)
            case "input.drag": return try Input.shared.drag(params)
            case "input.hover": return try Input.shared.hover(params)
            case "input.key": return try Input.shared.key(params)
            case "input.text": return try Input.shared.text(params)
            case "input.menu": return try Input.shared.menu(params)
            case "file.give": return try Input.shared.giveFile(params)
            case "monitor": Presence.shared.watchInput(params.optionalBool("on") ?? true); return ["watching": Presence.shared.watching]
            default: throw HelperError("helper.unknown_op", "unknown op \(op)")
            }
        }
    }
}

extension Dictionary where Key == String, Value == Any {
    func originalWindow() throws -> WindowTarget {
        guard let facts = self["expected_window"] as? [String: Any] else {
            throw HelperError("window.changed", "缺少原应用窗口")
        }
        return try WindowTarget(facts)
    }
    func originalWindowOrNone() throws -> WindowTarget? {
        if self["expected_window"] is NSNull { return nil }
        return try originalWindow()
    }
    func capture<T>(_ read: (WindowTarget) throws -> T) throws -> T {
        let target = try originalWindow()
        return try target.capture { try read(target) }
    }
    func string(_ name: String) throws -> String {
        guard let value = self[name] as? String, !value.isEmpty else { throw HelperError("helper.bad_params", "\(name) is required") }
        return value
    }
    func int32(_ name: String) throws -> pid_t {
        guard let value = self[name] as? NSNumber else { throw HelperError("helper.bad_params", "\(name) is required") }
        return value.int32Value
    }
    func optionalInt(_ name: String) -> Int? { (self[name] as? NSNumber)?.intValue }
    func optionalDouble(_ name: String) -> Double? { (self[name] as? NSNumber)?.doubleValue }
    func optionalBool(_ name: String) -> Bool? { (self[name] as? NSNumber)?.boolValue }
    func optionalStrings(_ name: String) -> [String]? { self[name] as? [String] }
    func double(_ name: String) throws -> Double {
        guard let value = self[name] as? NSNumber, value.doubleValue.isFinite else { throw HelperError("helper.bad_params", "\(name) must be a number") }
        return value.doubleValue
    }
    func point(_ name: String) throws -> CGPoint {
        guard let raw = self[name] as? [NSNumber], raw.count == 2 else { throw HelperError("helper.bad_params", "\(name) must be [x, y]") }
        return CGPoint(x: raw[0].doubleValue, y: raw[1].doubleValue)
    }
    func rect(_ name: String) throws -> CGRect {
        guard let raw = self[name] as? [NSNumber], raw.count == 4 else { throw HelperError("helper.bad_params", "\(name) must be [x, y, w, h]") }
        return CGRect(x: raw[0].doubleValue, y: raw[1].doubleValue, width: raw[2].doubleValue, height: raw[3].doubleValue)
    }
}

func emit(_ event: String, _ body: [String: Any]) {
    var message = body
    message["event"] = event
    channel?.send(message)
}

// MARK: - Start

let arguments = CommandLine.arguments
func argument(_ name: String) -> String? {
    guard let index = arguments.firstIndex(of: name), index + 1 < arguments.count else { return nil }
    return arguments[index + 1]
}

let application = NSApplication.shared
application.setActivationPolicy(.accessory)

if arguments.contains("--status") {
    // A one-shot report for diagnosis from a terminal (attributed to the terminal, not to this app).
    let data = try! JSONSerialization.data(withJSONObject: Presence.shared.status(), options: [.prettyPrinted, .sortedKeys])
    print(String(data: data, encoding: .utf8)!)
    exit(0)
}

guard let socketPath = argument("--socket") else {
    FileHandle.standardError.write("usage: computer-helper --socket <path> --token <token>\n".data(using: .utf8)!)
    exit(64)
}

do {
    channel = try Channel(path: socketPath)
} catch {
    FileHandle.standardError.write("cannot reach local-host: \(error)\n".data(using: .utf8)!)
    exit(69)
}
channel?.send(["event": "hello", "token": argument("--token") ?? "", "version": HELPER_VERSION, "pid": Int(getpid()),
               "bundle_id": Bundle.main.bundleIdentifier ?? "", "status": Presence.shared.status()])
Presence.shared.start()
Thread.detachNewThread { channel?.readLines(handle) }
application.run()
