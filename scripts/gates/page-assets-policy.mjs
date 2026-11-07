// CCR-02/03/04: allowances belong to a change, never to an absolute historical size.
export const ALLOWANCES = "tooling/gates/page-asset-allowances/";
export function sizeMap(value, where) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length) throw new Error(`${where}: expected nonempty asset sizes`);
  for (const [asset, size] of Object.entries(value)) {
    if (!/^\/assets\/[^\s?#]+$/.test(asset) || !Number.isSafeInteger(size) || size <= 0) throw new Error(`${where}: invalid asset or byte count: ${asset}`);
  }
  return value;
}
export function assetProblems(measured, base, current, previous) {
  sizeMap(measured, "measurement"); sizeMap(base, "base measurement");
  const errors = [], allowed = {}, approvals = {};
  for (const [file, text] of Object.entries(previous)) {
    if (current[file] !== text) errors.push(`${file}: an adopted allowance cannot be changed or removed`);
  }
  for (const [file, text] of Object.entries(current)) {
    if (Object.hasOwn(previous, file)) continue;
    let record;
    try {
      record = JSON.parse(text);
      if (!record || typeof record !== "object" || Array.isArray(record) || Object.keys(record).some(key => !["reason", "review", "userApproval", "assets"].includes(key))) throw new Error("unknown fields");
      for (const field of ["reason", "review"]) if (typeof record[field] !== "string" || !record[field].trim()) throw new Error(`missing ${field}`);
      if (record.userApproval !== undefined && (typeof record.userApproval !== "string" || !record.userApproval.trim())) throw new Error("empty userApproval");
      sizeMap(record.assets, file);
    } catch (error) { errors.push(`${file}: invalid allowance: ${error.message}`); continue; }
    for (const [asset, delta] of Object.entries(record.assets)) {
      if (!(asset in base) || delta > 10_000) {
        if (!record.userApproval) errors.push(`${file}: ${asset} is new or over 10 KB; userApproval is required`);
      }
      allowed[asset] = (allowed[asset] ?? 0) + delta;
      approvals[asset] = (approvals[asset] ?? true) && Boolean(record.userApproval);
    }
  }
  for (const [asset, bytes] of Object.entries(measured)) {
    const delta = bytes - (base[asset] ?? 0);
    if (delta <= 0) continue;
    if (delta > (allowed[asset] ?? 0)) errors.push(`${asset} grew ${base[asset] ?? 0} → ${bytes} (+${delta}); new allowances cover ${allowed[asset] ?? 0} bytes`);
    if ((!(asset in base) || delta > 10_000) && !approvals[asset]) errors.push(`${asset}: new asset or growth over 10 KB requires userApproval for its allowances`);
  }
  return errors;
}
