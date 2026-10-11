import Cocoa
import ApplicationServices
import Carbon.HIToolbox

/// Mouse and keyboard on the person's behalf. Every pointer action checks, at the last moment, that the point still
/// belongs to the target app (a window or banner on top of it is not the app); every event is marked as this helper's;
/// and the person touching the mouse or keyboard while an action runs stops it between two events.
final class Input {
    static let shared = Input()

    private let source: CGEventSource? = {
        let source = CGEventSource(stateID: .privateState)
        source?.userData = SYNTHETIC_MARKER
        return source
    }()
    private let lock = NSLock()
    private var running = false
    private var touched = false
    /// When this helper last posted an event (seconds since 1970): local-host refuses an approval answered right after it.
    private(set) var lastSynthetic: Double = 0

    func personTouched() {
        lock.lock(); if running { touched = true }; lock.unlock()
    }

    private func perform<T>(_ body: () throws -> T) throws -> T {
        lock.lock(); running = true; touched = false; lock.unlock()
        defer { lock.lock(); running = false; lock.unlock() }
        return try body()
    }

    private func checkpoint() throws {
        lock.lock(); let stop = touched; lock.unlock()
        if stop { throw HelperError("person.present", "用户动了鼠标或键盘，这一步停在半途") }
    }

    /// `flags` are always set: an event source remembers the last modifiers it posted, so a Cmd chord would otherwise
    /// turn the next typed character into a shortcut and the next click into a Cmd-click (seen on a real Mac).
    private func post(_ event: CGEvent?, flags: CGEventFlags = []) throws {
        guard let event else { throw HelperError("helper.failed", "cannot create event") }
        try checkpoint()
        event.flags = flags
        event.setIntegerValueField(.eventSourceUserData, value: SYNTHETIC_MARKER)
        event.post(tap: .cghidEventTap)
        lastSynthetic = Date().timeIntervalSince1970
    }

    private func pause(_ seconds: Double) throws {
        usleep(useconds_t(seconds * 1_000_000))
        try checkpoint()
    }

    // MARK: Front app

    func activate(_ pid: pid_t) throws {
        guard let app = NSRunningApplication(processIdentifier: pid), !app.isTerminated else { throw HelperError("app.gone", "应用已经退出") }
        if AX.frontmostPid() == pid { return }
        if app.isHidden { app.unhide() }
        AXUIElementSetAttributeValue(AX.app(pid), kAXFrontmostAttribute as CFString, kCFBooleanTrue)
        if waitFront(pid, 1.0) { return }
        app.activate(options: [.activateAllWindows])
        if waitFront(pid, 1.5) { return }
        throw HelperError("app.not_front", "没能把「\(app.localizedName ?? "应用")」切到前台")
    }

    private func waitFront(_ pid: pid_t, _ seconds: Double) -> Bool {
        let until = Date().addingTimeInterval(seconds)
        while Date() < until {
            if AX.frontmostPid() == pid { usleep(120_000); return true }
            usleep(50_000)
        }
        return false
    }

    /// Terminals, editors and remote desktops: the helper refuses typing even if a caller skips the driver's check.
    private static let lookOnlyIds: Set<String> = [
        "com.apple.Terminal", "com.googlecode.iterm2", "dev.warp.Warp-Stable", "dev.warp.Warp", "com.mitchellh.ghostty", "org.alacritty",
        "io.alacritty", "net.kovidgoyal.kitty", "com.github.wez.wezterm", "co.zeit.hyper", "org.tabby", "com.termius-dmg.mac",
        "com.microsoft.VSCode", "com.microsoft.VSCodeInsiders", "com.vscodium", "com.todesktop.230313mzl4w4u92", "com.exafunction.windsurf",
        "dev.zed.Zed", "dev.zed.Zed-Preview", "com.apple.dt.Xcode", "com.google.android.studio", "com.sublimetext.4", "com.sublimetext.3",
        "com.panic.Nova", "org.vim.MacVim", "org.gnu.Emacs", "com.qvacua.VimR",
        "com.apple.ScriptEditor2", "com.apple.Automator", "com.apple.shortcuts",
        "com.apple.ScreenSharing", "com.teamviewer.TeamViewer", "com.philandro.anydesk", "com.netease.uuremote", "com.microsoft.rdc.macos",
        "com.edovia.jumpdesktop.mac", "com.parallels.desktop.console", "com.vmware.fusion", "com.utmapp.UTM",
    ]
    private static let lookOnlyName = try! NSRegularExpression(pattern: "terminal|终端|iterm|ghostty|alacritty|wezterm|visual studio|xcode|intellij|pycharm|webstorm|goland|clion|rubymine|phpstorm|datagrip|android studio|vscodium|\\bvim\\b|emacs|remote desktop|远程|screen sharing|屏幕共享|teamviewer|anydesk|parallels|vmware", options: [.caseInsensitive])

