import Cocoa
import ApplicationServices
import ScreenCaptureKit

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
        let app: NSRunningApplication = try waitFor { try await NSWorkspace.shared.openApplication(at: url, configuration: configuration) }
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
                    "frame": rectArray(frame), "rect": frame]
        }
    }

    static func windowId(frame: CGRect, among windows: [[String: Any]]) -> Int? {
        windows.first { window in
            guard let rect = window["rect"] as? CGRect else { return false }
            return abs(rect.minX - frame.minX) < 2 && abs(rect.minY - frame.minY) < 2 && abs(rect.width - frame.width) < 2 && abs(rect.height - frame.height) < 2
        }?["id"] as? Int
    }

    static let interactiveRoles: Set<String> = ["AXButton", "AXCheckBox", "AXRadioButton", "AXPopUpButton", "AXMenuButton", "AXTextField",
        "AXTextArea", "AXComboBox", "AXSlider", "AXLink", "AXTab", "AXMenuItem", "AXMenuBarItem", "AXDisclosureTriangle", "AXIncrementor",
        "AXColorWell", "AXSearchField", "AXCell", "AXRow", "AXSwitch", "AXToggle", "AXDateField", "AXSegmentedControl", "AXStepper", "AXWebArea"]

    /// The focused window's accessibility tree, in reading order, bounded. Password values never leave the helper.
    static func tree(pid: pid_t, maxNodes: Int) throws -> [String: Any] {
        guard AXIsProcessTrusted() else { throw HelperError("permission.accessibility", "没有辅助功能权限") }
        guard NSRunningApplication(processIdentifier: pid)?.isTerminated == false else { throw HelperError("app.gone", "应用已经退出") }
        let app = AX.app(pid)
        // Electron and Chromium build their tree only when an assistive client asks for it.
        AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue)
        guard let window = AX.window(of: app), let windowFrame = AX.frame(window) else { throw HelperError("window.none", "这个应用现在没有打开的窗口") }
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
            let secure = subrole == "AXSecureTextField"
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
                if interactiveRoles.contains(role) || name != nil || value != nil { nodes.append(node) }
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
    /// where they overlap it. Password fields are painted over before the bytes leave this process.
    static func screenshot(pid: pid_t, rect: CGRect, scale: Double) throws -> [String: Any] {
        guard CGPreflightScreenCaptureAccess() else { throw HelperError("permission.screen_recording", "没有屏幕录制权限") }
        guard rect.width >= 1, rect.height >= 1, scale > 0, scale <= 2 else { throw HelperError("helper.bad_params", "截图范围不对") }
        let content: SCShareableContent = try waitFor { try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true) }
        guard let target = content.applications.first(where: { $0.processID == pid }) else { throw HelperError("app.gone", "应用已经退出或没有窗口在屏幕上") }
        let center = CGPoint(x: rect.midX, y: rect.midY)
        guard let display = content.displays.first(where: { $0.frame.contains(center) }) ?? content.displays.first else {
            throw HelperError("display.none", "找不到显示器")
        }
        let local = rect.offsetBy(dx: -display.frame.minX, dy: -display.frame.minY)
            .intersection(CGRect(origin: .zero, size: display.frame.size))
        guard !local.isNull, local.width >= 1, local.height >= 1 else { throw HelperError("window.offscreen", "窗口不在屏幕上") }
        let filter = SCContentFilter(display: display, including: [target], exceptingWindows: [])
        let configuration = SCStreamConfiguration()
        configuration.sourceRect = local
        configuration.width = Int((local.width * scale).rounded())
        configuration.height = Int((local.height * scale).rounded())
        configuration.showsCursor = false
        configuration.ignoreShadowsDisplay = true
        let image: CGImage = try waitFor { try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration) }
        let captured = local.offsetBy(dx: display.frame.minX, dy: display.frame.minY)
        let masks = secureRects(pid: pid).filter { $0.intersects(captured) }
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
                "masked": masks.count, "display": rectArray(display.frame)]
    }

    /// What sits at a global point right now: the topmost window there, and the accessibility element there.
    static func probe(_ point: CGPoint) -> [String: Any] {
        var window: [String: Any] = [:]
        for info in onScreenWindows() {
            guard let rect = info["rect"] as? CGRect, rect.contains(point), (info["alpha"] as? Double ?? 1) > 0.01 else { continue }
            window = info
            window.removeValue(forKey: "rect")
            break
        }
        var result: [String: Any] = ["window": window]
        let system = AXUIElementCreateSystemWide()
        AXUIElementSetMessagingTimeout(system, 1.0)
        var hit: AXUIElement?
        if AXUIElementCopyElementAtPosition(system, Float(point.x), Float(point.y), &hit) == .success, let hit {
            let ownWindow = AX.element(hit, kAXWindowAttribute)
            result["element"] = ["pid": Int(AX.pid(hit)), "role": AX.string(hit, kAXRoleAttribute) ?? "",
                                 "name": (AX.string(hit, kAXTitleAttribute) ?? AX.string(hit, kAXDescriptionAttribute) ?? AX.string(hit, kAXValueAttribute) ?? "").prefix(80).description,
                                 "secure": AX.secure(hit), "window_title": ownWindow.flatMap { AX.string($0, kAXTitleAttribute) } ?? ""]
        }
        return result
    }

    static func focusedField(pid: pid_t) throws -> [String: Any] {
        let app = AX.app(pid)
        guard let focused = AX.element(app, kAXFocusedUIElementAttribute) else { return ["role": "", "name": "", "secure": false] }
        var settable: DarwinBoolean = false
        AXUIElementIsAttributeSettable(focused, kAXSelectedTextAttribute as CFString, &settable)
        let name = AX.string(focused, kAXTitleAttribute) ?? AX.string(focused, kAXDescriptionAttribute) ?? AX.string(focused, kAXPlaceholderValueAttribute) ?? ""
        return ["role": AX.string(focused, kAXRoleAttribute) ?? "", "name": String(name.prefix(80)), "secure": AX.secure(focused),
                "editable": settable.boolValue, "frame": AX.frame(focused).map(rectArray) ?? []]
    }

    /// The file the app's front window shows, when the app says (AXDocument).
    static func document(pid: pid_t) throws -> [String: Any] {
        guard let window = AX.window(of: AX.app(pid)), let raw = AX.string(window, kAXDocumentAttribute), let url = URL(string: raw), url.isFileURL else {
            return ["path": ""]
        }
        return ["path": url.path]
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

    /// Hands a local file to the app (opens it there). Prologue already checked the path against its floor table and
    /// the person approved this exact file.
    static func giveFile(pid: pid_t, path: String) throws -> [String: Any] {
        guard let app = NSRunningApplication(processIdentifier: pid), let appURL = app.bundleURL else { throw HelperError("app.gone", "应用已经退出") }
        var directory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: path, isDirectory: &directory), !directory.boolValue else {
            throw HelperError("file.missing", "没有这个文件")
        }
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true
        _ = try waitFor { try await NSWorkspace.shared.open([URL(fileURLWithPath: path)], withApplicationAt: appURL, configuration: configuration) }
        return ["opened": true]
    }
}
