// Gate: the two halves of packages/kernel (specs/repository-anti-corruption N-04, W3-04; decision N-03).
//
// packages/kernel holds a core (the capability directory, dispatch, availability, grants and scene compatibility: index.ts,
// action-service.ts, action-schema.ts, subject-offer-choices.ts, action-authorship.ts) and one platform product service
// (docs/system/ARCHITECTURE.md §3), contextual ranking (contextual.ts, or a contextual/ directory): pure functions that derive
// candidates from one authorized directory snapshot, score them by rule, build the material and the questions of a judgment,
// read its answer and plan the layout. N-03 left the code where it is; this gate keeps the boundary between the halves true.
// A rule with no baseline: it starts at zero and any hit fails.
//
//   K1  The core does not depend on contextual ranking. No core file imports it, re-exports it or loads it dynamically, and no
//       core file takes a contextual name from another core file that re-exports it (`import { planContextualLayout } from
//       "./index.js"`). So the package entry does not re-export it: contextual ranking is reached through its own subpath,
//       `@molis-ai/molis-work-kernel/contextual` (package.json exports), and loading the core loads none of it. The only
//       allowance left is `ENTRY_REEXPORTS`, which is empty; a re-export by name (`export { a, b } from "./contextual.js"`) is
//       the one form it could admit, `export *` never (it lists no names).
//   K2  Only contextual ranking reads packages/contracts services/* and only services/contextual.
//   K3  Contextual ranking reads two Contracts and node:crypto (CONTEXTUAL_PACKAGES) and files of the kernel; not the package
//       entry (that would close a cycle with the re-export), not a file outside packages/kernel/src, nothing else (no
//       storage, no agent host, no other Node built-in: I/O stays in the Host).
//   K4  Contextual ranking is pure: no timers, clocks, randomness, process or global access and no module-level mutable state,
//       counted by the same definition as the contracts purity gate (contracts-purity.mjs purityOf). Caches, timers, cancel
//       and model calls live in apps/local-host/src/contextual/.
//   K5  The files that derive from the directory (contextual ranking and subject-offer-choices.ts) name no capability: no
//       lower-case dotted string such as "pages.discard", none starting with io.molis.work., no plugin package name. The only
//       places allowed are the kernel's own error codes: the first argument of `new ActionError(…)` and the value of `code:`.
//       Module specifiers and string types do not count. This is a PARTIAL guard of the basic contract C1 ("register once"):
//       candidates come from the directory, not from a list of plugins.
//
// Files are told apart by directory, not by name: splitting contextual.ts into contextual/*.ts needs no change here, and a new
// core file that contextual ranking wants to share is imported freely (K3 allows any kernel file but the entry).
//
// What it does not see (no type checker, no cross-file data flow; review does): a capability id that is built
// ("pages" + ".discard"), compared by a prefix without a dot (`startsWith("pages")`) or imported from a Contracts constant;
// an import made through a path alias or a computed specifier (reported for contextual ranking, silent in the core); a contextual
// name reached through a chain of re-exports that K1 does not name (every link of such a chain is itself a K1 hit); a
// dependency on the Host or a plugin that does not go through an import (a global, a string looked up at run time).
import path from "node:path";
import ts from "typescript";
import { purityOf } from "./contracts-purity.mjs";

const KERNEL_SOURCE = /^packages\/kernel\/src\/.+\.ts$/;
const KERNEL_ROOT = "packages/kernel/src/";
/** Contextual ranking: a platform product service kept in the kernel (docs/system/ARCHITECTURE.md §3; N-03: the file stays). A file, or a directory it may be split into. */
export const CONTEXTUAL_SERVICE = /^packages\/kernel\/src\/contextual(?:\.ts|\/.+\.ts)$/;
/** The packages contextual ranking may read: two Contracts and node:crypto (the digest). Relative imports are judged by K3's own rule. */
export const CONTEXTUAL_PACKAGES = new Set([
  "@molis-ai/molis-work-contracts/platform/actions",
  "@molis-ai/molis-work-contracts/services/contextual",
  "node:crypto",
]);
/**
 * The core files allowed to re-export contextual names by name. Empty: contextual ranking has its own subpath
 * (`@molis-ai/molis-work-kernel/contextual`), so the package entry no longer re-exports it (W3-04, PR 2). It was the package entry until then.
 */
