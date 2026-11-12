// src/store.ts
var ITEMS_KEY = "items";
var ITEM_PREFIX = "item:";
function isItemEntry(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value;
  return typeof record.id === "string" && record.id.length > 0 && typeof record.text === "string" && typeof record.created_at === "string" && record.created_at.length > 0;
}
async function readItems(sdk) {
  const stored = await sdk.storage.get(ITEMS_KEY);
  if (!Array.isArray(stored)) return [];
  const entries = [];
  for (const value of stored) {
    if (isItemEntry(value)) entries.push(value);
  }
  return entries;
}
async function loadItems(sdk) {
  try {
    return await readItems(sdk);
  } catch {
    throw Object.assign(new Error("\u65E0\u6CD5\u8BFB\u53D6\u5F53\u524D\u6E05\u5355\uFF0C\u65B0\u6761\u76EE\u672A\u5199\u5165\uFF0C\u8BF7\u91CD\u8BD5"), { code: "storage_write_failed" });
  }
}
function nextCreatedAt(previous) {
  const now = Date.now();
  const previousMs = previous ? Date.parse(previous) : Number.NaN;
  const ms = Number.isFinite(previousMs) && now <= previousMs ? previousMs + 1 : now;
  return new Date(ms).toISOString();
}
function newId(createdAt) {
  const stamp = createdAt.replace(/\D/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return "i" + stamp + "-" + suffix;
}
async function appendItem(sdk, text) {
  const entries = await loadItems(sdk);
  const last = entries.length > 0 ? entries[entries.length - 1] : null;
  const createdAt = nextCreatedAt(last ? last.created_at : null);
  const entry = { id: newId(createdAt), text, created_at: createdAt };
  const next = entries.concat([entry]);
  let recordWritten = false;
  try {
    await sdk.storage.set(ITEM_PREFIX + entry.id, entry);
    recordWritten = true;
    await sdk.storage.set(ITEMS_KEY, next);
  } catch {
    if (recordWritten) {
      try {
        await sdk.storage.delete(ITEM_PREFIX + entry.id);
      } catch {
      }
    }
    throw Object.assign(new Error("\u6E05\u5355\u5199\u5165\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5"), { code: "storage_write_failed" });
  }
  return entry;
}

// src/operations/0.ts
function readText(input) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const record = input;
  const value = record.text;
  return typeof value === "string" ? value : null;
}
async function operation(input, sdk) {
  const text = readText(input);
  if (text === null || text.length === 0) {
    throw Object.assign(new Error("\u6B63\u6587\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u65B0\u6761\u76EE\u672A\u5199\u5165\u6E05\u5355"), { code: "storage_write_failed" });
  }
  await appendItem(sdk, text);
  return { added: true };
}

// src/operations/1.ts
async function loadEntries(sdk) {
  try {
    return await readItems(sdk);
  } catch {
    throw Object.assign(new Error("\u6E05\u5355\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5"), { code: "storage_read_failed" });
  }
}
function isDateTime(value) {
  return value.length > 0 && Number.isFinite(Date.parse(value));
}
async function operation2(_input, sdk) {
  const entries = await loadEntries(sdk);
  const items = [];
  for (const entry of entries) {
    if (!isDateTime(entry.created_at)) continue;
    items.push({ id: entry.id, text: entry.text, created_at: entry.created_at });
  }
  return { items };
}

// src/index.ts
var operations = {
  "items.add": operation,
  "items.list": operation2
};
export {
  operations
};
