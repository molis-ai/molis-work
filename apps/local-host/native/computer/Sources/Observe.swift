import Cocoa
import ApplicationServices
import ScreenCaptureKit
import Vision
import CryptoKit

/// Accessibility reads. Every call is bounded by a messaging timeout so a hung app cannot hang the helper.
enum AX {
    static func copy(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
        var value: CFTypeRef?
        return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
    }
    static func string(_ element: AXUIElement, _ name: String) -> String? {
        guard let value = copy(element, name) else { return nil }
        if let text = value as? String { return text }
        if let attributed = value as? NSAttributedString { return attributed.string }
        return nil
    }
    static func element(_ element: AXUIElement, _ name: String) -> AXUIElement? {
        guard let value = copy(element, name), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
        return (value as! AXUIElement)
    }
    static func elements(_ element: AXUIElement, _ name: String) -> [AXUIElement] {
        guard let value = copy(element, name), let list = value as? [AnyObject] else { return [] }
        return list.compactMap { CFGetTypeID($0) == AXUIElementGetTypeID() ? ($0 as! AXUIElement) : nil }
    }
    static func frame(_ element: AXUIElement) -> CGRect? {
        guard let position = copy(element, kAXPositionAttribute), let size = copy(element, kAXSizeAttribute),
              CFGetTypeID(position) == AXValueGetTypeID(), CFGetTypeID(size) == AXValueGetTypeID() else { return nil }
        var point = CGPoint.zero, extent = CGSize.zero
        guard AXValueGetValue(position as! AXValue, .cgPoint, &point), AXValueGetValue(size as! AXValue, .cgSize, &extent) else { return nil }
        return CGRect(origin: point, size: extent)
    }
    static func pid(_ element: AXUIElement) -> pid_t {
        var pid: pid_t = 0
        AXUIElementGetPid(element, &pid)
        return pid
    }
    static func app(_ pid: pid_t) -> AXUIElement {
        let element = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(element, 1.5)
        return element
    }
    /// The app's focused window, else its main window, else its first window.
    static func window(of app: AXUIElement) -> AXUIElement? {
        element(app, kAXFocusedWindowAttribute) ?? element(app, kAXMainWindowAttribute) ?? elements(app, kAXWindowsAttribute).first
    }
    static func secure(_ element: AXUIElement) -> Bool {
        string(element, kAXSubroleAttribute) == "AXSecureTextField" || string(element, kAXRoleAttribute) == "AXSecureTextField"
    }
    static func frontmostPid() -> pid_t? {
        let system = AXUIElementCreateSystemWide()
        AXUIElementSetMessagingTimeout(system, 1.0)
        guard let app = element(system, kAXFocusedApplicationAttribute) else { return NSWorkspace.shared.frontmostApplication?.processIdentifier }
        return pid(app)
    }
}

func rectArray(_ rect: CGRect) -> [Double] { [rect.origin.x, rect.origin.y, rect.size.width, rect.size.height].map { Double($0.rounded()) } }
private func digest(_ text: String) -> String { SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined() }

/// Native facts of one window, carried by the trusted Host through its private socket.
struct WindowTarget: Equatable {
    let bundleId: String
    let pid: pid_t
    let launchTime: Double
    let windowId: Int
    let frame: CGRect
    let titleHash: String
    let documentHash: String?
    let forbidden: Bool
    let focus: String?

    init(bundleId: String, pid: pid_t, launchTime: Double, windowId: Int, frame: CGRect, titleHash: String, focus: String?, documentHash: String? = nil, forbidden: Bool = false) {
        self.bundleId = bundleId; self.pid = pid; self.launchTime = launchTime
        self.windowId = windowId; self.frame = frame; self.titleHash = titleHash; self.focus = focus; self.documentHash = documentHash; self.forbidden = forbidden
    }

    init(_ wire: [String: Any]) throws {
        let bundleId = try wire.string("bundle_id"), pid = try wire.int32("pid")
        let launchTime = try wire.double("launch_time"), frame = try wire.rect("frame")
        guard pid > 0, launchTime > 0, let windowId = wire.optionalInt("window_id"), windowId > 0,
              !frame.isInfinite, !frame.isNull, frame.width > 0, frame.height > 0 else {
            throw HelperError("window.changed", "无法核对原应用窗口")
        }
        let titleHash = try wire.string("title_hash"), focus = try wire["focus"].map { _ in try wire.string("focus") }
        let documentHash = try wire["document_hash"].map { _ in try wire.string("document_hash") }
        self.init(bundleId: bundleId, pid: pid, launchTime: launchTime, windowId: windowId, frame: frame, titleHash: titleHash, focus: focus, documentHash: documentHash)
    }

