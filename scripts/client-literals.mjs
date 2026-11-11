import {readFileSync,writeFileSync} from 'node:fs';
import ts from 'typescript';
import {transformSync} from 'esbuild';
import {isMainScript} from './script-paths.mjs';

/** Pool repeated expression strings inside existing function scopes only; never rename public keys or change literals. */
export function poolClientLiterals(source, { byBytes = false } = {}) {
  const ast=ts.createSourceFile('client.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const minimumScopeWidth = byBytes ? 1000 : 10000;
  const edits=[];let sequence=0;
  const visit=node=>{
    if(!ts.isFunctionLike(node)||!node.body||!ts.isBlock(node.body)||node.getWidth()<minimumScopeWidth){ts.forEachChild(node,visit);return;}
    const strings=new Map();
    const collect=child=>{
      if(ts.isStringLiteral(child)&&(byBytes||child.text.length>10)&&child.parent.name!==child&&child.parent.propertyName!==child&&!ts.isExpressionStatement(child.parent)){
        const rows=strings.get(child.text)??[];rows.push(child);strings.set(child.text,rows);
      }
      ts.forEachChild(child,collect);
    };
    collect(node.body);const declarations=[];
    for(const [value,rows] of strings){
      const literal=JSON.stringify(value);
      // Estimate two bytes per shortened reference and five for its declaration.
      if(byBytes ? (rows.length-1)*Buffer.byteLength(literal)<=rows.length*2+5 : rows.length<3)continue;
      let name;do{name=`_molisTextPool${sequence++}`;}while(source.includes(name));
      declarations.push(`${name}=${literal}`);
      // Quotes separated the literal from adjacent tokens such as in and return.
      for(const row of rows)edits.push({start:row.getStart(),end:row.end,text:` ${name} `});
    }
    if(!declarations.length)return;
    let position=node.body.getStart()+1;
    for(const statement of node.body.statements){if(!ts.isExpressionStatement(statement)||!ts.isStringLiteral(statement.expression))break;position=statement.end;}
    edits.push({start:position,end:position,text:`;const ${declarations.join(',')};`});
  };
  visit(ast);
  for(const {start,end,text} of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,start)+text+source.slice(end);
  return source;
}

/** Compact an already assembled browser program without changing its globals or literal values. */
export function compactClientScript(source) {
  const minify = script => transformSync(script, {
    loader: 'js', target: 'es2022', charset: 'utf8', minifyWhitespace: true, minifyIdentifiers: true, minifySyntax: true, legalComments: 'none',
  }).code;
  return minify(poolClientLiterals(minify(source), { byBytes: true }));
}

/** Compact the body of the factory emitted by the native plugin builds, preserving the Host's callable expression. */
export function compactClientFactory(source) {
  const start = '(host) => {\n', end = '}\n';
  if (!source.startsWith(start) || !source.endsWith(end)) throw new Error('Expected a plugin client factory');
  return start + compactClientScript(source.slice(start.length, -end.length)) + end;
}

if (isMainScript(import.meta.url)) {
  const [mode, file] = process.argv.slice(2);
  if (mode === '--factory' && file) writeFileSync(file, compactClientFactory(readFileSync(file, 'utf8')));
  else if (mode === undefined) process.stdout.write(compactClientScript(readFileSync(0, 'utf8')));
  else throw new Error('Usage: client-literals.mjs [--factory <path>]');
}
