import ts from 'typescript';

/** Pool repeated expression strings inside existing function scopes only; never rename public keys or change literals. */
export function poolClientLiterals(source) {
  const ast=ts.createSourceFile('client.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const edits=[];let sequence=0;
  const visit=node=>{
    if(!ts.isFunctionLike(node)||!node.body||!ts.isBlock(node.body)||node.getWidth()<10000){ts.forEachChild(node,visit);return;}
    const strings=new Map();
    const collect=child=>{
      if(ts.isStringLiteral(child)&&child.text.length>10&&child.parent.name!==child&&child.parent.propertyName!==child&&!ts.isExpressionStatement(child.parent)){
        const rows=strings.get(child.text)??[];rows.push(child);strings.set(child.text,rows);
      }
      ts.forEachChild(child,collect);
    };
    collect(node.body);const declarations=[];
    for(const [value,rows] of strings){
      if(rows.length<3)continue;
      let name;do{name=`_molisTextPool${sequence++}`;}while(source.includes(name));
      declarations.push(`${name}=${JSON.stringify(value)}`);
      for(const row of rows)edits.push({start:row.getStart(),end:row.end,text:name});
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
