export const GIANT_REGISTRY = "tooling/gates/giant-exceptions/";
export function giantExceptions(snapshot) {
  const exceptions = {}, owners = new Map();
  for (const file of snapshot.files.filter(file => file.startsWith(GIANT_REGISTRY) && file.endsWith(".json")).sort()) {
    let parsed;
    try { parsed = JSON.parse(snapshot.read(file)); } catch { throw new Error(`${file} is not valid JSON`); }
    if (!parsed?.exceptions || typeof parsed.exceptions !== "object" || Array.isArray(parsed.exceptions)) throw new Error(`${file} needs an "exceptions" object keyed by giant unit`);
    for (const [unit, entry] of Object.entries(parsed.exceptions)) {
      if (owners.has(unit)) throw new Error(`${file}: duplicate giant unit ${unit}, also in ${owners.get(unit)}`);
      Object.defineProperty(exceptions, unit, { value: entry, enumerable: true }); owners.set(unit, file);
    }
  }
  return exceptions;
}
