export type BoundaryPackageKind =
  | "app"
  | "foundation"
  | "module"
  | "horizontal"
  | "native-plugin"
  | "integration-plugin"
  | "tooling";

export interface BoundaryPackage {
  readonly name: string;
  readonly path: string;
  readonly kind: BoundaryPackageKind;
  readonly exportedSubpaths: readonly string[];
  readonly declaredDependencies: readonly string[];
}

export type BoundaryViolationCode =
  | "app-direct-database"
  | "contracts-implementation-dependency"
  | "contracts-root-import"
  | "cross-module-implementation"
  | "deep-import"
  | "horizontal-reverse-dependency"
  | "legacy-root-import"
  | "platform-reverse-dependency"
  | "plugin-implementation-import"
  | "production-test-kit-dependency"
  | "relative-cross-owner"
  | "undeclared-workspace-dependency";

export interface ImportObservation {
  readonly importer: BoundaryPackage;
  readonly target?: BoundaryPackage;
  readonly specifier: string;
  readonly sourceFile: string;
  readonly relativeCrossOwner?: boolean;
}

export interface BoundaryViolation {
  readonly code: BoundaryViolationCode;
  readonly sourceFile: string;
  readonly specifier: string;
  readonly message: string;
}

const CONTRACTS_PACKAGE_NAME = "@molis-ai/molis-work-contracts";

const DATABASE_IMPLEMENTATIONS = new Set([
  "better-sqlite3",
  "bun:sqlite",
  "node:sqlite",
  "sqlite",
  "sqlite3",
]);

// Network clients forbidden for Contracts. Ordinary node builtins such as
// node:fs stay legal; this is not a ban on every non-workspace import.
const NETWORK_CLIENTS = new Set([
  "http",
  "http2",
  "https",
  "node:http",
  "node:http2",
  "node:https",
  "undici",
  "ws",
]);

function importsListedPackage(specifier: string, packageNames: ReadonlySet<string>): boolean {
  return [...packageNames].some(
    (packageName) => specifier === packageName || specifier.startsWith(`${packageName}/`),
  );
}

function importsDatabaseImplementation(specifier: string): boolean {
  return importsListedPackage(specifier, DATABASE_IMPLEMENTATIONS);
}

function importsNetworkClient(specifier: string): boolean {
  return importsListedPackage(specifier, NETWORK_CLIENTS);
}

function isPlugin(kind: BoundaryPackageKind): boolean {
  return kind === "native-plugin" || kind === "integration-plugin";
}

function isAppModuleOrPlugin(target: BoundaryPackage): boolean {
  return target.kind === "app" || target.kind === "module" || isPlugin(target.kind);
}

function exportedSubpath(specifier: string, target: BoundaryPackage): string | null {
  if (specifier === target.name) return ".";
  if (!specifier.startsWith(`${target.name}/`)) return null;
  return `./${specifier.slice(target.name.length + 1)}`;
}

function violation(
  code: BoundaryViolationCode,
  observation: ImportObservation,
  message: string,
): BoundaryViolation {
  return {
    code,
    sourceFile: observation.sourceFile,
    specifier: observation.specifier,
    message,
  };
}

/**
 * Evaluate one import without touching the filesystem. Repository scanners and
 * package authors can reuse the same policy instead of copying architecture rules.
 */
