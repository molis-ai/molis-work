/** Public Markdown helpers shared by the documentation gate and by checks on the packed author handbook. */
export function readMarkdown(text: string): { prose: string[]; code: { text: string; line: number }[]; lines: string[] };
export function markdownLinks(prose: readonly string[]): { target: string; line: number }[];
export function headingAnchors(text: string): Set<string>;
export function fileIndex(files: readonly string[]): { has(path: string): boolean; isFile(path: string): boolean; files: readonly string[] };