    var wire: [String: Any] {
        var value: [String: Any] = ["bundle_id": bundleId, "pid": Int(pid), "launch_time": launchTime, "window_id": windowId,
                                    "frame": rectArray(frame), "title_hash": titleHash]
        if let focus { value["focus"] = focus }
        if let documentHash { value["document_hash"] = documentHash }
        return value
    }

    func check(focus required: Bool = true, read: (pid_t) -> WindowTarget? = Observe.windowTarget) throws {
        guard let live = read(pid) else { throw HelperError("window.changed", "原应用窗口已变化，请重新观察") }
        try check(live, focus: required)
    }

    func check(_ live: WindowTarget, focus required: Bool = true) throws {
        guard !live.forbidden, live.bundleId == bundleId, live.pid == pid, live.launchTime == launchTime,
              live.windowId == windowId, live.frame == frame, live.titleHash == titleHash, live.documentHash == documentHash,
              !required || live.focus == focus else {
            throw HelperError("window.changed", "原应用、窗口、文档或输入焦点已变化，请重新观察")
        }
    }

    func processStillRunning() -> Bool {
        guard let app = NSRunningApplication(processIdentifier: pid), !app.isTerminated else { return false }
        return app.bundleIdentifier == bundleId && app.launchDate?.timeIntervalSince1970 == launchTime
    }

    func capture<T>(_ read: () throws -> T) throws -> T {
        try check()
        let result = try read()
        try check()
        return result
    }
}

/// Runs async work on the serial request queue and waits for it: the helper answers one request at a time.
func waitFor<T>(_ operation: @escaping () async throws -> T) throws -> T {
    let done = DispatchSemaphore(value: 0)
    var result: Result<T, Error>?
    Task {
        do { result = .success(try await operation()) } catch { result = .failure(error) }
        done.signal()
    }
    done.wait()
    return try result!.get()
}

enum Observe {
    // Native requests use the serial work queue. Keep only the last exact focused AX element per recent process.
    // A focus that leaves and returns receives a new identifier once the change was observed.
    private static var focusByProcess: [(pid: pid_t, launch: Double, field: AXUIElement, token: String)] = []

    private static func focusIdentity(_ field: AXUIElement?, pid: pid_t, launch: Double) -> String? {
        let prior = focusByProcess.first { $0.pid == pid && $0.launch == launch }
        focusByProcess.removeAll { $0.pid == pid }
        guard let field else { return nil }
        let token = prior.flatMap { CFEqual($0.field, field) ? $0.token : nil } ?? UUID().uuidString
        focusByProcess.append((pid, launch, field, token))
        if focusByProcess.count > 16 { focusByProcess.removeFirst() }
        return token
    }

    static func appInfo(_ app: NSRunningApplication) -> [String: Any] {
        ["bundle_id": app.bundleIdentifier ?? "", "name": app.localizedName ?? "", "pid": Int(app.processIdentifier),
         "active": app.isActive, "hidden": app.isHidden]
    }

