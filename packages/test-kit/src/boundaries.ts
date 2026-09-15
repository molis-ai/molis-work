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
  | "legacy-root-import"
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

const DATABASE_IMPLEMENTATIONS = new Set([
  "better-sqlite3",
  "bun:sqlite",
  "node:sqlite",
  "sqlite",
  "sqlite3",
]);

function importsDatabaseImplementation(specifier: string): boolean {
  return [...DATABASE_IMPLEMENTATIONS].some(
    (packageName) => specifier === packageName || specifier.startsWith(`${packageName}/`),
  );
}

function isPlugin(kind: BoundaryPackageKind): boolean {
  return kind === "native-plugin" || kind === "integration-plugin";
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

  if (specifier === "@molis-ai/molis-work-contracts") {
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

  if (importer.name === "@molis-ai/molis-work-contracts") {
    violations.push(
      violation(
        "contracts-implementation-dependency",
        observation,
        "The Contracts package must not depend on an implementation package",
      ),
    );
  }

  return violations;
}

function maskComments(source: string): string {
  // split("") preserves UTF-16 offsets, which are also used by RegExp match.index.
  const characters = source.split("");
  let quote: "'" | '"' | "`" | null = null;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const next = characters[index + 1];

    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "/" && next === "/") {
      characters[index] = " ";
      characters[index + 1] = " ";
      index += 2;
      while (index < characters.length && characters[index] !== "\n") {
        characters[index] = " ";
        index += 1;
      }
      continue;
    }
    if (character === "/" && next === "*") {
      characters[index] = " ";
      characters[index + 1] = " ";
      index += 2;
      while (index < characters.length) {
        if (characters[index] === "*" && characters[index + 1] === "/") {
          characters[index] = " ";
          characters[index + 1] = " ";
          index += 1;
          break;
        }
        if (characters[index] !== "\n") characters[index] = " ";
        index += 1;
      }
    }
  }
  return characters.join("");
}

function literalRanges(source: string): readonly (readonly [number, number])[] {
  const ranges: Array<readonly [number, number]> = [];
  for (let index = 0; index < source.length; index += 1) {
    const quote = source[index];
    if (quote !== "'" && quote !== '"' && quote !== "`") continue;
    const start = index;
    index += 1;
    while (index < source.length) {
      if (source[index] === "\\") index += 2;
      else if (source[index] === quote) break;
      else index += 1;
    }
    ranges.push([start, index]);
  }
  return ranges;
}

/** Extract static, dynamic, re-export, and CommonJS module specifiers. */
export function extractImportSpecifiers(source: string): readonly string[] {
  const searchableSource = maskComments(source);
  const ignoredKeywordRanges = literalRanges(searchableSource);
  const specifiers = new Set<string>();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`;=]*?\s+from\s+)?["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu,
  ];

  for (const pattern of patterns) {
    for (const match of searchableSource.matchAll(pattern)) {
      const matchIndex = match.index ?? -1;
      if (ignoredKeywordRanges.some(([start, end]) => matchIndex >= start && matchIndex <= end)) continue;
      const specifier = match[1];
      if (specifier) specifiers.add(specifier);
    }
  }
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
