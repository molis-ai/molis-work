// 14 · 外观选择与应用规则 — sample data. Every text is [中文, English].
// The skin and font entries read the way the files would (a name, who made it, the recommended font, the colour roles);
// only the colour roles the prototype needs are listed. Folio's colours and the rounded font are stand-ins: Folio's real
// look is settled later (batch 16) and the rounded font waits on decision #23.
window.protoData = {
  plans: [
    ["A", ["A 点了就换，可撤销", "A Switch on click, undo"]],
    ["B", ["B 先在这个窗口试，再用上", "B Try in this window, then apply"]],
    ["C", ["C 旁边一张样张，确认再用", "C Specimen beside, then apply"]],
  ],
  faults: [
    ["none", ["正常", "Normal"]],
    ["slow", ["字体加载慢（先用后备）", "Font loads slowly (fallback first)"]],
    ["fontfail", ["字体没加载上", "Font fails to load"]],
    ["invalid", ["我的方案没通过检查", "My look fails its checks"]],
    ["elsewhere", ["另一个窗口刚改过", "Another window just changed it"]],
    ["nolang", ["系统语言还没有", "System language not available"]],
  ],
  skins: [
    {
      id: "soft", name: ["Soft Workbench", "Soft Workbench"], by: ["内置", "Built in"], font: "system",
      line: ["安静的蓝灰，适合专心工作。", "Quiet blue-grey, for focused work."],
      swatch: { light: ["#eef3f7", "#fcfdfe", "#3c6e98", "#1f2b37"], dark: ["#171d24", "#1f2730", "#8ab4d8", "#e6edf3"] },
      vars: null,
    },
    {
      id: "folio", name: ["Folio", "Folio"], by: ["内置", "Built in"], font: "rounded",
      line: ["配色更丰富，字更圆润，活泼一些。", "Richer colour and rounder type, a little livelier."],
      sample: true,
      swatch: { light: ["#f7f2e8", "#fffdf8", "#3d63d6", "#e8735a", "#4fae8f"], dark: ["#1d1b23", "#27242e", "#93abff", "#f29a85", "#7fcfb2"] },
      vars: {
        light: { "--desk": "#f7f2e8", "--page": "#f7f2e8", "--rail": "#f0e9dc", "--paper": "#fffdf8", "--canvas": "#fffdf8", "--surface": "#fffdf8", "--panel": "#fffdf8", "--popover": "#fffdf8", "--line": "#ebe2d2", "--line-strong": "#ddd2bf", "--ink": "#28242e", "--ink-soft": "#4a4452", "--muted": "#6b6474", "--faint": "#958e9c", "--accent": "#3d63d6", "--accent-strong": "#2f50b8", "--accent-soft": "#e6ebfb", "--action": "#2f50b8", "--action-hover": "#2a479f", "--link": "#3d63d6", "--nav-hover": "color-mix(in srgb, #3d63d6 7%, transparent)", "--nav-active": "color-mix(in srgb, #3d63d6 12%, transparent)", "--radius-control": "12px", "--r-control": "12px", "--r-card": "16px", "--radius-surface": "18px" },
        dark: { "--desk": "#1d1b23", "--page": "#1d1b23", "--rail": "#23212a", "--paper": "#27242e", "--canvas": "#27242e", "--surface": "#27242e", "--panel": "#27242e", "--popover": "#2d2a35", "--line": "#35313e", "--line-strong": "#433e4d", "--ink": "#f1ecf4", "--ink-soft": "#d6d0dc", "--muted": "#aaa3b4", "--faint": "#7f788a", "--accent": "#93abff", "--accent-strong": "#b1c3ff", "--accent-soft": "#2c3352", "--action": "#b1c3ff", "--action-hover": "#c4d1ff", "--link": "#93abff", "--nav-hover": "color-mix(in srgb, #93abff 9%, transparent)", "--nav-active": "color-mix(in srgb, #93abff 16%, transparent)", "--radius-control": "12px", "--r-control": "12px", "--r-card": "16px", "--radius-surface": "18px" },
      },
    },
    {
      id: "garden", name: ["蓝绿工作台", "Blue-green desk"], by: ["我的方案 · 和助理一起做的", "Mine · made with the assistant"], font: "rounded", mine: true,
      line: ["蓝绿为主，圆润一点，也能专心。", "Mostly blue-green, a little rounder, still focused."],
      swatch: { light: ["#eef6f4", "#fbfefd", "#1f7a72", "#2b6cb0"], dark: ["#16201f", "#1d2928", "#73c7bd", "#8cb8ec"] },
      vars: {
        light: { "--desk": "#eef6f4", "--page": "#eef6f4", "--rail": "#e6f0ed", "--paper": "#fbfefd", "--canvas": "#fbfefd", "--surface": "#fbfefd", "--panel": "#fbfefd", "--popover": "#fbfefd", "--line": "#dbe8e4", "--line-strong": "#c9dcd6", "--accent": "#1f7a72", "--accent-strong": "#18645d", "--accent-soft": "#dcefeb", "--action": "#18645d", "--link": "#1f7a72", "--nav-active": "color-mix(in srgb, #1f7a72 12%, transparent)", "--radius-control": "12px", "--r-control": "12px", "--r-card": "14px" },
        dark: { "--desk": "#16201f", "--page": "#16201f", "--rail": "#1a2524", "--paper": "#1d2928", "--canvas": "#1d2928", "--surface": "#1d2928", "--panel": "#1d2928", "--popover": "#22302f", "--line": "#2a3a38", "--line-strong": "#344846", "--accent": "#73c7bd", "--accent-strong": "#94d8cf", "--accent-soft": "#1f3a37", "--action": "#94d8cf", "--link": "#73c7bd", "--nav-active": "color-mix(in srgb, #73c7bd 14%, transparent)", "--radius-control": "12px", "--r-control": "12px", "--r-card": "14px" },
      },
      problems: [
        ["深色下正文和底色的对比只有 3.1 : 1，至少要 4.5 : 1。", "In dark, body text on its ground is 3.1 : 1; it needs at least 4.5 : 1."],
        ["推荐字体「Nunito」不在这台电脑上，也没有随方案带来。", "Its font “Nunito” is not on this Mac and did not come with the look."],
      ],
    },
  ],
  // Font schemes. The rounded one stands in for the real choice (decision #23).
  fonts: [
    { id: "system", name: ["系统无衬线", "System sans"], note: ["苹方、SF，和系统一致", "PingFang and SF, as the system uses"] },
    { id: "rounded", name: ["圆润", "Rounded"], note: ["示意：先用本机圆体代替，正式字体待定", "Stand-in: this Mac's rounded face; the real one is still to be chosen"] },
    { id: "reading", name: ["宽松阅读", "Relaxed reading"], note: ["界面字不变，长文用衬线、行距更宽", "Same interface type; long text in a serif with more leading"] },
  ],
  monos: [
    ["system", ["系统等宽（SF Mono）", "System mono (SF Mono)"]],
    ["menlo", ["Menlo", "Menlo"]],
  ],
  systemLang: { ok: ["中文（简体）", "Chinese (Simplified)"], missing: ["日本語", "Japanese"] },
};
