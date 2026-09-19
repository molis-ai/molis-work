/** Public Molis Work theme and visual foundation owned by the Design System package. */
export type MolisWorkTheme = "light" | "dark" | "system";
export type MolisWorkDensity = "standard" | "compact";
export type MolisWorkTerminalTheme = "auto" | "light" | "dark";

export const MOLIS_WORK_THEME_STORAGE_KEY = "molis-work:theme";
export const MOLIS_WORK_DENSITY_STORAGE_KEY = "molis-work:density";
export const MOLIS_WORK_TERMINAL_THEME_STORAGE_KEY = "molis-work:terminal-theme";

export const THEME_BOOTSTRAP_SCRIPT = `
(() => {
  const themeKey = "${MOLIS_WORK_THEME_STORAGE_KEY}";
  const densityKey = "${MOLIS_WORK_DENSITY_STORAGE_KEY}";
  const terminalThemeKey = "${MOLIS_WORK_TERMINAL_THEME_STORAGE_KEY}";
  const validThemes = new Set(["light", "dark", "system"]);
  const validDensities = new Set(["standard", "compact"]);
  const validTerminalThemes = new Set(["auto", "light", "dark"]);
  let theme = "system";
  let density = "standard";
  let terminalTheme = "auto";
  try {
    const storedTheme = localStorage.getItem(themeKey);
    const storedDensity = localStorage.getItem(densityKey);
    const storedTerminalTheme = localStorage.getItem(terminalThemeKey);
    if (storedTheme && validThemes.has(storedTheme)) theme = storedTheme;
    if (storedDensity && validDensities.has(storedDensity)) density = storedDensity;
    if (storedTerminalTheme && validTerminalThemes.has(storedTerminalTheme)) terminalTheme = storedTerminalTheme;
  } catch {}
  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const resolvedTheme = theme === "system" ? (dark ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.resolvedTheme = resolvedTheme;
  document.documentElement.dataset.density = density;
  document.documentElement.dataset.terminalTheme = terminalTheme;
  document.documentElement.dataset.resolvedTerminalTheme = terminalTheme === "auto" ? resolvedTheme : terminalTheme;
})();`;

export const VISUAL_FOUNDATION_CLIENT_SCRIPT = `
(() => {
  const themeKey = "${MOLIS_WORK_THEME_STORAGE_KEY}";
  const densityKey = "${MOLIS_WORK_DENSITY_STORAGE_KEY}";
  const terminalThemeKey = "${MOLIS_WORK_TERMINAL_THEME_STORAGE_KEY}";
  const themeOptions = ["light", "dark", "system"];
  const densityOptions = ["standard", "compact"];
  const terminalThemeOptions = ["auto", "light", "dark"];
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
  document.querySelectorAll("[data-theme-option]").forEach((button) => {
    button.addEventListener("click", () => {
      applyTheme(button.getAttribute("data-theme-option"), true);
      button.closest("details")?.removeAttribute("open");
    });
  });
  document.querySelectorAll("[data-density-option]").forEach((button) => {
    button.addEventListener("click", () => {
      applyDensity(button.getAttribute("data-density-option"), true);
    });
  });
  document.querySelectorAll("[data-terminal-theme-option]").forEach((button) => {
    button.addEventListener("click", () => {
      applyTerminalTheme(button.getAttribute("data-terminal-theme-option"), true);
    });
  });
  media.addEventListener?.("change", () => {
    if (readTheme() === "system") applyTheme("system");
  });
  window.addEventListener("storage", (event) => {
    if (event.key === themeKey) applyTheme(readTheme());
    if (event.key === densityKey) applyDensity(readDensity());
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
    anchor.setAttribute("aria-busy", "true");
  });
  window.addEventListener("pageshow", () => {
    delete document.body.dataset.navigationPending;
    document.querySelectorAll('a[aria-busy="true"]').forEach((anchor) => anchor.removeAttribute("aria-busy"));
  });
  applyTheme(readTheme());
  applyDensity(readDensity());
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

