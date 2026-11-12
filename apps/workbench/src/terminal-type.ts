/** Both terminal mounts use the same code role as the rest of the rendered document. */
export function terminalTypography(element: HTMLElement): { fontFamily: string; fontSize: number; lineHeight: number } {
  const style = getComputedStyle(element);
  return {
    fontFamily: style.getPropertyValue("--font-mono").trim() || "monospace",
    fontSize: Number.parseFloat(style.getPropertyValue("--type-code-size")) || 13,
    lineHeight: Number.parseFloat(style.getPropertyValue("--type-code-line-height")) || 1.3,
  };
}
