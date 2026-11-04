/** Public Molis Work theme and visual foundation owned by the Design System package. */
export type MolisWorkTheme = "light" | "dark" | "system";
export type MolisWorkDensity = "standard" | "compact";
export type MolisWorkTerminalTheme = "auto" | "light" | "dark";
/** Component skins (DESIGN「皮肤」): Soft Workbench is the default; Tray and Pill restate the primitives (styles/skins.ts). */
export type MolisWorkSkin = "soft" | "tray" | "pill";

export const MOLIS_WORK_THEME_STORAGE_KEY = "molis-work:theme";
export const MOLIS_WORK_DENSITY_STORAGE_KEY = "molis-work:density";
export const MOLIS_WORK_TERMINAL_THEME_STORAGE_KEY = "molis-work:terminal-theme";
export const MOLIS_WORK_SKIN_STORAGE_KEY = "molis-work:skin";

export const THEME_BOOTSTRAP_SCRIPT = `
(() => {
  const themeKey = "${MOLIS_WORK_THEME_STORAGE_KEY}";
  const densityKey = "${MOLIS_WORK_DENSITY_STORAGE_KEY}";
  const terminalThemeKey = "${MOLIS_WORK_TERMINAL_THEME_STORAGE_KEY}";
  const skinKey = "${MOLIS_WORK_SKIN_STORAGE_KEY}";
  const validThemes = new Set(["light", "dark", "system"]);
  const validDensities = new Set(["standard", "compact"]);
  const validTerminalThemes = new Set(["auto", "light", "dark"]);
  const validSkins = new Set(["soft", "tray", "pill"]);
  let theme = "system";
  let density = "standard";
  let terminalTheme = "auto";
  let skin = "soft";
  try {
    const storedTheme = localStorage.getItem(themeKey);
    const storedDensity = localStorage.getItem(densityKey);
    const storedTerminalTheme = localStorage.getItem(terminalThemeKey);
    if (storedTheme && validThemes.has(storedTheme)) theme = storedTheme;
    if (storedDensity && validDensities.has(storedDensity)) density = storedDensity;
    if (storedTerminalTheme && validTerminalThemes.has(storedTerminalTheme)) terminalTheme = storedTerminalTheme;
    const storedSkin = localStorage.getItem(skinKey);
    if (storedSkin && validSkins.has(storedSkin)) skin = storedSkin;
  } catch {}
  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const resolvedTheme = theme === "system" ? (dark ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.resolvedTheme = resolvedTheme;
  document.documentElement.dataset.density = density;
  document.documentElement.dataset.skin = skin;
  document.documentElement.dataset.terminalTheme = terminalTheme;
  document.documentElement.dataset.resolvedTerminalTheme = terminalTheme === "auto" ? resolvedTheme : terminalTheme;
})();`;

