import Cocoa
import ApplicationServices

/// Whether the person is there and whether this helper may look and act at all: system permissions, a locked screen,
/// a running screen saver, sleeping displays, another user at the console, and the person's own mouse and keyboard.
final class Presence {
    static let shared = Presence()

    private let stateLock = NSLock()
    private var savedScreensaver = false, savedDisplaysAsleep = false
    private var savedModifierFlags: CGEventFlags = []
    private static let modifierMask: CGEventFlags = [.maskAlphaShift, .maskShift, .maskControl, .maskAlternate, .maskCommand, .maskSecondaryFn]
    private var savedTap: CFMachPort?
    private var screensaver: Bool {
        get { stateLock.lock(); defer { stateLock.unlock() }; return savedScreensaver }
        set { stateLock.lock(); savedScreensaver = newValue; stateLock.unlock() }
    }
    private var displaysAsleep: Bool {
        get { stateLock.lock(); defer { stateLock.unlock() }; return savedDisplaysAsleep }
        set { stateLock.lock(); savedDisplaysAsleep = newValue; stateLock.unlock() }
    }
    private var tap: CFMachPort? {
        get { stateLock.lock(); defer { stateLock.unlock() }; return savedTap }
        set { stateLock.lock(); savedTap = newValue; stateLock.unlock() }
    }
    private var lastReported: [String: Any] = [:]
    var watching: Bool {
        guard let tap else { return false }
        return CFMachPortIsValid(tap) && CGEvent.tapIsEnabled(tap: tap) && CGPreflightListenEventAccess()
    }
    private var lastMoveReport = 0.0

    func permissions() -> [String: Bool] {
        ["accessibility": AXIsProcessTrusted(), "screen_recording": CGPreflightScreenCaptureAccess(),
         "input_monitoring": CGPreflightListenEventAccess()]
    }

    /// Called on the input queue, without main.sync or an OS prompt; the host's last status is not current authority.
    func assertInputReady() throws {
        for (name, allowed) in permissions() where !allowed { throw HelperError("permission.\(name)", "系统权限已被收回") }
        let state = presence()
        if state["locked"] as? Bool == true || state["screensaver"] as? Bool == true || state["displays_asleep"] as? Bool == true
            || state["on_console"] as? Bool != true || (state["idle_seconds"] as? Double ?? 0) > 600 {
            throw HelperError("presence.unavailable", "当前用户不在可操作的电脑前")
        }
        guard watching else {
            emit("watch_failed", [:])
            throw HelperError("monitor.unavailable", "原输入监视已不可用")
        }
    }