    private func refuseLookOnly(_ pid: pid_t) throws {
        guard let app = NSRunningApplication(processIdentifier: pid) else { return }
        let id = app.bundleIdentifier ?? ""
        let name = app.localizedName ?? ""
        let named = Input.lookOnlyName.firstMatch(in: name, range: NSRange(location: 0, length: (name as NSString).length)) != nil
        if Input.lookOnlyIds.contains(id) || id.hasPrefix("com.jetbrains.") || named {
            let label = name.isEmpty ? id : name
            throw HelperError("input.look_only", "「\(label)」只能看和点：助理不能在这里输入或按键（命令走 Coding）")
        }
    }

    /// The point must be on the target app: the topmost window there is its own, and so is the element there.
    /// A window that shows Molis Work is the Assistant's own confirm, whichever app drew it.
    private func land(_ point: CGPoint, _ pid: pid_t) throws {
        let probe = Observe.probe(point)
        let window = probe["window"] as? [String: Any] ?? [:]
        let element = probe["element"] as? [String: Any] ?? [:]
        let title = (element["window_title"] as? String) ?? ""
        let windowTitle = (window["title"] as? String) ?? ""
        let ownerName = (window["owner"] as? String) ?? ""
        if title.contains("Molis Work") || windowTitle.contains("Molis Work") || ownerName.contains("Molis Work") {
            throw HelperError("landing.covered", "落点在显示着 Molis Work 的窗口上：助理不能操作自己的确认卡")
        }
        let owner = window["pid"] as? Int ?? 0
        if owner != Int(pid) {
            let name = (window["owner"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "别的程序"
            throw HelperError("landing.covered", "落点不在目标应用上：那里是「\(name)」的窗口")
        }
        if let hit = element["pid"] as? Int, hit != Int(pid) {
            throw HelperError("landing.covered", "落点不在目标应用上：那里的控件属于别的程序")
        }
    }

    private func point(_ params: [String: Any], _ name: String = "point") throws -> CGPoint { try params.point(name) }

    // MARK: Pointer

    func pointer(_ params: [String: Any]) throws -> [String: Any] {
        let pid = try params.int32("pid")
        let at = try point(params)
        let button = (params["button"] as? String) ?? "left"
        let clicks = max(1, min(3, params.optionalInt("clicks") ?? 1))
        return try perform {
            try activate(pid)
            try land(at, pid)
            let (down, up, mouse): (CGEventType, CGEventType, CGMouseButton) = switch button {
            case "right": (.rightMouseDown, .rightMouseUp, .right)
            case "middle": (.otherMouseDown, .otherMouseUp, .center)
            default: (.leftMouseDown, .leftMouseUp, .left)
            }
            try post(CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: at, mouseButton: .left))
            try pause(0.05)
            for click in 1...clicks {
                let press = CGEvent(mouseEventSource: source, mouseType: down, mouseCursorPosition: at, mouseButton: mouse)
                press?.setIntegerValueField(.mouseEventClickState, value: Int64(click))
                try post(press)
                let release = CGEvent(mouseEventSource: source, mouseType: up, mouseCursorPosition: at, mouseButton: mouse)
                release?.setIntegerValueField(.mouseEventClickState, value: Int64(click))
                try post(release)
                if click < clicks { usleep(60_000) }
            }
            try pause(0.25)
            return ["done": true]
        }
    }

    func hover(_ params: [String: Any]) throws -> [String: Any] {
        let pid = try params.int32("pid")
        let at = try point(params)
        return try perform {
            try land(at, pid)
            try post(CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: at, mouseButton: .left))
            try pause(0.4)
            return ["done": true]
        }
    }