export const VISUAL_FOUNDATION_CLIENT_SCRIPT = `
(() => {
  const themeKey = "${MOLIS_WORK_THEME_STORAGE_KEY}";
  const densityKey = "${MOLIS_WORK_DENSITY_STORAGE_KEY}";
  const terminalThemeKey = "${MOLIS_WORK_TERMINAL_THEME_STORAGE_KEY}";
  const skinKey = "${MOLIS_WORK_SKIN_STORAGE_KEY}";
  const themeOptions = ["light", "dark", "system"];
  const densityOptions = ["standard", "compact"];
  const terminalThemeOptions = ["auto", "light", "dark"];
  const skinOptions = ["soft", "tray", "pill"];
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const readTheme = () => {
    try {
      const value = localStorage.getItem(themeKey);
      return themeOptions.includes(value) ? value : "system";
    } catch {
      return "system";
    }
  };
  const readDensity = () => {
    try {
      const value = localStorage.getItem(densityKey);
      return densityOptions.includes(value) ? value : "standard";
    } catch {
      return "standard";
    }
  };
  const readTerminalTheme = () => {
    try {
      const value = localStorage.getItem(terminalThemeKey);
      return terminalThemeOptions.includes(value) ? value : "auto";
    } catch {
      return "auto";
    }
  };
  const readSkin = () => {
    try {
      const value = localStorage.getItem(skinKey);
      return skinOptions.includes(value) ? value : "soft";
    } catch {
      return "soft";
    }
  };
  const applySkin = (preference, persist = false) => {
    const next = skinOptions.includes(preference) ? preference : "soft";
    if (persist) {
      try { localStorage.setItem(skinKey, next); } catch { /* blocked storage: the skin still applies to this page */ }
    }
    document.documentElement.dataset.skin = next;
    document.querySelectorAll("[data-skin-option]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-skin-option") === next));
    });
  };
  const applyTerminalTheme = (preference, persist = false) => {
    const next = terminalThemeOptions.includes(preference) ? preference : "auto";
    if (persist) {
      try { localStorage.setItem(terminalThemeKey, next); } catch {}
    }
    const resolved = next === "auto"
      ? (document.documentElement.dataset.resolvedTheme || (media.matches ? "dark" : "light"))
      : next;
    const previousResolved = document.documentElement.dataset.resolvedTerminalTheme;
    document.documentElement.dataset.terminalTheme = next;
    document.documentElement.dataset.resolvedTerminalTheme = resolved;
    document.querySelectorAll("[data-terminal-theme-option]").forEach((button) => {
      const selected = button.getAttribute("data-terminal-theme-option") === next;
      button.setAttribute("aria-pressed", String(selected));
    });
    if (previousResolved !== resolved) {
      window.dispatchEvent(new CustomEvent("molis-work:terminal-theme-change", { detail: { theme: resolved } }));
    }
  };
  const applyTheme = (preference, persist = false) => {
    const next = themeOptions.includes(preference) ? preference : "system";
    if (persist) {
      try { localStorage.setItem(themeKey, next); } catch {}
    }
    document.documentElement.dataset.theme = next;
    document.documentElement.dataset.resolvedTheme = next === "system" ? (media.matches ? "dark" : "light") : next;
    document.querySelectorAll("[data-theme-option]").forEach((button) => {
      const selected = button.getAttribute("data-theme-option") === next;
      button.setAttribute("aria-pressed", String(selected));
    });
    applyTerminalTheme(readTerminalTheme());
  };
  const applyDensity = (preference, persist = false) => {
    const next = densityOptions.includes(preference) ? preference : "standard";
    if (persist) {
      try { localStorage.setItem(densityKey, next); } catch {}
    }
    document.documentElement.dataset.density = next;
    document.querySelectorAll("[data-density-option]").forEach((button) => {
      const selected = button.getAttribute("data-density-option") === next;
      button.setAttribute("aria-pressed", String(selected));
    });
  };
  // Delegated, so controls rendered after load (settings panes, onboarding steps) choose the same way.
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const theme = target?.closest("[data-theme-option]");
    if (theme) {
      applyTheme(theme.getAttribute("data-theme-option"), true);
      theme.closest("details")?.removeAttribute("open");
      return;
    }
    const density = target?.closest("[data-density-option]");
    if (density) { applyDensity(density.getAttribute("data-density-option"), true); return; }
    const skin = target?.closest("[data-skin-option]");
    if (skin) { applySkin(skin.getAttribute("data-skin-option"), true); return; }
    const terminal = target?.closest("[data-terminal-theme-option]");
    if (terminal) applyTerminalTheme(terminal.getAttribute("data-terminal-theme-option"), true);
  });
  globalThis.molisWorkPreferences = Object.freeze({
    theme: readTheme, density: readDensity, skin: readSkin,
    sync() { applyTheme(readTheme()); applyDensity(readDensity()); applySkin(readSkin()); },
  });
  media.addEventListener?.("change", () => {
    if (readTheme() === "system") applyTheme("system");
  });
  window.addEventListener("storage", (event) => {
    if (event.key === themeKey) applyTheme(readTheme());
    if (event.key === densityKey) applyDensity(readDensity());
    if (event.key === skinKey) applySkin(readSkin());
    if (event.key === terminalThemeKey) applyTerminalTheme(readTerminalTheme());
  });
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target : null;
    const anchor = target?.closest("a[href]");
    if (!anchor || anchor.hasAttribute("download") || anchor.getAttribute("target")) return;
    const destination = new URL(anchor.href, location.href);
    if (destination.origin !== location.origin) return;
    if (destination.pathname === location.pathname && destination.search === location.search && destination.hash) return;
    document.body.dataset.navigationPending = "true";
    if (!document.querySelector('.mw-navigation-loading')) { const mark = document.createElement('span'); mark.className = 'mw-navigation-loading'; mark.dataset.mwState = 'running'; mark.setAttribute('aria-hidden', 'true'); document.body.append(mark); }
    anchor.setAttribute("aria-busy", "true");
  });
  window.addEventListener("pageshow", () => {
    delete document.body.dataset.navigationPending;
    document.querySelector('.mw-navigation-loading')?.remove();
    document.querySelectorAll('a[aria-busy="true"]').forEach((anchor) => anchor.removeAttribute("aria-busy"));
  });
  applyTheme(readTheme());
  applyDensity(readDensity());
  applySkin(readSkin());
  // A short tactile tick only confirms a direct touch selection on supporting devices.
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let touchSelection = false;
  document.addEventListener("pointerdown", (event) => { touchSelection = event.pointerType === "touch"; }, { passive: true });
  document.addEventListener("keydown", () => { touchSelection = false; }, { passive: true });
  document.addEventListener("change", (event) => {
    if (!touchSelection || reducedMotion.matches || typeof navigator.vibrate !== "function") return;
    if (!event.target.matches?.('input[type="checkbox"], input[type="radio"], select')) return;
    if (event.target.disabled || !event.isTrusted) return;
    navigator.vibrate(8);
    touchSelection = false;
  });
})();`;