export const ENTRY_REEXPORTS = new Set();
/** K5 reads these: contextual ranking and the core file that derives scene choices from the directory. */
export const DIRECTORY_DERIVED = /^packages\/kernel\/src\/(?:contextual(?:\.ts|\/.+\.ts)|subject-offer-choices\.ts)$/;

const CONTRACT_SERVICES = "@molis-ai/molis-work-contracts/services/";
const CONTEXTUAL_CONTRACT = "@molis-ai/molis-work-contracts/services/contextual";
const CAPABILITY_ID = /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+$/;
const OWNER_PREFIXES = ["io.molis.work.", "@molis-ai/molis-work-plugin-"];

const lineOf = (source, node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
const isModuleLiteral = (node) => node && ts.isStringLiteralLike(node);

/** The kernel files and their parsed sources: Map<file, { source, references }>. */
function readKernel(snapshot) {
  const kernel = new Map();
  for (const file of snapshot.files.filter((name) => KERNEL_SOURCE.test(name) && !name.endsWith(".d.ts"))) {
    const text = snapshot.read(file);
    if (text === null) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    kernel.set(file, { source, text, references: moduleReferences(source) });
  }
  return kernel;
}

/**
 * Every place a file names another module: `import`, `export … from`, `import x = require()`, `import("x")`, `require("x")` and
 * `import("x").T`. `specifier` is null when the argument of a dynamic import or a require is not a literal.
 */
function moduleReferences(source) {
  const found = [];
  const add = (node, specifier, kind) => found.push({ node, specifier, kind, line: lineOf(source, node) });
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && isModuleLiteral(node.moduleSpecifier)) {
      add(node, node.moduleSpecifier.text, ts.isImportDeclaration(node) ? "import" : "export");
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node, isModuleLiteral(node.moduleReference.expression) ? node.moduleReference.expression.text : null, "import");
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      add(node, isModuleLiteral(node.arguments[0]) ? node.arguments[0].text : null, "dynamic");
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && isModuleLiteral(node.argument.literal)) {
      add(node, node.argument.literal.text, "import-type");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** A relative specifier as the kernel files it can name (`./x.js` is `x.ts` or `x/index.ts`); `inside` is false when it leaves packages/kernel/src. */
function resolveRelative(from, specifier) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier)).replace(/\.(?:[cm]?js|ts)$/, "");
  return { candidates: [`${base}.ts`, `${base}/index.ts`], inside: `${base}/`.startsWith(KERNEL_ROOT) };
}
const isRelative = (specifier) => specifier.startsWith("./") || specifier.startsWith("../");
const targetsOf = (kernel, from, specifier) => resolveRelative(from, specifier).candidates.filter((candidate) => kernel.has(candidate));
const reachesContextual = (from, specifier) => isRelative(specifier) && resolveRelative(from, specifier).candidates.some((candidate) => CONTEXTUAL_SERVICE.test(candidate));

/** The names a core file re-exports from contextual ranking: Map<file, Set<name>>. `export *` has no names and is a K1 hit of its own. */
function contextualNames(kernel, core) {
  const names = new Map();
  for (const file of core) {
    for (const { node, specifier } of kernel.get(file).references) {
      if (!ts.isExportDeclaration(node) || specifier === null || !reachesContextual(file, specifier)) continue;
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        names.set(file, new Set([...(names.get(file) ?? []), ...node.exportClause.elements.map((element) => element.name.text)]));
      }
    }
  }
  return names;
}

