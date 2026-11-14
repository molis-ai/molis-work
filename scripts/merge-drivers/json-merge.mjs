// A three-way merge of JSON documents by key, keeping the file's own formatting (scripts/merge-drivers/driver.mjs runs it for git).
//
// THE MERGE. At every key, if the two sides agree, or only one side changed the value (adding, changing or deleting it), that side
// wins. When both changed it differently and both values are plain objects, the merge goes one level down; otherwise it is a
// conflict and the whole file is left to git's own line merge. An array changed differently on both sides is a conflict unless the
// caller names how its elements are told apart (`identities`, see rules.mjs): then it is merged like an object whose keys are those
// identities. Duplicate keys, or two elements with one identity, are refused (thrown), never guessed at.
//
// THE TEXT. Nothing is re-serialised that does not have to be: a value that comes whole from one side is copied as that side wrote
// it, byte for byte. Only an object or array whose members came from both sides is written again, and then every member keeps the
// whitespace before it, its key and its key separator as its own side wrote them, the closing bracket keeps the current side's
// whitespace, and the members stand in the current side's order with each new member placed after the member it follows on its own
// side (new members both sides added at one place come out in name order). A file written by JSON.stringify(value, null, n)
// therefore comes out exactly as JSON.stringify would write the merged value, and a hand-laid one (an inline array, an odd indent)
// keeps its layout. The result is parsed again and compared with the merged value before it is returned.

/** A parse error or a shape this merge will not guess at (thrown); the driver then falls back to git's line merge. */
const refuse = (reason) => new Error(`json-merge refused: ${reason}`);

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);

/** Parse `text` into nodes that remember where each value sits in the text. */
export function parseWithSpans(text) {
  let at = 0;
  const skip = () => { while (at < text.length && WHITESPACE.has(text[at])) at++; };
  const fail = (what) => { throw refuse(`${what} at offset ${at}`); };
  const string = () => {
    const start = at++;
    while (at < text.length && text[at] !== "\"") at += text[at] === "\\" ? 2 : 1;
    if (at >= text.length) fail("unterminated string");
    at++;
    return { start, end: at, value: JSON.parse(text.slice(start, at)) };
  };
  const value = () => {
    skip();
    const start = at;
    const char = text[at];
    if (char === "{") {
      at++;
      const members = [];
      const keys = new Set();
      let leadStart = at;
      skip();
      if (text[at] === "}") { at++; return { kind: "object", start, end: at, members, closeLead: text.slice(leadStart, at - 1) }; }
      for (;;) {
        skip();
        const lead = text.slice(leadStart, at);
        if (text[at] !== "\"") fail("expected a key");
        const key = string();
        if (keys.has(key.value)) fail(`duplicate key ${JSON.stringify(key.value)}`);
        keys.add(key.value);
        skip();
        if (text[at] !== ":") fail("expected ':'");
        at++;
        const node = value();
        members.push({ key: key.value, lead, keyText: text.slice(key.start, key.end), separator: text.slice(key.end, node.start), node });
        const after = at;
        skip();
        if (text[at] === ",") { at++; leadStart = at; continue; }
        if (text[at] === "}") { at++; return { kind: "object", start, end: at, members, closeLead: text.slice(after, at - 1) }; }
        fail("expected ',' or '}'");
      }
    }
    if (char === "[") {
      at++;
      const items = [];
      let leadStart = at;
      skip();
      if (text[at] === "]") { at++; return { kind: "array", start, end: at, items, closeLead: text.slice(leadStart, at - 1) }; }
      for (;;) {
        skip();
        const lead = text.slice(leadStart, at);
        const node = value();
        items.push({ lead, node });
        const after = at;
        skip();
        if (text[at] === ",") { at++; leadStart = at; continue; }
        if (text[at] === "]") { at++; return { kind: "array", start, end: at, items, closeLead: text.slice(after, at - 1) }; }
        fail("expected ',' or ']'");
      }
    }
    if (char === "\"") { const { end, value: decoded } = string(); return { kind: "scalar", start, end, value: decoded }; }
    const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at, at + 64));
    if (!literal) fail("unexpected character");
    at += literal[0].length;
    return { kind: "scalar", start, end: at, value: JSON.parse(literal[0]) };
  };
  if (text.charCodeAt(0) === 0xfeff) fail("byte order mark");
  const root = value();
  const tail = at;
  skip();
  if (at !== text.length) fail("text after the document");
  JSON.parse(text); // the spans parser is not the judge of validity: JSON.parse is
  return { text, root, head: text.slice(0, root.start), tail: text.slice(tail) };
}

/** The plain value of a node (order of keys as written). */
const plain = (node) => node.kind === "object" ? Object.fromEntries(node.members.map(member => [member.key, plain(member.node)]))
  : node.kind === "array" ? node.items.map(item => plain(item.node)) : node.value;

/** Equal as JSON values: keys in any order, array elements in order. */
export function sameValue(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((item, index) => sameValue(item, b[index]));
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}

/** One side's node at a place in the tree, with the text it lives in; undefined when that side has nothing there. */
const at = (node, text) => node && { node, text, value: plain(node) };
const same = (a, b) => a === b || (a !== undefined && b !== undefined && sameValue(a.value, b.value));
const isObject = (side) => side?.node.kind === "object";
const isArray = (side) => side?.node.kind === "array";