export function evaluateImportBoundary(observation: ImportObservation): readonly BoundaryViolation[] {
  const { importer, target, specifier } = observation;
  const violations: BoundaryViolation[] = [];

  if (importer.kind === "app" && importsDatabaseImplementation(specifier)) {
    violations.push(
      violation(
        "app-direct-database",
        observation,
        `${importer.name} is an App composition boundary and must not import database implementation ${specifier}`,
      ),
    );
  }

  if (specifier === "@molis-ai/molis-work" || specifier.startsWith("@molis-ai/molis-work/")) {
    violations.push(
      violation(
        "legacy-root-import",
        observation,
        "New workspace packages must not import the legacy root implementation; add or consume an explicit public Contract",
      ),
    );
  }

  if (specifier === CONTRACTS_PACKAGE_NAME) {
    violations.push(
      violation(
        "contracts-root-import",
        observation,
        "Use an explicit @molis-ai/molis-work-contracts subpath so the consumed Contract owner is visible",
      ),
    );
  }

  if (observation.relativeCrossOwner) {
    violations.push(
      violation(
        "relative-cross-owner",
        observation,
        "A relative import crossed a package owner boundary; use the target package public entrypoint",
      ),
    );
  }

  // Database drivers and network clients are not workspace packages. Contracts
  // forbids them by name; the workspace-target return below must not skip that.
  if (
    importer.name === CONTRACTS_PACKAGE_NAME
    && (importsDatabaseImplementation(specifier) || importsNetworkClient(specifier))
  ) {
    violations.push(
      violation(
        "contracts-implementation-dependency",
        observation,
        `The Contracts package must not depend on database or network client ${specifier}`,
      ),
    );
  }

  if (!target || target.name === importer.name) return violations;

  const subpath = exportedSubpath(specifier, target);
  if (subpath && !target.exportedSubpaths.includes(subpath)) {
    violations.push(
      violation(
        "deep-import",
        observation,
        `${specifier} is not a public export of ${target.name}`,
      ),
    );
  }

  if (!importer.declaredDependencies.includes(target.name)) {
    violations.push(
      violation(
        "undeclared-workspace-dependency",
        observation,
        `${importer.name} imports ${target.name} without declaring it as a dependency`,
      ),
    );
  }

  if (importer.kind === "module" && target.kind === "module") {
    violations.push(
      violation(
        "cross-module-implementation",
        observation,
        `${importer.name} must consume ${target.name}'s Contract, not its implementation package`,
      ),
    );
  }

  if (isPlugin(importer.kind) && isPlugin(target.kind)) {
    violations.push(
      violation(
        "plugin-implementation-import",
        observation,
        `${importer.name} must exchange Goals or Artifacts through public Contracts, not import ${target.name}`,
      ),
    );
  }

  if (target.name === "@molis-ai/molis-work-test-kit" && importer.name !== target.name) {
    violations.push(
      violation(
        "production-test-kit-dependency",
        observation,
        "Production packages must not depend on the internal test-kit runtime",
      ),
    );
  }

  if (
    importer.name === CONTRACTS_PACKAGE_NAME
    && !importsDatabaseImplementation(specifier)
    && !importsNetworkClient(specifier)
  ) {
    violations.push(
      violation(
        "contracts-implementation-dependency",
        observation,
        "The Contracts package must not depend on an implementation package",
      ),
    );
  }

  if (importer.kind === "horizontal" && isAppModuleOrPlugin(target)) {
    violations.push(
      violation(
        "horizontal-reverse-dependency",
        observation,
        `${importer.name} must not import ${target.name}; a Horizontal Service consumes public Contracts and colocated adapter ports, not an App, Module implementation, or Plugin implementation`,
      ),
    );
  }

  if (
    importer.kind === "foundation"
    && importer.name !== CONTRACTS_PACKAGE_NAME
    && (isAppModuleOrPlugin(target) || target.kind === "horizontal")
  ) {
    violations.push(
      violation(
        "platform-reverse-dependency",
        observation,
        `${importer.name} must not import ${target.name}; a platform package does not depend upward on an App, Module, Horizontal Service, or Plugin implementation`,
      ),
    );
  }

  return violations;
}

interface CodeFrame { t: "code"; brace: number; close: "eof" | "interp" }
interface LineFrame { t: "line" }
interface BlockFrame { t: "block" }
interface SingleQuoteFrame { t: "sq"; chunkStart: number }
interface DoubleQuoteFrame { t: "dq"; chunkStart: number }
interface TemplateFrame { t: "tpl"; chunkStart: number }
type ScanFrame = CodeFrame | LineFrame | BlockFrame | SingleQuoteFrame | DoubleQuoteFrame | TemplateFrame;

/**
 * Blank comments and record string/template ranges without swallowing `${...}`
 * code. Offsets stay UTF-16 so they match RegExp match.index.
 */
