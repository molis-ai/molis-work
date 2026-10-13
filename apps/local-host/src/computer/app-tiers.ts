/**
 * Which apps the Assistant may look at and how far it may act in them (specs/computer-use D04, D17, D18).
 *
 * - forbidden: not even looked at — System Settings, Keychain Access, password managers, payment and banking apps,
 *   Molis Work itself and its helper. The person may add apps, never take built-in ones away.
 * - look-and-click: terminals, IDEs and apps that run scripts, and windows into another computer (remote desktops,
 *   virtual machines). Looking, clicking, scrolling and hovering only: no typing, no keys — commands go through Coding,
 *   and on another computer none of these tiers would hold.
 * - ask: every other app, the person's own browsers included; each step asks unless the person allowed the app for
 *   this round.
 *
 * Matching is by bundle id first; names are a fallback that only ever makes an app stricter.
 */
export type AppTier = "forbidden" | "look-and-click" | "ask";

export interface AppIdentity { readonly bundle_id: string; readonly name: string }

export interface AppTierVerdict { readonly tier: AppTier; readonly reason: string; readonly built_in: boolean }

/** Molis Work's own desktop app and the helper: the Assistant must never reach its own approval cards. */
export const MOLIS_BUNDLE_PREFIX = "com.molis.work";

/** A browser window whose title carries this shows Molis Work (every workbench page title ends in " · Molis Work"). */
export const MOLIS_WINDOW_MARKER = "Molis Work";

const FORBIDDEN_IDS: Readonly<Record<string, string>> = {
  "com.apple.systempreferences": "系统设置",
  "com.apple.SystemSettings": "系统设置",
  "com.apple.keychainaccess": "钥匙串访问",
  "com.apple.Passwords": "密码",
  "com.apple.SecurityAgent": "系统授权对话框",
  "com.apple.loginwindow": "登录窗口",
  "com.apple.notificationcenterui": "通知中心",
  "com.1password.1password": "密码管理器",
  "com.agilebits.onepassword7": "密码管理器",
  "com.agilebits.onepassword-osx": "密码管理器",
  "com.agilebits.onepassword4": "密码管理器",
  "com.bitwarden.desktop": "密码管理器",
  "com.8bit.bitwarden": "密码管理器",
  "com.lastpass.LastPass": "密码管理器",
  "com.dashlane.dashlanephonefinal": "密码管理器",
  "org.keepassxc.keepassxc": "密码管理器",
  "com.keepassium.ios": "密码管理器",
  "in.sinew.Enpass-Desktop": "密码管理器",
  "com.callpod.keepermac": "密码管理器",
  "com.nordpass.macos.nordpass": "密码管理器",
  "me.proton.pass.electron": "密码管理器",
  "com.siber.roboform": "密码管理器",
  "com.markmcguill.strongbox.mac": "密码管理器",
  "com.alipay.iphoneclient": "支付应用",
  "com.paypal.PPClient": "支付应用",
  "com.cmbchina.MPBBank": "银行应用",
  "com.icbc.iphoneclient": "银行应用",
  "com.ccb.CCBMobileBank": "银行应用",
  "com.abchina.ebank": "银行应用",
  "com.boc.BOCMBCI": "银行应用",
  "com.unionpay.chsp": "支付应用",
};

const FORBIDDEN_NAME = /password|密码|1password|bitwarden|keepass|lastpass|dashlane|enpass|keeper|nordpass|proton pass|roboform|strongbox|keychain|钥匙串|\bbank\b|银行|\bpay\b|支付|钱包|wallet|alipay|paypal|unionpay|云闪付|证券|securities|broker|股票|基金|信用卡|robinhood|coinbase|binance|crypto|ledger live|trezor|富途|futu|老虎证券|雪球|同花顺|东方财富/iu;
const FORBIDDEN_ID = /bank|alipay|paypal|wallet|unionpay|securities|password|keychain/iu;

const LOOK_AND_CLICK_IDS: ReadonlySet<string> = new Set([
  "com.apple.Terminal", "com.googlecode.iterm2", "dev.warp.Warp-Stable", "dev.warp.Warp", "com.mitchellh.ghostty", "org.alacritty",
  "io.alacritty", "net.kovidgoyal.kitty", "com.github.wez.wezterm", "co.zeit.hyper", "org.tabby", "com.termius-dmg.mac",
  "com.microsoft.VSCode", "com.microsoft.VSCodeInsiders", "com.vscodium", "com.todesktop.230313mzl4w4u92", "com.exafunction.windsurf",
  "dev.zed.Zed", "dev.zed.Zed-Preview", "com.apple.dt.Xcode", "com.google.android.studio", "com.sublimetext.4", "com.sublimetext.3",
  "com.panic.Nova", "org.vim.MacVim", "org.gnu.Emacs", "com.qvacua.VimR",
  "com.apple.ScriptEditor2", "com.apple.Automator", "com.apple.shortcuts",
  "com.apple.ScreenSharing", "com.teamviewer.TeamViewer", "com.philandro.anydesk", "com.netease.uuremote", "com.microsoft.rdc.macos",
  "com.edovia.jumpdesktop.mac", "com.parallels.desktop.console", "com.vmware.fusion", "com.utmapp.UTM",
]);
const LOOK_AND_CLICK_PREFIXES = ["com.jetbrains."];
const LOOK_AND_CLICK_NAME = /terminal|终端|iterm|ghostty|alacritty|wezterm|visual studio|xcode|intellij|pycharm|webstorm|goland|clion|rubymine|phpstorm|datagrip|android studio|vscodium|\bvim\b|emacs|remote desktop|远程|screen sharing|屏幕共享|teamviewer|anydesk|parallels|vmware/iu;

/**
 * The tier of one app. `userForbidden` are bundle ids the person added; they can only make an app forbidden.
 */
export function tierOf(app: AppIdentity, userForbidden: readonly string[] = []): AppTierVerdict {
  const id = app.bundle_id;
  if (id === MOLIS_BUNDLE_PREFIX || id.startsWith(`${MOLIS_BUNDLE_PREFIX}.`)) {
    return { tier: "forbidden", reason: "Molis Work 自己的窗口：助理不能操作自己的确认卡", built_in: true };
  }
  const named = FORBIDDEN_IDS[id];
  if (named) return { tier: "forbidden", reason: `${named}：助理连看都不看`, built_in: true };
  if (FORBIDDEN_ID.test(id) || FORBIDDEN_NAME.test(app.name)) {
    return { tier: "forbidden", reason: "密码、支付或银行类应用：助理连看都不看", built_in: true };
  }
  if (userForbidden.includes(id)) return { tier: "forbidden", reason: "用户禁止助理查看或操作这个应用", built_in: false };
  if (LOOK_AND_CLICK_IDS.has(id) || LOOK_AND_CLICK_PREFIXES.some(prefix => id.startsWith(prefix)) || LOOK_AND_CLICK_NAME.test(app.name)) {
    return { tier: "look-and-click", reason: "终端、开发工具或远程桌面：助理只能看和点，不能输入或按键（命令走 Coding）", built_in: true };
  }
  return { tier: "ask", reason: "每一步先问用户", built_in: true };
}

/** Actions a look-and-click app still allows. Everything else is refused before Prologue is even asked. */
export const LOOK_AND_CLICK_ACTIONS: ReadonlySet<string> = new Set(["pointer", "scroll", "hover", "wait", "app"]);

/** A window that shows Molis Work, whatever app draws it (the person's browser in web mode). */
export function showsMolis(windowTitle: string): boolean {
  return windowTitle.includes(MOLIS_WINDOW_MARKER);
}