    static func runningApps() -> [String: Any] {
        let apps = NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular && $0.bundleIdentifier != nil }
        return ["apps": apps.map(appInfo), "front_pid": Int(AX.frontmostPid() ?? 0)]
    }

    /// Apps the person has installed in the usual places, by bundle id: what "open an app" may name.
    static func installedApps() -> [String: Any] {
        let manager = FileManager.default
        var roots = ["/Applications", "/Applications/Utilities", "/System/Applications", "/System/Applications/Utilities"]
        roots.append(NSHomeDirectory() + "/Applications")
        var seen = Set<String>()
        var out: [[String: Any]] = []
        for root in roots {
            guard let names = try? manager.contentsOfDirectory(atPath: root) else { continue }
            for name in names where name.hasSuffix(".app") {
                guard let bundle = Bundle(path: root + "/" + name), let id = bundle.bundleIdentifier, !seen.contains(id) else { continue }
                seen.insert(id)
                let display = (bundle.localizedInfoDictionary?["CFBundleDisplayName"] as? String)
                    ?? (bundle.infoDictionary?["CFBundleDisplayName"] as? String)
                    ?? (bundle.infoDictionary?["CFBundleName"] as? String)
                    ?? String(name.dropLast(4))
                out.append(["bundle_id": id, "name": display])
            }
        }
        return ["apps": out]
    }

    static func running(_ bundleId: String) -> NSRunningApplication? {
        NSRunningApplication.runningApplications(withBundleIdentifier: bundleId).first { !$0.isTerminated }
    }

    /// Opens the app, or brings it to the front when it already runs; waits until it is the frontmost app.
    static func openApp(_ bundleId: String) throws -> [String: Any] {
        if let app = running(bundleId) {
            try Input.shared.activate(app.processIdentifier)
            return try appState(app.processIdentifier)
        }
        guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId) else {
            throw HelperError("app.not_installed", "这台电脑上没有装这个应用（\(bundleId)）")
        }
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true
        let app = try openWorkspace { NSWorkspace.shared.openApplication(at: url, configuration: configuration, completionHandler: $0) }
        for _ in 0..<40 where AX.window(of: AX.app(app.processIdentifier)) == nil { usleep(100_000) }
        try? Input.shared.activate(app.processIdentifier)
        return try appState(app.processIdentifier)
    }

    /// Who the app is now and which window is in front: what the driver's identity and scope are made of.
    static func appState(_ pid: pid_t) throws -> [String: Any] {
        guard let app = NSRunningApplication(processIdentifier: pid), !app.isTerminated else { throw HelperError("app.gone", "应用已经退出") }
        let element = AX.app(pid)
        var state = appInfo(app)
        state["front_pid"] = Int(AX.frontmostPid() ?? 0)
        let windows = AX.elements(element, kAXWindowsAttribute)
        let focused = AX.window(of: element)
        let cgWindows = onScreenWindows().filter { ($0["pid"] as? Int) == Int(pid) }
        state["windows"] = windows.prefix(20).map { window -> [String: Any] in
            let frame = AX.frame(window) ?? .zero
            return ["title": AX.string(window, kAXTitleAttribute) ?? "", "frame": rectArray(frame),
                    "focused": focused.map { CFEqual($0, window) } ?? false,
                    "minimized": (AX.copy(window, kAXMinimizedAttribute) as? NSNumber)?.boolValue ?? false,
                    "window_id": windowId(frame: frame, among: cgWindows) ?? 0]
        }
        if let focused, let frame = AX.frame(focused) {
            state["window"] = ["title": AX.string(focused, kAXTitleAttribute) ?? "", "frame": rectArray(frame),
                               "window_id": windowId(frame: frame, among: cgWindows) ?? 0,
                               "document": AX.string(focused, kAXDocumentAttribute) ?? ""]
        }
        state["target"] = windowTarget(app: app, element: element, focused: focused, windows: cgWindows)?.wire
        // Menus and popovers the app has open sit in windows of their own above the focused one.
        state["popups"] = cgWindows.filter { ($0["layer"] as? Int ?? 0) != 0 }.map { $0["frame"] as Any }
        return state
    }

    static func onScreenWindows() -> [[String: Any]] {
        let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
        return list.compactMap { info in
            guard let bounds = info[kCGWindowBounds as String] as? NSDictionary,
                  let frame = CGRect(dictionaryRepresentation: bounds) else { return nil }
            return ["pid": (info[kCGWindowOwnerPID as String] as? NSNumber)?.intValue ?? 0,
                    "id": (info[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0,
                    "layer": (info[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0,
                    "alpha": (info[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1,
                    "owner": info[kCGWindowOwnerName as String] as? String ?? "",
                    "title": info[kCGWindowName as String] as? String ?? "",
                    "frame": rectArray(frame), "rect": frame]
        }
    }

    static func windowId(frame: CGRect, among windows: [[String: Any]]) -> Int? {
        let matches = windows.filter { window in
            guard (window["layer"] as? Int) == 0, let rect = window["rect"] as? CGRect else { return false }
            return abs(rect.minX - frame.minX) < 2 && abs(rect.minY - frame.minY) < 2 && abs(rect.width - frame.width) < 2 && abs(rect.height - frame.height) < 2
        }
        guard matches.count == 1, let id = matches[0]["id"] as? Int, id > 0 else { return nil }
        return id
    }

    static func windowTarget(_ pid: pid_t) -> WindowTarget? {
        guard let app = NSRunningApplication(processIdentifier: pid), !app.isTerminated else { return nil }
        let element = AX.app(pid)
        return windowTarget(app: app, element: element, focused: AX.window(of: element), windows: onScreenWindows().filter { ($0["pid"] as? Int) == Int(pid) })
    }

    private static func windowTarget(app: NSRunningApplication, element: AXUIElement, focused: AXUIElement?, windows: [[String: Any]]) -> WindowTarget? {
        windowTarget(app: app, focused: focused, field: AX.element(element, kAXFocusedUIElementAttribute), windows: windows)
    }

    private static func windowTarget(app: NSRunningApplication, focused: AXUIElement?, field: AXUIElement?, windows: [[String: Any]]) -> WindowTarget? {
        guard let bundleId = app.bundleIdentifier, !bundleId.isEmpty, let launchTime = app.launchDate?.timeIntervalSince1970,
              let focused, let frame = AX.frame(focused), let windowId = windowId(frame: frame, among: windows) else { return nil }
        let title = AX.string(focused, kAXTitleAttribute) ?? ""
        let owner = app.localizedName ?? ""
        let forbidden = title.localizedCaseInsensitiveContains("Molis Work") || owner.localizedCaseInsensitiveContains("Molis Work")
        let points = rectArray(frame)
        let rounded = CGRect(x: points[0], y: points[1], width: points[2], height: points[3])
        return WindowTarget(bundleId: bundleId, pid: app.processIdentifier, launchTime: launchTime, windowId: windowId,
                            frame: rounded, titleHash: digest(title), focus: focusIdentity(field, pid: app.processIdentifier, launch: launchTime),
                            documentHash: documentPath(focused).map(digest), forbidden: forbidden)
    }

    /// Keep the exact AX objects used for the proof. A read must not fetch whichever window or field became current next.
    static func readOriginal<T>(_ target: WindowTarget, _ read: (AXUIElement, AXUIElement, AXUIElement?) throws -> T) throws -> T {
        guard let running = NSRunningApplication(processIdentifier: target.pid), !running.isTerminated else {
            throw HelperError("window.changed", "原应用已退出，请重新观察")
        }
        let app = AX.app(target.pid), windows = onScreenWindows().filter { ($0["pid"] as? Int) == Int(target.pid) }
        let window = AX.window(of: app), field = AX.element(app, kAXFocusedUIElementAttribute)
        guard let window, let live = windowTarget(app: running, focused: window, field: field, windows: windows) else {
            throw HelperError("window.changed", "无法核对原应用窗口")
        }
        try target.check(live)
        let result = try read(app, window, field)
        try target.check()
        return result
    }

    static let interactiveRoles: Set<String> = ["AXButton", "AXCheckBox", "AXRadioButton", "AXPopUpButton", "AXMenuButton", "AXTextField",
        "AXTextArea", "AXComboBox", "AXSlider", "AXLink", "AXTab", "AXMenuItem", "AXMenuBarItem", "AXDisclosureTriangle", "AXIncrementor",
        "AXColorWell", "AXSearchField", "AXCell", "AXRow", "AXSwitch", "AXToggle", "AXDateField", "AXSegmentedControl", "AXStepper", "AXWebArea"]

    /// The focused window's accessibility tree, in reading order, bounded. Password values never leave the helper.
    static func tree(_ target: WindowTarget, maxNodes: Int) throws -> [String: Any] {
        guard AXIsProcessTrusted() else { throw HelperError("permission.accessibility", "没有辅助功能权限") }
        return try readOriginal(target) { app, window, _ in try tree(app: app, window: window, maxNodes: maxNodes) }
    }

    private static func tree(app: AXUIElement, window: AXUIElement, maxNodes: Int) throws -> [String: Any] {
        // Electron and Chromium build their tree only when an assistive client asks for it.
        AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue)
        guard let windowFrame = AX.frame(window) else { throw HelperError("window.changed", "原应用窗口已不可读") }
        var nodes: [[String: Any]] = []
        var secureRects: [[Double]] = []
        var stack: [(AXUIElement, Int)] = [(window, 0)]
        var visited = 0
        let names = [kAXRoleAttribute, kAXSubroleAttribute, kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute,
                     kAXEnabledAttribute, kAXFocusedAttribute, kAXSelectedAttribute, kAXPositionAttribute, kAXSizeAttribute,
                     kAXPlaceholderValueAttribute, kAXHelpAttribute, kAXExpandedAttribute] as [String]
        let bounds = windowFrame.insetBy(dx: -2, dy: -2)
        while let (element, depth) = stack.popLast(), visited < maxNodes * 4 {
            visited += 1
            var values: CFArray?
            guard AXUIElementCopyMultipleAttributeValues(element, names as CFArray, AXCopyMultipleAttributeOptions(rawValue: 0), &values) == .success,
                  let row = values as? [AnyObject] else { continue }
            func pick(_ index: Int) -> AnyObject? {
                guard index < row.count else { return nil }
                let value = row[index]
                if CFGetTypeID(value) == AXValueGetTypeID() && AXValueGetType(value as! AXValue) == .axError { return nil }
                return value
            }
            func text(_ index: Int) -> String? {
                if let string = pick(index) as? String { return string.isEmpty ? nil : string }
                if let attributed = pick(index) as? NSAttributedString { return attributed.string.isEmpty ? nil : attributed.string }
                return nil
            }
            var frame: CGRect?
            if let position = pick(8), let size = pick(9), CFGetTypeID(position) == AXValueGetTypeID(), CFGetTypeID(size) == AXValueGetTypeID() {
                var point = CGPoint.zero, extent = CGSize.zero
                AXValueGetValue(position as! AXValue, .cgPoint, &point)
                AXValueGetValue(size as! AXValue, .cgSize, &extent)
                frame = CGRect(origin: point, size: extent)
            }
            // Scrolled out of the window: not on screen, and its children are not either.
            if let frame, frame.width > 0, frame.height > 0, !frame.intersects(bounds) { continue }
            let role = text(0) ?? ""
            let subrole = text(1) ?? ""
            let secure = subrole == "AXSecureTextField" || role == "AXSecureTextField"
            var value: String?
            if secure {
                if let frame { secureRects.append(rectArray(frame)) }
                value = nil
            } else if let string = text(4) {
                value = String(string.prefix(role == "AXStaticText" ? 600 : 2_000))
            } else if let number = pick(4) as? NSNumber {
                value = number.stringValue
            }
            let name = text(2) ?? text(3) ?? text(10) ?? text(11)
            if nodes.count < maxNodes {
                var node: [String: Any] = ["role": role, "depth": depth]
                if !subrole.isEmpty { node["subrole"] = subrole }
                if let name { node["name"] = String(name.prefix(200)) }
                if let value { node["value"] = value }
                if secure { node["secure"] = true; node["filled"] = (text(4)?.isEmpty == false) }
                if let frame { node["frame"] = rectArray(frame) }
                if (pick(5) as? NSNumber)?.boolValue == false { node["disabled"] = true }
                if (pick(6) as? NSNumber)?.boolValue == true { node["focused"] = true }
                if (pick(7) as? NSNumber)?.boolValue == true { node["selected"] = true }
                if (pick(12) as? NSNumber)?.boolValue == true { node["expanded"] = true }
                if interactiveRoles.contains(role) || secure || name != nil || value != nil { nodes.append(node) }
            }
            // Children last-to-first so the stack pops them in reading order.
            let children = AX.elements(element, kAXChildrenAttribute)
            for child in children.prefix(400).reversed() { stack.append((child, depth + 1)) }
        }
        let menus = AX.element(app, kAXMenuBarAttribute).map { bar in
            AX.elements(bar, kAXChildrenAttribute).compactMap { AX.string($0, kAXTitleAttribute) }.filter { !$0.isEmpty && $0 != "Apple" }
        } ?? []
        return ["window": ["title": AX.string(window, kAXTitleAttribute) ?? "", "frame": rectArray(windowFrame)],
                "nodes": nodes, "truncated": nodes.count >= maxNodes, "secure_rects": secureRects, "menus": menus]
    }

    /// Password-like fields anywhere in the app's windows, for covering them in a screenshot.
    static func secureRects(pid: pid_t) -> [CGRect] {
        guard AXIsProcessTrusted() else { return [] }
        let app = AX.app(pid)
        var out: [CGRect] = []
        var stack = AX.elements(app, kAXWindowsAttribute)
        var visited = 0
        while let element = stack.popLast(), visited < 4_000 {
            visited += 1
            if AX.secure(element), let frame = AX.frame(element) { out.append(frame); continue }
            stack.append(contentsOf: AX.elements(element, kAXChildrenAttribute).prefix(400))
        }
        return out
    }

    /// Only the target app's windows, cropped to `rect` (global points); other apps' windows are not in the image even
    /// where they overlap it. A password field in that crop never leaves this process: the capture is refused.
    static func screenshot(pid: pid_t, rect: CGRect, scale: Double, expected: WindowTarget? = nil) throws -> [String: Any] {
        guard CGPreflightScreenCaptureAccess() else { throw HelperError("permission.screen_recording", "没有屏幕录制权限") }
        guard rect.width >= 1, rect.height >= 1, scale > 0, scale <= 2 else { throw HelperError("helper.bad_params", "截图范围不对") }
        if secureRects(pid: pid).contains(where: { $0.intersects(rect) }) {
            throw HelperError("capture.password", "截图会带出没有涂黑的密码框")
        }
        let content: SCShareableContent = try waitFor { try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true) }
        guard let target = content.applications.first(where: { $0.processID == pid }) else { throw HelperError("app.gone", "应用已经退出或没有窗口在屏幕上") }
        let center = CGPoint(x: rect.midX, y: rect.midY)
        guard let display = content.displays.first(where: { $0.frame.contains(center) }) ?? content.displays.first else {
            throw HelperError("display.none", "找不到显示器")
        }
        let local = rect.offsetBy(dx: -display.frame.minX, dy: -display.frame.minY)
            .intersection(CGRect(origin: .zero, size: display.frame.size))
        guard !local.isNull, local.width >= 1, local.height >= 1 else { throw HelperError("window.offscreen", "窗口不在屏幕上") }
        let filter: SCContentFilter
        if let expected {
            guard let window = content.windows.first(where: { $0.owningApplication?.processID == pid && Int($0.windowID) == expected.windowId }) else {
                throw HelperError("window.changed", "原窗口不再可截图")
            }
            filter = SCContentFilter(display: display, including: [window])
        } else {
            filter = SCContentFilter(display: display, including: [target], exceptingWindows: [])
        }
        let configuration = SCStreamConfiguration()
        configuration.sourceRect = local
        configuration.width = Int((local.width * scale).rounded())
        configuration.height = Int((local.height * scale).rounded())
        configuration.showsCursor = false
        configuration.ignoreShadowsDisplay = true
        let image: CGImage = try waitFor {
            try expected?.check()
            return try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration)
        }
        let captured = local.offsetBy(dx: display.frame.minX, dy: display.frame.minY)
        let masks = secureRects(pid: pid).filter { $0.intersects(captured) }
        if !masks.isEmpty { throw HelperError("capture.password", "截图会带出没有涂黑的密码框") }
        let width = image.width, height = image.height
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            throw HelperError("helper.failed", "cannot draw")
        }
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        let sx = Double(width) / captured.width, sy = Double(height) / captured.height
        context.setFillColor(CGColor(red: 0.11, green: 0.11, blue: 0.12, alpha: 1))
        for mask in masks {
            // Image space has its origin at the bottom left.
            let x = (mask.minX - captured.minX) * sx
            let y = (captured.maxY - mask.maxY) * sy
            context.fill(CGRect(x: x - 2, y: y - 2, width: mask.width * sx + 4, height: mask.height * sy + 4))
        }
        guard let covered = context.makeImage(),
              let png = NSBitmapImageRep(cgImage: covered).representation(using: .png, properties: [:]) else {
            throw HelperError("helper.failed", "cannot encode")
        }
        return ["png": png.base64EncodedString(), "rect": rectArray(captured), "width": width, "height": height,
                "included_pids": [Int(pid)], "password_fields": masks.count, "masked": masks.count, "display": rectArray(display.frame)]
    }

    /// Text on the target app's window, with window-relative points (specs/computer-use §9, CU-G10). The screenshot
    /// follows the same rule as any other: a password field in the crop refuses before any text leaves this process.
    static func ocr(pid: pid_t, rect: CGRect, scale: Double, expected: WindowTarget) throws -> [String: Any] {
        let shot = try screenshot(pid: pid, rect: rect, scale: scale, expected: expected)
        guard let encoded = shot["png"] as? String, let data = Data(base64Encoded: encoded),
              let image = NSImage(data: data), let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            throw HelperError("helper.failed", "cannot read the window picture for OCR")
        }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.recognitionLanguages = ["zh-Hans", "en-US"]
        try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
        let box = (shot["rect"] as? [Double]) ?? []
        let width = box.count >= 4 ? box[2] : Double(cgImage.width)
        let height = box.count >= 4 ? box[3] : Double(cgImage.height)
        // The capture may be clipped by the display; the model's coordinates are relative to the window, not the crop.
        let offsetX = (box.count >= 4 ? box[0] : Double(rect.minX)) - Double(rect.minX)
        let offsetY = (box.count >= 4 ? box[1] : Double(rect.minY)) - Double(rect.minY)
        let found = (request.results ?? []).compactMap { observation -> [String: Any]? in
            guard let candidate = observation.topCandidates(1).first else { return nil }
            let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            let bounding = observation.boundingBox
            let x = Double(bounding.minX) * width + offsetX
            let y = (1 - Double(bounding.maxY)) * height + offsetY
            let boxWidth = Double(bounding.width) * width
            let boxHeight = Double(bounding.height) * height
            return ["text": String(text.prefix(500)), "x": x, "y": y, "width": boxWidth, "height": boxHeight,
                    "confidence": Double(candidate.confidence)]
        }.sorted { left, right in
            let leftY = left["y"] as? Double ?? 0, rightY = right["y"] as? Double ?? 0
            if abs(leftY - rightY) > 4 { return leftY < rightY }
            return (left["x"] as? Double ?? 0) < (right["x"] as? Double ?? 0)
        }.prefix(120)
        return ["lines": Array(found), "rect": shot["rect"] ?? [Double](), "width": width, "height": height]
    }

    /// What sits at a global point right now: the topmost window there, and the accessibility element there.
    static func probe(_ point: CGPoint) -> [String: Any] {
        var window = windowAt(point)
        window.removeValue(forKey: "rect")
        var result: [String: Any] = ["window": window]
        let system = AXUIElementCreateSystemWide()
        AXUIElementSetMessagingTimeout(system, 1.0)
        var hit: AXUIElement?
        if AXUIElementCopyElementAtPosition(system, Float(point.x), Float(point.y), &hit) == .success, let hit {
            let ownWindow = AX.element(hit, kAXWindowAttribute)
            let secure = AX.secure(hit), role = AX.string(hit, kAXRoleAttribute) ?? ""
            let name = secure ? "" : AX.string(hit, kAXTitleAttribute) ?? AX.string(hit, kAXDescriptionAttribute) ?? AX.string(hit, kAXValueAttribute) ?? ""
            let shortName = String(name.prefix(80))
            var element: [String: Any] = ["pid": Int(AX.pid(hit)), "role": role, "name": shortName, "name_truncated": shortName != name,
                                          "secure": secure, "window_title": ownWindow.flatMap { AX.string($0, kAXTitleAttribute) } ?? ""]
            if !role.isEmpty && !name.isEmpty { element["fingerprint"] = digest("\(role.utf8.count):\(role)\(name)") }
            result["element"] = element
        }
        return result
    }

    static func windowAt(_ point: CGPoint) -> [String: Any] {
        onScreenWindows().first { info in
            guard let rect = info["rect"] as? CGRect else { return false }
            return rect.contains(point) && (info["alpha"] as? Double ?? 1) > 0.01
        } ?? [:]
    }

    static func focusedField(_ target: WindowTarget) throws -> [String: Any] {
        try readOriginal(target) { _, _, field in
            guard let focused = field, target.focus != nil else { throw HelperError("field.none", "无法读取原应用的焦点，请重新选择输入位置") }
            var settable: DarwinBoolean = false
            AXUIElementIsAttributeSettable(focused, kAXSelectedTextAttribute as CFString, &settable)
            let name = AX.string(focused, kAXTitleAttribute) ?? AX.string(focused, kAXDescriptionAttribute) ?? AX.string(focused, kAXPlaceholderValueAttribute) ?? ""
            return ["role": AX.string(focused, kAXRoleAttribute) ?? "", "name": String(name.prefix(80)), "secure": AX.secure(focused),
                    "editable": settable.boolValue, "frame": AX.frame(focused).map(rectArray) ?? []]
        }
    }

    /// The file the app's front window shows, when the app says (AXDocument).
    private static func documentPath(_ window: AXUIElement) -> String? {
        guard let raw = AX.string(window, kAXDocumentAttribute), let url = URL(string: raw), url.isFileURL, !url.path.isEmpty else { return nil }
        return url.path
    }

    static func document(_ target: WindowTarget) throws -> [String: Any] {
        try readOriginal(target) { _, window, _ in
            guard let path = documentPath(window), digest(path) == target.documentHash else {
                throw HelperError("window.changed", "原窗口的文件无法核对，请重新观察")
            }
            return ["path": path]
        }
    }

    /// The app's menu bar, or the items under one path of it. Menus are read without being opened.
    static func menus(pid: pid_t, path: [String]) throws -> [String: Any] {
        guard let bar = AX.element(AX.app(pid), kAXMenuBarAttribute) else { throw HelperError("menu.none", "这个应用没有菜单栏") }
        var items = AX.elements(bar, kAXChildrenAttribute)
        for (depth, title) in path.enumerated() {
            guard let item = items.first(where: { menuTitle($0) == title }) else {
                throw HelperError("menu.missing", "第 \(depth + 1) 级没有「\(title)」；有：\(items.map(menuTitle).filter { !$0.isEmpty }.joined(separator: "、"))")
            }
            items = AX.elements(item, kAXChildrenAttribute).flatMap { AX.elements($0, kAXChildrenAttribute) }
        }
        return ["items": items.compactMap { item -> [String: Any]? in
            let title = menuTitle(item)
            guard !title.isEmpty else { return nil }
            return ["title": title, "enabled": (AX.copy(item, kAXEnabledAttribute) as? NSNumber)?.boolValue ?? true,
                    "submenu": !AX.elements(item, kAXChildrenAttribute).isEmpty]
        }]
    }

    static func menuTitle(_ item: AXUIElement) -> String { AX.string(item, kAXTitleAttribute) ?? "" }

    /// The actual OS request and socket EOF share Input's final synchronous boundary.
    private static func openWorkspace(_ start: @escaping (@escaping (NSRunningApplication?, Error?) -> Void) -> Void) throws -> NSRunningApplication {
        try waitFor {
            try await withCheckedThrowingContinuation { continuation in
                do {
                    try Input.shared.commit {
                        start { app, error in
                            if let app { continuation.resume(returning: app) }
                            else { continuation.resume(throwing: error ?? HelperError("app.failed", "系统没有打开目标应用")) }
                        }
                    }
                } catch { continuation.resume(throwing: error) }
            }
        }
    }

    /// Hands a local file to the app (opens it there). Prologue already checked the path against its floor table and
    /// the person approved this exact file.
    static func prepareFileDelivery(pid: pid_t, path: String) throws -> () throws -> [String: Any] {
        var directory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: path, isDirectory: &directory), !directory.boolValue else {
            throw HelperError("file.missing", "没有这个文件")
        }
        guard let app = NSRunningApplication(processIdentifier: pid), !app.isTerminated else {
            throw HelperError("app.gone", "应用已经退出")
        }
        let target = NSAppleEventDescriptor(processIdentifier: pid)
        guard target.aeDesc != nil else {
            throw HelperError("file.delivery_unavailable", "系统不允许将文件直接交给原应用进程，请在应用中自行打开", partial: false)
        }
        let documents = NSAppleEventDescriptor.list()
        documents.insert(NSAppleEventDescriptor(fileURL: URL(fileURLWithPath: path)), at: 1)
        let event = NSAppleEventDescriptor(eventClass: AEEventClass(kCoreEventClass), eventID: AEEventID(kAEOpenDocuments),
                                           targetDescriptor: target, returnID: AEReturnID(kAutoGenerateReturnID), transactionID: AETransactionID(kAnyTransactionID))
        event.setParam(documents, forKeyword: AEKeyword(keyDirectObject))
        let options = NSAppleEventDescriptor.SendOptions(rawValue: UInt(kAEDoNotPromptForUserConsent) | UInt(kAEWaitReply) | UInt(kAENeverInteract))
        return {
            do {
                let reply = try event.sendEvent(options: options, timeout: 5)
                if let status = reply.paramDescriptor(forKeyword: AEKeyword(keyErrorNumber)), status.int32Value != 0 {
                    if status.int32Value == Int32(errAEEventNotPermitted) || status.int32Value == Int32(errAEEventWouldRequireUserConsent) {
                        throw HelperError("file.delivery_unavailable", "系统不允许将文件直接交给原应用进程，请在应用中自行打开", partial: false)
                    }
                    throw HelperError("file.delivery_failed", "原应用未确认接收文件")
                }
                return ["accepted": true]
            } catch let error as HelperError {
                throw error
            } catch let error as NSError where error.domain == NSOSStatusErrorDomain
                && (error.code == Int(errAEEventNotPermitted) || error.code == Int(errAEEventWouldRequireUserConsent) || error.code == Int(procNotFound)) {
                throw HelperError("file.delivery_unavailable", "系统不允许将文件直接交给原应用进程，请在应用中自行打开", partial: false)
            } catch {
                throw HelperError("file.delivery_failed", "无法确认原应用已接收文件")
            }
        }
    }
}