function scanImportSource(source: string): {
  searchable: string;
  literalRanges: readonly (readonly [number, number])[];
} {
  const characters = source.split("");
  const ranges: Array<readonly [number, number]> = [];
  const stack: ScanFrame[] = [{ t: "code", brace: 0, close: "eof" }];
  const pushRange = (start: number, end: number): void => {
    if (start >= 0 && start <= end) ranges.push([start, end]);
  };

  for (let index = 0; index < characters.length; index += 1) {
    const context = stack[stack.length - 1];
    if (!context) break;
    const character = characters[index] ?? "";
    const next = characters[index + 1];

    if (context.t === "line") {
      if (character === "\n") stack.pop();
      else characters[index] = " ";
      continue;
    }
    if (context.t === "block") {
      if (character === "*" && next === "/") {
        characters[index] = " ";
        characters[index + 1] = " ";
        index += 1;
        stack.pop();
      } else if (character !== "\n") characters[index] = " ";
      continue;
    }
    if (context.t === "sq" || context.t === "dq") {
      const quote = context.t === "sq" ? "'" : '"';
      if (character === "\\") index += 1;
      else if (character === quote) {
        pushRange(context.chunkStart, index);
        stack.pop();
      }
      continue;
    }
    if (context.t === "tpl") {
      if (character === "\\") {
        index += 1;
        continue;
      }
      if (character === "`") {
        pushRange(context.chunkStart, index);
        stack.pop();
        continue;
      }
      if (character === "$" && next === "{") {
        pushRange(context.chunkStart, index + 1);
        context.chunkStart = -1;
        index += 1;
        stack.push({ t: "code", brace: 0, close: "interp" });
      }
      continue;
    }

    if (character === "/" && next === "/") {
      characters[index] = " ";
      characters[index + 1] = " ";
      index += 1;
      stack.push({ t: "line" });
      continue;
    }
    if (character === "/" && next === "*") {
      characters[index] = " ";
      characters[index + 1] = " ";
      index += 1;
      stack.push({ t: "block" });
      continue;
    }
    if (character === "'") {
      stack.push({ t: "sq", chunkStart: index });
      continue;
    }
    if (character === '"') {
      stack.push({ t: "dq", chunkStart: index });
      continue;
    }
    if (character === "`") {
      stack.push({ t: "tpl", chunkStart: index });
      continue;
    }
    if (context.t !== "code") continue;
    if (character === "{") {
      context.brace += 1;
      continue;
    }
    if (character === "}") {
      if (context.brace > 0) context.brace -= 1;
      else if (context.close === "interp") {
        stack.pop();
        const parent = stack[stack.length - 1];
        if (parent && parent.t === "tpl") parent.chunkStart = index;
      }
    }
  }

  for (const frame of stack) {
    if ((frame.t === "sq" || frame.t === "dq" || frame.t === "tpl") && frame.chunkStart >= 0) {
      pushRange(frame.chunkStart, characters.length);
    }
  }
  return { searchable: characters.join(""), literalRanges: ranges };
}

function continuesImportArgument(source: string, index: number): boolean {
  let cursor = index;
  while (cursor < source.length && /\s/u.test(source[cursor] ?? "")) cursor += 1;
  const next = source[cursor];
  return next === "," || next === ")";
}

/** Extract static, dynamic, re-export, and CommonJS module specifiers. */
export function extractImportSpecifiers(source: string): readonly string[] {
  const { searchable, literalRanges: ignoredKeywordRanges } = scanImportSource(source);
  const found: Array<{ index: number; specifier: string }> = [];
  const patterns = [
    { expression: /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`;=]*?\s+from\s+)?["']([^"']+)["']/gu, dynamicArgument: false },
    { expression: /\bimport\s*\(\s*(?:["']([^"']+)["']|`([^`$]*)`)/gu, dynamicArgument: true },
    { expression: /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu, dynamicArgument: false },
  ];

  for (const pattern of patterns) {
    for (const match of searchable.matchAll(pattern.expression)) {
      const matchIndex = match.index ?? -1;
      if (ignoredKeywordRanges.some(([start, end]) => matchIndex >= start && matchIndex <= end)) continue;
      if (pattern.dynamicArgument && !continuesImportArgument(searchable, matchIndex + match[0].length)) continue;
      const specifier = match[1] ?? match[2];
      if (specifier) found.push({ index: matchIndex, specifier });
    }
  }

  found.sort((left, right) => left.index - right.index);
  const specifiers = new Set<string>();
  for (const item of found) specifiers.add(item.specifier);
  return [...specifiers];
}

/** Return stable cycle paths. Each path repeats its first node at the end. */
export function findDependencyCycles(
  graph: ReadonlyMap<string, readonly string[]>,
): readonly (readonly string[])[] {
  const cycles = new Map<string, readonly string[]>();
  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];

  const visit = (node: string): void => {
    if (active.has(node)) {
      const start = stack.indexOf(node);
      const cycle = [...stack.slice(start), node];
      const body = cycle.slice(0, -1);
      const rotations = body.map((_, index) => [...body.slice(index), ...body.slice(0, index)]);
      rotations.sort((left, right) => left.join("\0").localeCompare(right.join("\0")));
      const normalized = [...(rotations[0] ?? body), rotations[0]?.[0] ?? node];
      cycles.set(normalized.join(" -> "), normalized);
      return;
    }
    if (visited.has(node)) return;

    active.add(node);
    stack.push(node);
    for (const dependency of graph.get(node) ?? []) {
      if (graph.has(dependency)) visit(dependency);
    }
    stack.pop();
    active.delete(node);
    visited.add(node);
  };

  for (const node of [...graph.keys()].sort()) visit(node);
  return [...cycles.values()].sort((left, right) => left.join("\0").localeCompare(right.join("\0")));
}
