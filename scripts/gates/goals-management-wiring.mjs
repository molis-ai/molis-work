import ts from "typescript";

const HOST_NAMES = new Set(["LocalHostProjectClient", "actionClient", "client", "withProject", "withScope", "coordinator", "goalQueries"]);
/** Verify the resident path and its lazy local fallback without granting a second business port. */
export function checkGoalsManagementWiring(source, mode) {
  const mcp = mode === "mcp", path = `apps/local-host/src/${mcp ? "mcp-v1-tool" : "cli-project"}.ts`;
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const calls = [], accesses = [], names = [], declarations = new Map(), imports = new Set();
  const text = node => node?.getText(file).replace(/\s+/gu, "");
  const production = mcp ? productionMcpBranch(file, text) : undefined;
  const visit = node => {
    if (node === production?.node) return;
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier) && !node.importClause?.isTypeOnly
      && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const element of node.importClause.namedBindings.elements) if (!element.propertyName && !element.isTypeOnly) imports.add(`${node.moduleSpecifier.text}:${element.name.text}`);
    }
    if (ts.isCallExpression(node)) calls.push(node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node);
    if ((ts.isPropertyAccessExpression(node) && HOST_NAMES.has(node.name.text))
      || (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && HOST_NAMES.has(node.argumentExpression.text))) accesses.push(node);
    if (ts.isIdentifier(node) && HOST_NAMES.has(node.text)) names.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  const errors = [], reject = message => errors.push(`${path}: ${message}`);
  if (production?.error) reject(production.error);
  const namedCalls = name => calls.filter(node => ts.isIdentifier(node.expression) && node.expression.text === name);
  const factory = namedCalls("bindGoalsManagementActions"), call = factory.length === 1 ? factory[0] : undefined;
  const opened = call?.arguments[0], fallback = declarations.get("fallback");
  const body = fallback?.initializer && ts.isArrowFunction(fallback.initializer) ? fallback.initializer.body : undefined;
  const creates = namedCalls("prepareLocalProjectStorage").filter(node => text(node.arguments[1]) === '"create"');
  const external = creates.find(node => node.pos < fallback?.pos);
  const guarded = !mcp && body && ts.isBlock(body) && body.statements.length === 3
    && imports.has("./home-storage-lifetime.js:ensureHomeStorageOwner")
    && imports.has("./project-storage.js:prepareLocalProjectStorage")
    && text(declarations.get("homeDatabase")?.initializer) === "databaseInHome(home,databasePath)"
    && creates.length === 2 && text(external?.parent.parent) === 'if(operation==="init"&&!homeDatabase)prepareLocalProjectStorage(databasePath,"create");'
    && text(body.statements[0]) === 'if(homeProject||homeDatabase)ensureHomeStorageOwner(localHost??=createMolisWorkLocalHost({homeDirectory:home}),home);'
    && text(body.statements[1]) === 'if(operation==="init"&&homeDatabase)prepareLocalProjectStorage(databasePath,"create");'
    && ts.isReturnStatement(body.statements[2]) && body.statements[2].expression === call;
  const expectedClient = mcp ? "caller.localHost.actionClient" : "(localHost??=createMolisWorkLocalHost({homeDirectory:home})).actionClient";
  if (!imports.has("./goal-callers.js:bindGoalsManagementActions") || !call || call.arguments.length !== 3
    || !opened || !ts.isCallExpression(opened) || text(opened.expression) !== expectedClient || opened.arguments.length !== 1
    || text(opened.arguments[0]) !== "reference"
    || text(call.arguments[1]) !== "reference" || text(call.arguments[2]) !== (mcp ? "{signal:caller.resident?.signal}" : "{signal:options.signal}")
    || !fallback?.initializer || !ts.isArrowFunction(fallback.initializer) || fallback.initializer.parameters.length !== 0 || (mcp ? body !== call : !guarded)) {
    reject("bindGoalsManagementActions must build the single lazy fallback with the project's actionClient(reference), retaining Home ownership before creation, bound reference and original signal");
  }
  const resident = namedCalls("residentManagementActions"), residentCall = resident.length === 1 ? resident[0] : undefined;
  const residentInput = residentCall?.arguments[0];
  const values = new Map(residentInput && ts.isObjectLiteralExpression(residentInput) ? residentInput.properties.map(property =>
    [property.name && text(property.name), ts.isShorthandPropertyAssignment(property) ? property.name.text : ts.isPropertyAssignment(property) ? text(property.initializer) : undefined]) : []);
  const expected = mcp ? { home: "caller.resident.home", origin: "caller.resident.origin", signal: "caller.resident.signal",
    databasePath: "owned.database_path", projectId: "owned.project_id", fallback: "fallback" }
    : { home: "home", origin: "options.actionServiceUrl??readProductEnv(\"WEB_URL\")??DEFAULT_RESIDENT_HOST_URL", signal: "options.signal",
      databasePath: "project.database_path", projectId: "project.project_id", fallback: "fallback" };
  if (!imports.has("./management-action-client.js:residentManagementActions") || !residentCall || residentCall.arguments.length !== 1
    || residentInput.properties.length !== Object.keys(expected).length || values.size !== Object.keys(expected).length
    || Object.entries(expected).some(([key, value]) => values.get(key) !== value)) {
    reject("residentManagementActions must carry the catalog project, original signal and the actual lazy fallback");
  }
  const actions = declarations.get("actions"), dispatch = namedCalls(mcp ? "dispatchMcpProjectTool" : "dispatchCliProjectCommand");
  const expectedActions = mcp ? 'audience!=="management"?null:owned&&caller.resident?residentManagementActions' : "project?residentManagementActions";
  const expression = actions?.initializer;
  const inner = mcp && expression && ts.isConditionalExpression(expression) ? expression.whenFalse : expression;
  if (!expression || !text(expression).startsWith(expectedActions) || !inner || !ts.isConditionalExpression(inner)
    || inner.whenTrue !== residentCall || text(inner.whenFalse) !== "fallback()" || (mcp && (!ts.isConditionalExpression(expression)
      || text(expression.condition) !== 'audience!=="management"' || expression.whenTrue.kind !== ts.SyntaxKind.NullKeyword))
    || dispatch.length !== 1 || text(dispatch[0].arguments[0]) !== "actions" || namedCalls("fallback").length !== 1) {
    reject("the dispatcher must receive the actual resident/fallback port; Runtime gets null and cannot acquire management actions");
  }
  const catalog = namedCalls("catalogManagementProject"), owner = declarations.get(mcp ? "owned" : "project");
  const expectedOwner = mcp ? 'audience==="management"&&caller.resident?catalogManagementProject(caller.resident.home,databasePath):undefined'
    : "options.localHost&&!options.actionServiceUrl?undefined:catalogManagementProject(home,databasePath)";
  if (!imports.has("./management-action-client.js:catalogManagementProject") || catalog.length !== 1 || text(owner?.initializer) !== expectedOwner) {
    reject("only the actual catalogManagementProject lookup selects the resident project; Runtime cannot supply its ownership");
  }
  const ownerName = mcp ? "owned" : "project";
  const rebound = namedCalls("molisWorkHostProjectReference").filter(node => ts.isBinaryExpression(node.parent)
    && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && text(node.parent.left) === "reference");
  const canonical = rebound.length === 1 ? rebound[0] : undefined, canonicalGuard = canonical?.parent.parent.parent;
  if (!canonical || text(canonical) !== `molisWorkHostProjectReference({databasePath:${ownerName}.database_path,projectId:${ownerName}.project_id})`
    || !canonicalGuard || !ts.isIfStatement(canonicalGuard) || text(canonicalGuard.expression) !== ownerName || !actions || canonical.pos >= actions.pos) {
    reject("the selected catalog owner must rebind the exact database and project reference before opening or dispatching");
  }
  const opens = calls.filter(node => ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "withScope");
  const preopen = opens.length === 1 ? opens[0] : undefined, scoped = preopen?.expression.expression;
  if (mcp) {
    const statement = preopen?.parent.parent, guard = statement?.parent;
    if (!preopen || text(preopen) !== "caller.localHost.client(reference).withScope(()=>undefined)" || !ts.isAwaitExpression(preopen.parent)
      || !statement || !ts.isExpressionStatement(statement) || !guard || !ts.isIfStatement(guard) || text(guard.expression) !== "!owned"
      || guard.thenStatement !== statement || !actions || preopen.pos >= actions.pos) {
      reject("preserve the awaited empty withScope for !owned only, before dispatch, with no typed business IO or plugin preparation");
    }
  } else if (opens.length) reject("the CLI has no separate typed withScope business route");
  const permitted = [opened?.expression, ...(mcp ? [preopen?.expression, scoped?.expression] : [])];
  for (const access of accesses) if (!permitted.includes(access)) reject(`no second route through a Host client (${text(access)})`);
  for (const name of names) if (!permitted.some(access => access?.name === name)) reject(`${name.text} is not the single empty scope or factory client`);
  return errors;
}