/**
 * What a reference takes from a module whose contextual names are `names`: null when it takes none of them, "all" for the whole
 * module (a namespace, `export *`, a dynamic import), otherwise the taken names.
 */
function namesTaken(node, names) {
  if (ts.isImportDeclaration(node)) {
    const bindings = node.importClause?.namedBindings;
    if (!bindings) return null;
    if (ts.isNamespaceImport(bindings)) return "all";
    return pick(bindings.elements, names);
  }
  if (ts.isExportDeclaration(node)) {
    if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) return "all";
    return pick(node.exportClause.elements, names);
  }
  return "all";
}
const pick = (elements, names) => {
  const taken = elements.map((element) => (element.propertyName ?? element.name).text).filter((name) => names.has(name));
  return taken.length ? taken : null;
};

/** K1: no core file depends on contextual ranking, by a direct reference or by taking its names from a core file that re-exports them. */
function coreDependsOnContextual(kernel, { entryReexports }) {
  const problems = [];
  const core = [...kernel.keys()].filter((file) => !CONTEXTUAL_SERVICE.test(file));
  const reexported = contextualNames(kernel, core);
  for (const file of core) {
    for (const { node, specifier, kind, line } of kernel.get(file).references) {
      if (specifier === null || !isRelative(specifier)) continue;
      if (reachesContextual(file, specifier)) {
        const namedExport = kind === "export" && node.exportClause && ts.isNamedExports(node.exportClause);
        if (namedExport && entryReexports.has(file)) continue;
        const why = kind !== "export" ? `loads contextual ranking (${kind})`
          : !namedExport ? "re-exports contextual ranking with `export *` (that lists no names, so K1 cannot see which ones)"
            : `re-exports contextual ranking${entryReexports.size ? ", and only a file listed in entryReexports may" : "; it has its own subpath (@molis-ai/molis-work-kernel/contextual) and no core file re-exports it"}`;
        problems.push(`${file}:${line} K1: the kernel core ${why}: "${specifier}"; the dependency runs from contextual ranking to the core, never back (packages/kernel/README.md, docs/system/PACKAGE-BOUNDARIES.md §2)`);
        continue;
      }
      for (const target of targetsOf(kernel, file, specifier)) {
        const taken = reexported.has(target) ? namesTaken(node, reexported.get(target)) : null;
        if (taken) {
          problems.push(`${file}:${line} K1: the kernel core takes ${taken === "all" ? "the whole of" : taken.map((name) => `"${name}"`).join(", ")} ${taken === "all" ? "" : "from "}${target.replace(KERNEL_ROOT, "")}, which re-exports contextual ranking; `
            + `import what the core needs from the file that defines it, never contextual ranking through the entry`);
        }
      }
    }
  }
  return problems;
}

/** K2: only contextual ranking reads Contracts services/*, and only services/contextual. */
function servicesContracts(kernel) {
  const problems = [];
  for (const [file, { references }] of kernel) {
    for (const { specifier, line } of references) {
      if (specifier === null || !specifier.startsWith(CONTRACT_SERVICES)) continue;
      if (CONTEXTUAL_SERVICE.test(file) && specifier === CONTEXTUAL_CONTRACT) continue;
      problems.push(`${file}:${line} K2: the kernel reads "${specifier}"; only contextual ranking reads a Contracts service, and only ${CONTEXTUAL_CONTRACT} `
        + `(docs/system/PACKAGE-BOUNDARIES.md §1, §2: the kernel core stays on contracts/platform/*)`);
    }
  }
  return problems;
}

