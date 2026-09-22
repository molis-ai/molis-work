/** Languages a code block may declare. A curated set keeps the editor bundle honest. */
export const PAGES_CODE_LANGUAGES = [
  { id: "", label: "纯文本" },
  { id: "bash", label: "Shell" },
  { id: "css", label: "CSS" },
  { id: "go", label: "Go" },
  { id: "java", label: "Java" },
  { id: "javascript", label: "JavaScript" },
  { id: "json", label: "JSON" },
  { id: "markdown", label: "Markdown" },
  { id: "python", label: "Python" },
  { id: "rust", label: "Rust" },
  { id: "sql", label: "SQL" },
  { id: "typescript", label: "TypeScript" },
  { id: "xml", label: "HTML / XML" },
  { id: "yaml", label: "YAML" },
] as const;

const LANGUAGE_IDS = new Set<string>(PAGES_CODE_LANGUAGES.map((item) => item.id).filter(Boolean));

/** Aliases people actually type or paste, folded onto the grammar that handles them. */
const ALIASES: Record<string, string> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", node: "javascript",
  ts: "typescript", tsx: "typescript",
  py: "python", py3: "python",
  sh: "bash", shell: "bash", zsh: "bash", console: "bash",
  html: "xml", svg: "xml", vue: "xml",
  yml: "yaml", golang: "go", rs: "rust", postgres: "sql", mysql: "sql", md: "markdown",
};

/** Resolve a stored or pasted language name to a registered grammar; anything else means plain text. */
export function safePagesLanguage(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (LANGUAGE_IDS.has(raw)) return raw;
  const alias = ALIASES[raw];
  return alias && LANGUAGE_IDS.has(alias) ? alias : "";
}
