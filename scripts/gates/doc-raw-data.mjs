// Gate: docs/ holds no raw captures and no developer-machine paths (user 2026-10-18, after #717 committed two raw product-
// operations captures of about 1.5 MB each, full of a private repository's local paths; docs/system/REPOSITORY-HYGIENE.md
// «原始采集与开发机路径»). Two rules over every tracked file under docs/, archive/ included; no baseline, any hit fails:
//
//   size   a .json file over `docsJsonBytes` bytes of tooling/gates/limits.json (UTF-8 bytes of the text as read). The limit
//          may only be tightened (check-health-gates.mjs compares it with the merge-base's). A limits.json without it fails
//          as soon as docs/ holds a .json for it to bound, so dropping the key does not switch the rule off.
//   path   an absolute path into a person's home folder: /Users/<name> or /home/<name>, where <name> is one or more characters
//          other than a slash, white space, quotes, brackets, `*`, `$`, `%`, `|` or `\`, not ending in sentence punctuation
//          (`.`, `,`, `;`, `:`, `!`, `?`, which the reported match leaves off; so the written placeholders
//          /Users/<name>/, /home/$USER/, /home/*/ and a bare /Users/ are not hits). The slash before Users/home must not
//          follow a letter, digit, `.`, `_`, `~` or `-`, so a repository-relative path that has a home/ folder in it
//          (apps/x/home/y) and ~/home/y are not hits; file:///Users/<name>, C:/Users/<name> and HOME=/Users/<name> are.
//
// Not read (scripts/gates/README.md, 门禁读不到的): files outside docs/ (specs/, source, tests); Windows paths written with
// backslashes; a home folder written another way (~user, $HOME expanded by hand into a non-home root such as /opt/<name>,
// /root/); a .json under another extension (.jsonl, .geojson, .txt); a large capture that is not .json.
export const DOCS_JSON_LIMIT_KEY = "docsJsonBytes";
const LIMITS = "tooling/gates/limits.json";
const DEVELOPER_PATH = /(?<![\p{L}\p{N}._~-])\/(?:Users|home)\/[^\s/"'`<>()[\]{}*$%|\\]*[^\s/"'`<>()[\]{}*$%|\\.,;:!?]/gu;

const inDocs = (file) => file.startsWith("docs/");
const isJson = (file) => /\.json$/i.test(file);

function jsonLimit(snapshot) {
  const text = snapshot.read(LIMITS);
  if (text === null) return undefined;
  try { return JSON.parse(text)[DOCS_JSON_LIMIT_KEY]; } catch { return undefined; }
}

export function docRawDataProblems(snapshot) {
  const files = snapshot.files.filter(inDocs);
  const problems = [];
  const limit = jsonLimit(snapshot);
  const jsonFiles = files.filter(isJson);
  if (jsonFiles.length && !(limit > 0)) {
    problems.push(`${LIMITS} has no positive "${DOCS_JSON_LIMIT_KEY}", and docs/ holds ${jsonFiles.length} .json file(s) for it to bound`);
  }
  for (const file of files) {
    const text = snapshot.read(file);
    if (text === null) continue;
    if (limit > 0 && isJson(file)) {
      const bytes = Buffer.byteLength(text, "utf8");
      if (bytes > limit) problems.push(`${file} is ${bytes} bytes, over the ${limit} a .json under docs/ may hold ("${DOCS_JSON_LIMIT_KEY}" in ${LIMITS}); keep raw captures outside the repository`);
    }
    text.split("\n").forEach((line, index) => {
      for (const match of line.matchAll(DEVELOPER_PATH)) {
        problems.push(`${file}:${index + 1}: ${match[0]} is a path on a developer's machine; write ~/.molis-work, ~/<path> or a repository-relative path`);
      }
    });
  }
  return problems;
}
