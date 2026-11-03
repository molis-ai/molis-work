/** Loose matching: every typed character in order, so "ctx" finds "上下文与用量 /usage" by its slash word too. */
export function matches(needle: string, ...hay: unknown[]): boolean {
  const word = needle.toLowerCase().trim();
  if (!word) return true;
  return hay.some(text => {
    const value = String(text || "").toLowerCase();
    if (value.includes(word)) return true;
    let at = 0;
    for (const char of value) {
      if (char === word[at]) at++;
      if (at === word.length) return true;
    }
    return false;
  });
}

const mac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** A shortcut as the platform writes it: `Mod+Alt+N` is ⌘⌥N on a Mac and Ctrl+Alt+N elsewhere. */
export function keyLabel(keys: string): string {
  const apple = mac();
  return keys.replace(/Mod/g, apple ? "⌘" : "Ctrl").replace(/Alt/g, apple ? "⌥" : "Alt").replace(/Shift/g, apple ? "⇧" : "Shift").replace(/\+/g, apple ? "" : "+");
}