const patternMatches = (pattern, path) => {
  const parts = pattern === "" ? [] : pattern.split(".");
  return parts.length === path.length && parts.every((part, index) => part === "*" || part === path[index]);
};

/**
 * Merge three texts. Returns `{ text, value }` on a clean merge or `{ conflicts: [paths] }`; throws for input it
 * will not read. `identities` maps an array path pattern to "self" or a list of identity fields (rules.mjs, ARRAY_IDENTITIES).
 */
export function mergeJsonText(baseText, oursText, theirsText, { identities = {} } = {}) {
  const base = parseWithSpans(baseText), ours = parseWithSpans(oursText), theirs = parseWithSpans(theirsText);
  const conflicts = [];
  const identityAt = (path) => Object.entries(identities).find(([pattern]) => patternMatches(pattern, path))?.[1];

  // A result is either a side copied whole ({ copy }) or a container written again ({ kind, members, layout }).
  const merge = (b, o, t, path) => {
    if (o === undefined && t === undefined) return undefined;
    if (same(o, t)) return { copy: o };
    if (same(o, b)) return t && { copy: t };
    if (same(t, b)) return o && { copy: o };
    if (isObject(o) && isObject(t) && (b === undefined || isObject(b))) return mergeMembers(b, o, t, path, "object");
    const identity = identityAt(path);
    if (identity && isArray(o) && isArray(t) && (b === undefined || isArray(b))) return mergeMembers(b, o, t, path, "array", identity);
    conflicts.push(path.join(".") || "(the whole document)");
    return { copy: o ?? t };
  };

  // Objects by key, arrays by identity: the same three-way walk over named members.
  const mergeMembers = (b, o, t, path, kind, identity) => {
    const named = (side) => {
      const entries = new Map();
      if (!side) return entries;
      const children = kind === "object" ? side.node.members.map(member => [member.key, member])
        : side.node.items.map(item => [identityOf(plain(item.node), identity), item]);
      children.forEach(([name, member], index) => {
        if (entries.has(name)) throw refuse(`two elements of ${path.join(".") || "the document"} are both ${name}`);
        entries.set(name, { side: at(member.node, side.text), member, index });
      });
      return entries;
    };
    const [bs, os, ts] = [named(b), named(o), named(t)];
    const merged = new Map();
    for (const name of new Set([...os.keys(), ...ts.keys(), ...bs.keys()])) {
      const result = merge(bs.get(name)?.side, os.get(name)?.side, ts.get(name)?.side, [...path, kind === "object" ? name : "*"]);
      if (result) merged.set(name, { result, ...(os.get(name) ?? ts.get(name)) });
    }
    const order = [...os.keys()].filter(name => merged.has(name));
    const theirsOrder = [...ts.keys()];
    theirsOrder.forEach((name, index) => {
      if (!merged.has(name) || order.includes(name)) return;
      // After the nearest member it follows on its own side; past members only the current side added, while they sort before it.
      let position = 0;
      for (let before = index - 1; before >= 0; before--) {
        const found = order.indexOf(theirsOrder[before]);
        if (found >= 0) { position = found + 1; break; }
      }
      while (position < order.length && !bs.has(order[position]) && !ts.has(order[position]) && order[position] < name) position++;
      order.splice(position, 0, name);
    });
    const layout = [o, t, b].find(side => side && childrenOf(side.node).length)?.node ?? o.node;
    return { kind, members: order.map(name => ({ name, ...merged.get(name) })), layout };
  };

  const result = merge(at(base.root, baseText), at(ours.root, oursText), at(theirs.root, theirsText), []);
  if (conflicts.length) return { conflicts };
  if (!result) throw refuse("both sides emptied the document");
  const text = ours.head + write(result) + ours.tail;
  const value = valueOf(result);
  if (!sameValue(JSON.parse(text), value)) throw refuse("the written text does not read back as the merged value");
  return { text, value };
}

const childrenOf = (node) => node.kind === "object" ? node.members : node.items;

const identityOf = (value, identity) => {
  if (identity === "self") return JSON.stringify(canonical(value));
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw refuse("an element without identity fields");
  return JSON.stringify(identity.map(field => value[field] ?? null));
};
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

const valueOf = (result) => {
  if (result.copy) return result.copy.value;
  const values = result.members.map(member => [member.name, valueOf(member.result)]);
  return result.kind === "object" ? Object.fromEntries(values) : values.map(([, value]) => value);
};

/**
 * Write a result. A member keeps the whitespace it had before it on its own side (its line break and indentation, or the space
 * after a comma), its key as written and its key separator; only a member that moves to or from the first place takes the first or
 * the second member's whitespace of the container whose layout is kept (the current side's, when it has members).
 */
function write(result) {
  if (result.copy) return result.copy.text.slice(result.copy.node.start, result.copy.node.end);
  const [open, close] = result.kind === "object" ? ["{", "}"] : ["[", "]"];
  if (!result.members.length) return open + close;
  const kept = childrenOf(result.layout);
  const lead = (member, position) => {
    if (position === 0) return member.index === 0 || !kept.length ? member.member.lead : kept[0].lead;
    return member.index !== 0 ? member.member.lead : (kept[1] ?? kept[0] ?? member.member).lead;
  };
  const pieces = result.members.map((member, position) => lead(member, position)
    + (result.kind === "object" ? member.member.keyText + member.member.separator : "") + write(member.result));
  return open + pieces.join(",") + (result.layout.closeLead ?? "") + close;
}