    func scroll(_ params: [String: Any]) throws -> [String: Any] {
        let pid = try params.int32("pid")
        let at = try point(params)
        let dx = params.optionalDouble("dx") ?? 0, dy = params.optionalDouble("dy") ?? 0
        return try perform {
            try land(at, pid)
            try post(CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: at, mouseButton: .left))
            // A wheel turn of at most 60 points at a time, like a person's: some views ignore one huge delta.
            var leftX = dx, leftY = dy
            while abs(leftX) >= 1 || abs(leftY) >= 1 {
                let stepX = max(-60, min(60, leftX)), stepY = max(-60, min(60, leftY))
                // Positive dy reads "show what is further down"; the wheel's sign is the other way.
                try post(CGEvent(scrollWheelEvent2Source: source, units: .pixel, wheelCount: 2, wheel1: Int32(-stepY.rounded()), wheel2: Int32(-stepX.rounded()), wheel3: 0))
                leftX -= stepX; leftY -= stepY
                usleep(16_000)
            }
            try pause(0.25)
            return ["done": true]
        }
    }

    func drag(_ params: [String: Any]) throws -> [String: Any] {
        let pid = try params.int32("pid")
        let from = try point(params, "from"), to = try point(params, "to")
        return try perform {
            try activate(pid)
            try land(from, pid)
            // Dropping onto another app hands it data: a drag stays inside the target app.
            try land(to, pid)
            try post(CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: from, mouseButton: .left))
            try post(CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: from, mouseButton: .left))
            usleep(80_000)
            for step in 1...16 {
                let t = Double(step) / 16
                let at = CGPoint(x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t)
                try post(CGEvent(mouseEventSource: source, mouseType: .leftMouseDragged, mouseCursorPosition: at, mouseButton: .left))
                usleep(20_000)
            }
            try post(CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: to, mouseButton: .left))
            try pause(0.25)
            return ["done": true]
        }
    }

    // MARK: Keyboard

    static let keyCodes: [String: Int] = [
        "a": kVK_ANSI_A, "b": kVK_ANSI_B, "c": kVK_ANSI_C, "d": kVK_ANSI_D, "e": kVK_ANSI_E, "f": kVK_ANSI_F, "g": kVK_ANSI_G,
        "h": kVK_ANSI_H, "i": kVK_ANSI_I, "j": kVK_ANSI_J, "k": kVK_ANSI_K, "l": kVK_ANSI_L, "m": kVK_ANSI_M, "n": kVK_ANSI_N,
        "o": kVK_ANSI_O, "p": kVK_ANSI_P, "q": kVK_ANSI_Q, "r": kVK_ANSI_R, "s": kVK_ANSI_S, "t": kVK_ANSI_T, "u": kVK_ANSI_U,
        "v": kVK_ANSI_V, "w": kVK_ANSI_W, "x": kVK_ANSI_X, "y": kVK_ANSI_Y, "z": kVK_ANSI_Z,
        "0": kVK_ANSI_0, "1": kVK_ANSI_1, "2": kVK_ANSI_2, "3": kVK_ANSI_3, "4": kVK_ANSI_4, "5": kVK_ANSI_5, "6": kVK_ANSI_6,
        "7": kVK_ANSI_7, "8": kVK_ANSI_8, "9": kVK_ANSI_9,
        "-": kVK_ANSI_Minus, "=": kVK_ANSI_Equal, "[": kVK_ANSI_LeftBracket, "]": kVK_ANSI_RightBracket, "\\": kVK_ANSI_Backslash,
        ";": kVK_ANSI_Semicolon, "'": kVK_ANSI_Quote, ",": kVK_ANSI_Comma, ".": kVK_ANSI_Period, "/": kVK_ANSI_Slash, "`": kVK_ANSI_Grave,
        "return": kVK_Return, "enter": kVK_Return, "tab": kVK_Tab, "space": kVK_Space, "backspace": kVK_Delete, "delete": kVK_Delete,
        "forwarddelete": kVK_ForwardDelete, "escape": kVK_Escape, "esc": kVK_Escape, "left": kVK_LeftArrow, "right": kVK_RightArrow,
        "up": kVK_UpArrow, "down": kVK_DownArrow, "arrowleft": kVK_LeftArrow, "arrowright": kVK_RightArrow, "arrowup": kVK_UpArrow,
        "arrowdown": kVK_DownArrow, "home": kVK_Home, "end": kVK_End, "pageup": kVK_PageUp, "pagedown": kVK_PageDown,
        "f1": kVK_F1, "f2": kVK_F2, "f3": kVK_F3, "f4": kVK_F4, "f5": kVK_F5, "f6": kVK_F6, "f7": kVK_F7, "f8": kVK_F8,
        "f9": kVK_F9, "f10": kVK_F10, "f11": kVK_F11, "f12": kVK_F12,
    ]
    static let modifiers: [String: CGEventFlags] = [
        "cmd": .maskCommand, "command": .maskCommand, "meta": .maskCommand, "shift": .maskShift, "option": .maskAlternate,
        "alt": .maskAlternate, "control": .maskControl, "ctrl": .maskControl, "fn": .maskSecondaryFn,
    ]
    static let printable: Set<String> = Set("abcdefghijklmnopqrstuvwxyz0123456789-=[]\\;',./`".map(String.init)).union(["space"])

    /// One chord: modifiers plus one key, e.g. ["cmd", "s"]. "cmd+s" in one entry means the same.
    func key(_ params: [String: Any]) throws -> [String: Any] {
        let pid = try params.int32("pid")
        let parts = (params.optionalStrings("keys") ?? []).flatMap { $0.split(separator: "+").map { $0.trimmingCharacters(in: .whitespaces).lowercased() } }.filter { !$0.isEmpty }
        var flags: CGEventFlags = []
        var main: [String] = []
        for part in parts { if let flag = Input.modifiers[part] { flags.insert(flag) } else { main.append(part) } }
        guard main.count == 1, let code = Input.keyCodes[main[0]] else {
            throw HelperError("key.unknown", main.count > 1 ? "一次只按一个键（可以加 Cmd、Shift 等修饰键）" : "认不出按键「\(parts.joined(separator: "+"))」")
        }
        return try perform {
            try refuseLookOnly(pid)
            try activate(pid)
            // A character keyed into a password field is a password typed by the Assistant.
            if Input.printable.contains(main[0]) && !flags.contains(.maskCommand) && !flags.contains(.maskControl),
               let focused = AX.element(AX.app(pid), kAXFocusedUIElementAttribute), AX.secure(focused) {
                throw HelperError("field.password", "焦点在密码类输入框里，不替用户输入")
            }
            let press = {
                try self.post(CGEvent(keyboardEventSource: self.source, virtualKey: CGKeyCode(code), keyDown: true), flags: flags)
                try self.post(CGEvent(keyboardEventSource: self.source, virtualKey: CGKeyCode(code), keyDown: false), flags: flags)
            }
            // A printable key without Cmd or Ctrl would start a composition in an input method instead of reaching the app.
            if Input.printable.contains(main[0]) && !flags.contains(.maskCommand) && !flags.contains(.maskControl) { try withPlainKeyboard(press) } else { try press() }
            try pause(0.2)
            return ["done": true]
        }
    }

    /// Types text into the focused field of the target app, without the clipboard. Inserts through accessibility when
    /// the field takes it (no keyboard, so no input method in the way), else as Unicode key events.
    func text(_ params: [String: Any]) throws -> [String: Any] {
        let pid = try params.int32("pid")
        let body = try params.string("text")
        return try perform {
            try refuseLookOnly(pid)
            try activate(pid)
            let app = AX.app(pid)
            guard let focused = AX.element(app, kAXFocusedUIElementAttribute) else { throw HelperError("field.none", "目标应用里没有获得焦点的输入位置：先点一下要输入的地方") }
            if AX.secure(focused) { throw HelperError("field.password", "焦点在密码类输入框里，不替用户输入") }
            var settable: DarwinBoolean = false
            AXUIElementIsAttributeSettable(focused, kAXSelectedTextAttribute as CFString, &settable)
            if settable.boolValue && params.optionalBool("keys_only") != true {
                let before = AX.string(focused, kAXValueAttribute)
                if AXUIElementSetAttributeValue(focused, kAXSelectedTextAttribute as CFString, body as CFString) == .success {
                    usleep(120_000)
                    let after = AX.string(focused, kAXValueAttribute)
                    if before == nil || after != before { lastSynthetic = Date().timeIntervalSince1970; return ["done": true, "via": "accessibility"] }
                }
            }
            try typeUnicode(body)
            try pause(0.2)
            return ["done": true, "via": "keys"]
        }
    }

    /// An input method (Pinyin, Sogou…) swallows synthetic key events: while this helper types, the keyboard is the
    /// plain ASCII-capable layout, and the person's input source is put back afterwards, also when the action stops.
    private func withPlainKeyboard<T>(_ body: () throws -> T) throws -> T {
        guard let current = TISCopyCurrentKeyboardInputSource()?.takeRetainedValue(),
              let plain = TISCopyCurrentASCIICapableKeyboardLayoutInputSource()?.takeRetainedValue() else { return try body() }
        let currentId = TISGetInputSourceProperty(current, kTISPropertyInputSourceID).map { Unmanaged<CFString>.fromOpaque($0).takeUnretainedValue() as String }
        let plainId = TISGetInputSourceProperty(plain, kTISPropertyInputSourceID).map { Unmanaged<CFString>.fromOpaque($0).takeUnretainedValue() as String }
        if currentId == plainId { return try body() }
        TISSelectInputSource(plain)
        usleep(80_000)
        defer { TISSelectInputSource(current) }
        return try body()
    }

    private func typeUnicode(_ body: String) throws {
        try withPlainKeyboard { try typeLines(body) }
    }

    private func typeLines(_ body: String) throws {
        for line in body.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
            if line.offset > 0 { try tap(kVK_Return) }
            var units = Array(String(line.element).utf16)
            while !units.isEmpty {
                let chunk = Array(units.prefix(16))
                units.removeFirst(chunk.count)
                for down in [true, false] {
                    let event = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: down)
                    chunk.withUnsafeBufferPointer { event?.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: $0.baseAddress) }
                    try post(event)
                }
                usleep(12_000)
            }
        }
    }

    private func tap(_ code: Int) throws {
        try post(CGEvent(keyboardEventSource: source, virtualKey: CGKeyCode(code), keyDown: true))
        try post(CGEvent(keyboardEventSource: source, virtualKey: CGKeyCode(code), keyDown: false))
    }

    // MARK: Menus

    /// Chooses a menu item by its titles from the menu bar down, e.g. ["文件", "导出为 PDF…"]. Accessibility press, no pointer.
    func menu(_ params: [String: Any]) throws -> [String: Any] {
        let pid = try params.int32("pid")
        guard let path = params.optionalStrings("path"), !path.isEmpty else { throw HelperError("helper.bad_params", "path is required") }
        return try perform {
            try refuseLookOnly(pid)
            try activate(pid)
            guard let bar = AX.element(AX.app(pid), kAXMenuBarAttribute) else { throw HelperError("menu.none", "这个应用没有菜单栏") }
            var items = AX.elements(bar, kAXChildrenAttribute)
            var chosen: AXUIElement?
            for (depth, title) in path.enumerated() {
                guard let item = items.first(where: { Observe.menuTitle($0) == title }) else {
                    throw HelperError("menu.missing", "第 \(depth + 1) 级没有「\(title)」；有：\(items.map(Observe.menuTitle).filter { !$0.isEmpty }.prefix(40).joined(separator: "、"))")
                }
                chosen = item
                items = AX.elements(item, kAXChildrenAttribute).flatMap { AX.elements($0, kAXChildrenAttribute) }
            }
            guard let chosen else { throw HelperError("menu.missing", "没有这个菜单项") }
            if (AX.copy(chosen, kAXEnabledAttribute) as? NSNumber)?.boolValue == false { throw HelperError("menu.disabled", "菜单项「\(path.last!)」现在不可用") }
            try checkpoint()
            guard AXUIElementPerformAction(chosen, kAXPressAction as CFString) == .success else { throw HelperError("menu.failed", "没能选中菜单项「\(path.last!)」") }
            lastSynthetic = Date().timeIntervalSince1970
            try pause(0.3)
            return ["done": true]
        }
    }
}