/** K3: contextual ranking reads only the listed packages and files inside the kernel (not the entry). */
function contextualReads(kernel) {
  const problems = [];
  for (const [file, { references }] of kernel) {
    if (!CONTEXTUAL_SERVICE.test(file)) continue;
    for (const { specifier, kind, line } of references) {
      if (specifier === null) { problems.push(`${file}:${line} K3: contextual ranking makes a ${kind} import K3 cannot read (the argument is not a string literal); name the module literally`); continue; }
      if (!isRelative(specifier)) {
        if (!CONTEXTUAL_PACKAGES.has(specifier)) problems.push(`${file}:${line} K3: contextual ranking reads "${specifier}"; it may read only ${[...CONTEXTUAL_PACKAGES].join(", ")} and files of the kernel (it is pure: I/O stays in apps/local-host/src/contextual/)`);
        continue;
      }
      const { candidates, inside } = resolveRelative(file, specifier);
      if (!inside) problems.push(`${file}:${line} K3: contextual ranking reads "${specifier}", which is outside packages/kernel/src`);
      else if (candidates.includes(`${KERNEL_ROOT}index.ts`)) problems.push(`${file}:${line} K3: contextual ranking imports the package entry ("${specifier}"), which re-exports it; import the core file that defines the name`);
    }
  }
  return problems;
}

/** K4: contextual ranking has no effects and no module-level mutable state. */
function contextualPurity(kernel) {
  const problems = [];
  for (const [file, { text }] of kernel) {
    if (!CONTEXTUAL_SERVICE.test(file)) continue;
    const { counts } = purityOf(file, text);
    for (const what of ["effects", "mutable-state"]) {
      if (counts[what]) problems.push(`${file} K4: contextual ranking is pure but has ${counts[what]} ${what === "effects" ? "effect(s) (timer, clock, randomness, process, global access)" : "module-level mutable state"}; keep that in the Host (apps/local-host/src/contextual/)`);
    }
  }
  return problems;
}

/** A string that stands where a module path or a type is, or that is one of the kernel's own error codes: not a capability named in code. */
function isAllowedLiteral(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent) || ts.isLiteralTypeNode(parent) || ts.isImportTypeNode(parent)) return true;
  if (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
  if (ts.isCallExpression(parent) && ts.isIdentifier(parent.expression) && parent.expression.text === "require") return true;
  if (ts.isNewExpression(parent) && ts.isIdentifier(parent.expression) && parent.expression.text === "ActionError" && parent.arguments?.[0] === node) return true;
  return ts.isPropertyAssignment(parent) && parent.initializer === node && (ts.isIdentifier(parent.name) || ts.isStringLiteralLike(parent.name)) && parent.name.text === "code";
}

/** K5: no capability id, owner id or plugin package name written as a string in the files that derive from the directory. */
function namesNoCapability(kernel) {
  const problems = [];
  for (const [file, { source }] of kernel) {
    if (!DIRECTORY_DERIVED.test(file)) continue;
    const visit = (node) => {
      const isHead = ts.isTemplateHead(node);
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || isHead) {
        // A template that starts "pages.discard." still names one: the dot that joins the next piece is not part of the id.
        const text = isHead ? node.text.replace(/\.$/, "") : node.text;
        if (!isAllowedLiteral(node) && (CAPABILITY_ID.test(text) || OWNER_PREFIXES.some((prefix) => node.text.startsWith(prefix)))) {
          problems.push(`${file}:${lineOf(source, node)} K5: "${node.text}" looks like a capability id, an owner id or a plugin package; the directory is the only source of candidates, `
            + `so code that derives from it names no capability (the kernel's own error codes, in \`new ActionError(…)\` or \`code:\`, are the exception)`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return problems;
}

/**
 * Problems in the working tree; every one is a failure and there is no baseline. `snapshot` is { files, read } like the other
 * rules; `options.entryReexports` is for the gate's own test (the files that may re-export contextual names by name; none by default).
 */
export function kernelContextualProblems(snapshot, { entryReexports = ENTRY_REEXPORTS } = {}) {
  const kernel = readKernel(snapshot);
  if (!kernel.size) return [];
  return [
    ...coreDependsOnContextual(kernel, { entryReexports }),
    ...servicesContracts(kernel),
    ...contextualReads(kernel),
    ...contextualPurity(kernel),
    ...namesNoCapability(kernel),
  ];
}