/** Production MCP validates through its resident before any local preparation; the embedded/CLI route below stays checked verbatim. */
function productionMcpBranch(file, text) {
  const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "callMcpV1Tool");
  const branches = fn?.body?.statements.filter(node => ts.isIfStatement(node) && text(node.expression) === 'audience==="management"&&caller.resident?.ensureResident') ?? [];
  if (branches.length !== 1) return { error: "the final MCP entry must have exactly one production management resident branch" };
  const branch = branches[0];
  const prefix = fn.body.statements.slice(0, fn.body.statements.indexOf(branch));
  const missingLocation = prefix[2];
  const refusals = missingLocation && ts.isIfStatement(missingLocation) && ts.isBlock(missingLocation.thenStatement) ? missingLocation.thenStatement.statements : [];
  const refusal = refusals.length === 1 && ts.isThrowStatement(refusals[0]) ? refusals[0].expression : undefined;
  const purePrefix = prefix.length === 3 && text(prefix[0]) === "const{audience,runtimeConnection}=caller;"
    && text(prefix[1]) === 'constlocation=audience==="runtime"?runtimeConnection!.databasePath:namedDatabasePath(arguments_.database_path)??namedDatabasePath(readProductEnv("DATABASE"));'
    && ts.isIfStatement(missingLocation) && text(missingLocation.expression) === "!location" && !missingLocation.elseStatement
    && refusal && ts.isNewExpression(refusal) && text(refusal.expression) === "ActionError" && refusal.arguments?.length === 2
    && ts.isStringLiteralLike(refusal.arguments[0]) && refusal.arguments[0].text === "mcp.path_required" && ts.isStringLiteralLike(refusal.arguments[1]);
  const statements = branch.thenStatement && ts.isBlock(branch.thenStatement) ? branch.thenStatement.statements : [];
  const returned = statements.length === 1 && ts.isReturnStatement(statements[0]) ? statements[0].expression : undefined;
  const dispatch = returned && ts.isCallExpression(returned) && text(returned.expression) === "dispatchMcpProjectTool" ? returned : undefined;
  const resident = dispatch?.arguments[0];
  const input = resident && ts.isCallExpression(resident) && text(resident.expression) === "residentManagementActions" && resident.arguments.length === 1 ? resident.arguments[0] : undefined;
  const expected = { home: "caller.resident.home", origin: "caller.resident.origin", signal: "caller.resident.signal",
    ensureResident: "caller.resident.ensureResident", databasePath: "path.resolve(location)", projectId: "String(arguments_.project_id)",
    fallback: '()=>{thrownewActionError("actions.service_unavailable","生产MCP不在本地执行管理操作");}' };
  const values = new Map(input && ts.isObjectLiteralExpression(input) ? input.properties.map(property =>
    [property.name && text(property.name), ts.isPropertyAssignment(property) ? text(property.initializer) : undefined]) : []);
  let firstPreparation;
  const find = node => {
    if (!firstPreparation && ts.isCallExpression(node) && text(node.expression) === "prepareLocalProjectStorage") firstPreparation = node;
    ts.forEachChild(node, find);
  };
  if (fn?.body) find(fn.body);
  const valid = purePrefix && !branch.elseStatement && dispatch?.arguments.length === 4 && text(dispatch.arguments[1]) === "name"
    && text(dispatch.arguments[2]) === "arguments_" && text(dispatch.arguments[3]) === "{audience,createError:createPresentationError}"
    && input && ts.isObjectLiteralExpression(input) && input.properties.length === Object.keys(expected).length
    && values.size === Object.keys(expected).length && Object.entries(expected).every(([key, value]) => values.get(key) === value)
    && firstPreparation && branch.end < firstPreparation.pos && missingLocation && missingLocation.end <= branch.pos;
  return { node: valid ? branch : undefined, error: valid ? undefined : "the production MCP branch must forward the trusted Home/signal/ensure before local preparation, with a throwing fallback and no other work" };
}