    func presence() -> [String: Any] {
        let session = CGSessionCopyCurrentDictionary() as? [String: Any] ?? [:]
        let locked = (session["CGSSessionScreenIsLocked"] as? NSNumber)?.boolValue ?? false
        let onConsole = (session[kCGSessionOnConsoleKey as String] as? NSNumber)?.boolValue ?? true
        let idle = CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: CGEventType(rawValue: ~0)!)
        return ["locked": locked, "screensaver": screensaver, "displays_asleep": displaysAsleep, "on_console": onConsole,
                "idle_seconds": idle.isFinite ? (idle * 10).rounded() / 10 : 0]
    }

    func status() -> [String: Any] {
        ["version": HELPER_VERSION, "pid": Int(getpid()), "bundle_id": Bundle.main.bundleIdentifier ?? "",
         "permissions": permissions(), "presence": presence(), "watching": watching,
         "last_synthetic": Input.shared.lastSynthetic, "displays": NSScreen.screens.map { screen -> [String: Any] in
            ["frame": rectArray(screen.frame), "scale": Double(screen.backingScaleFactor)] }]
    }

    /// Opens the system prompt and the matching pane of System Settings, at the person's request from Molis Work.
    func request(_ kind: String) throws -> [String: Any] {
        let pane: String
        switch kind {
        case "accessibility":
            _ = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
            pane = "Privacy_Accessibility"
        case "screen_recording":
            _ = CGRequestScreenCaptureAccess()
            pane = "Privacy_ScreenCapture"
        case "input_monitoring":
            _ = CGRequestListenEventAccess()
            pane = "Privacy_ListenEvent"
        default:
            throw HelperError("helper.bad_params", "unknown permission \(kind)")
        }
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(pane)") {
            DispatchQueue.main.async { NSWorkspace.shared.open(url) }
        }
        return ["requested": kind, "permissions": permissions()]
    }

    func start() {
        let distributed = DistributedNotificationCenter.default()
        distributed.addObserver(forName: Notification.Name("com.apple.screensaver.didstart"), object: nil, queue: .main) { _ in self.screensaver = true; self.report() }
        distributed.addObserver(forName: Notification.Name("com.apple.screensaver.didstop"), object: nil, queue: .main) { _ in self.screensaver = false; self.report() }
        distributed.addObserver(forName: Notification.Name("com.apple.screenIsLocked"), object: nil, queue: .main) { _ in self.report() }
        distributed.addObserver(forName: Notification.Name("com.apple.screenIsUnlocked"), object: nil, queue: .main) { _ in self.report() }
        let workspace = NSWorkspace.shared.notificationCenter
        workspace.addObserver(forName: NSWorkspace.screensDidSleepNotification, object: nil, queue: .main) { _ in self.displaysAsleep = true; self.report() }
        workspace.addObserver(forName: NSWorkspace.screensDidWakeNotification, object: nil, queue: .main) { _ in self.displaysAsleep = false; self.report() }
        workspace.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { note in
            let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            emit("front", ["pid": Int(app?.processIdentifier ?? 0), "bundle_id": app?.bundleIdentifier ?? ""])
        }
        workspace.addObserver(forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main) { note in
            let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            emit("app_exit", ["pid": Int(app?.processIdentifier ?? 0), "bundle_id": app?.bundleIdentifier ?? ""])
        }
        // Lock state and permissions also change without a notification (a permission revoked in System Settings).
        Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            self.report()
            if !self.watching && self.wantWatching { self.watchInput(true) }
        }
        report()
    }

    private func report() {
        let now: [String: Any] = ["presence": presence().filter { $0.key != "idle_seconds" }, "permissions": permissions(), "watching": watching]
        if !NSDictionary(dictionary: now).isEqual(to: lastReported) {
            lastReported = now
            emit("status", status())
        }
    }

    private var wantWatching = false

    /// Listens (never alters) to the person's mouse and keyboard. Events this helper posted carry its marker and are skipped.
    func watchInput(_ on: Bool) {
        let update = {
            self.wantWatching = on
            if !on {
                if let tap = self.tap { CGEvent.tapEnable(tap: tap, enable: false) }
                self.tap = nil
                return
            }
            if !CGPreflightListenEventAccess() {
                if let tap = self.tap { CGEvent.tapEnable(tap: tap, enable: false) }
                self.tap = nil
                return
            }
            if let tap = self.tap, CFMachPortIsValid(tap), CGEvent.tapIsEnabled(tap: tap) { return }
            self.tap = nil
            let types: [CGEventType] = [.mouseMoved, .leftMouseDown, .rightMouseDown, .otherMouseDown, .leftMouseDragged,
                                        .rightMouseDragged, .scrollWheel, .keyDown, .flagsChanged]
            let mask = types.reduce(CGEventMask(0)) { $0 | (CGEventMask(1) << CGEventMask($1.rawValue)) }
            let callback: CGEventTapCallBack = { _, type, event, _ in
                Presence.shared.saw(type, event)
                return Unmanaged.passUnretained(event)
            }
            guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .tailAppendEventTap, options: .listenOnly,
                                              eventsOfInterest: mask, callback: callback, userInfo: nil) else {
                emit("watch_failed", ["permissions": self.permissions()])
                return
            }
            let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
            CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
            CGEvent.tapEnable(tap: tap, enable: true)
            self.tap = tap
        }
        if Thread.isMainThread { update() } else { DispatchQueue.main.sync(execute: update) }
    }

    func saw(_ type: CGEventType, _ event: CGEvent) {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
            return
        }
        if event.getIntegerValueField(.eventSourceUserData) == SYNTHETIC_MARKER { return }
        if type == .flagsChanged {
            let modifiers = event.flags.intersection(Presence.modifierMask)
            stateLock.lock()
            let unchanged = modifiers == savedModifierFlags
            savedModifierFlags = modifiers
            stateLock.unlock()
            if unchanged { return }
        }
        Input.shared.personTouched()
        let now = Date().timeIntervalSince1970
        let kind: String
        switch type {
        case .mouseMoved, .leftMouseDragged, .rightMouseDragged:
            // Moves come in floods; one report every quarter second says the same thing.
            if now - lastMoveReport < 0.25 { return }
            lastMoveReport = now
            kind = "move"
        case .scrollWheel: kind = "scroll"
        case .keyDown, .flagsChanged: kind = "key"
        default: kind = "click"
        }
        let location = event.location
        emit("input", ["kind": kind, "at": now, "point": [Double(location.x.rounded()), Double(location.y.rounded())],
                       "front_pid": Int(NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0)])
    }
}
