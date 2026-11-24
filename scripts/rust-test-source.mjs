// Return the annotated test functions in a rustfmt-formatted file. Product code in the same
// module is not test evidence. Both the inventory and the acceptance report use this reader.
export function rustTestSource(file, read) {
  if (!file.endsWith(".rs") || /(^|\/)(fixtures|vendor|node_modules|dist|\.impeccable)\//.test(file)) return null;
  const lines = read(file)?.split(/\r?\n/);
  if (!lines) return null;
  const tests = [];
  for (let index = 0; index < lines.length; index++) {
    if (!/^\s*#\[(?:\w+::)*test(?:\([^\]]*\))?\]\s*(?:\/\/.*)?$/.test(lines[index])) continue;
    let declaration = index + 1;
    while (declaration < lines.length && /^\s*(?:#\[.*\]|\/\/.*)?$/.test(lines[declaration])) declaration++;
    const fn = lines[declaration]?.match(/^([ \t]*)(?:(?:pub(?:\([^)]*\))?|async|unsafe)\s+)*fn\s+\w+\b/);
    if (!fn) continue;
    let end = declaration;
    if (!/\{.*\}\s*(?:\/\/.*)?$/.test(lines[end])) {
      while (++end < lines.length && lines[end].trimEnd() !== fn[1] + "}") {
        // Another item at the same indentation belongs to a different function.
        if (lines[end].startsWith(fn[1] + "fn ") || lines[end].startsWith(fn[1] + "#[")) break;
      }
      if (end === lines.length || lines[end].trimEnd() !== fn[1] + "}") continue;
    }
    tests.push(lines.slice(index, end + 1).join("\n"));
    index = end;
  }
  return tests.length ? tests.join("\n") : null;
}
