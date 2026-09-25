import {BuilderError,type Expr} from './model.js';
/**
 * A one-line formula notation for calculations, e.g. `quantity * price` or
 * `if(contains(status, '已读') and year == 2026, 1, 0)`. It only produces the controlled expression tree
 * that `validation.ts` already checks; nothing here evaluates or executes anything.
 */
type Token={kind:'number'|'text'|'name'|'op'|'paren'|'comma';value:string;at:number};
const fail=(message:string,at?:number):never=>{throw new BuilderError('invalid_input',`公式${at===undefined?'':`第 ${at+1} 个字符`}：${message}`);};
function tokenize(source:string):Token[]{
 const tokens:Token[]=[];let i=0;
 while(i<source.length){
  const c=source[i]!;
  if(/\s/.test(c)){i++;continue;}
  if(/[0-9.]/.test(c)){const m=/^\d+(?:\.\d+)?|^\.\d+/.exec(source.slice(i));if(!m)fail('数字格式不正确',i);tokens.push({kind:'number',value:m![0],at:i});i+=m![0].length;continue;}
  const close=({"'":"'",'"':'"','「':'」','“':'”','‘':'’'} as Record<string,string>)[c];
  if(close){const end=source.indexOf(close,i+1);if(end<0)fail('文字缺少结束引号',i);tokens.push({kind:'text',value:source.slice(i+1,end),at:i});i=end+1;continue;}
  const op=/^(==|!=|>=|<=|&&|\|\||[+\-*/><=])/.exec(source.slice(i));
  if(op){tokens.push({kind:'op',value:op[0]==='='?'==':op[0],at:i});i+=op[0].length;continue;}
  if(c==='('||c===')'){tokens.push({kind:'paren',value:c,at:i});i++;continue;}
  if(c===','||c==='，'){tokens.push({kind:'comma',value:',',at:i});i++;continue;}
  const name=/^[A-Za-z_][A-Za-z0-9_-]*/.exec(source.slice(i));
  if(name){tokens.push({kind:'name',value:name[0],at:i});i+=name[0].length;continue;}
  fail(`无法识别「${c}」`,i);
 }
 return tokens;
}
const literal=(value:string|number|boolean):Expr=>({op:'literal',value});
const binary=(op:Extract<Expr,{left:Expr}>['op'],left:Expr,right:Expr):Expr=>({op,left,right});
const not=(condition:Expr):Expr=>({op:'if',condition,then:literal(false),else:literal(true)});
export function parseFormula(source:string):Expr{
 if(source.length>1000)fail('太长，最多 1000 个字符');
 const tokens=tokenize(source);let p=0;
 const peek=()=>tokens[p],take=()=>tokens[p++];
 const isOp=(...values:string[])=>{const t=peek();return t?.kind==='op'&&values.includes(t.value)||t?.kind==='name'&&values.includes(t.value);};
 const expect=(kind:Token['kind'],value?:string)=>{const t=take();if(!t||t.kind!==kind||(value!==undefined&&t.value!==value))fail(`这里需要「${value??kind}」`,t?.at??source.length);return t!;};
 function or():Expr{let left=and();while(isOp('or','||')){take();left=binary('or',left,and());}return left;}
 function and():Expr{let left=compare();while(isOp('and','&&')){take();left=binary('and',left,compare());}return left;}
 function compare():Expr{
  const left=sum();if(!isOp('==','!=','>','<','>=','<='))return left;const op=take()!.value,right=sum();
  if(op==='==')return binary('equal',left,right);if(op==='!=')return not(binary('equal',left,right));
  if(op==='>')return binary('gt',left,right);if(op==='<')return binary('gt',right,left);
  if(op==='>=')return binary('or',binary('gt',left,right),binary('equal',left,right));
  return binary('or',binary('gt',right,left),binary('equal',left,right));
 }
 function sum():Expr{let left=product();while(isOp('+','-')){const op=take()!.value;left=binary(op==='+'?'add':'subtract',left,product());}return left;}
 function product():Expr{let left=unary();while(isOp('*','/')){const op=take()!.value;left=binary(op==='*'?'multiply':'divide',left,unary());}return left;}
 function unary():Expr{
  const t=take();if(!t)return fail('公式不完整',source.length);
  if(t.kind==='op'&&t.value==='-'){const next=take();if(next?.kind!=='number')fail('负号后需要数字',t.at);return literal(-Number(next!.value));}
  if(t.kind==='number')return literal(Number(t.value));
  if(t.kind==='text')return literal(t.value);
  if(t.kind==='paren'&&t.value==='('){const inner=or();expect('paren',')');return inner;}
  if(t.kind==='name'){
   if(t.value==='true'||t.value==='false')return literal(t.value==='true');
   if(t.value==='not'){return not(unary());}
   if(peek()?.kind==='paren'&&peek()!.value==='('){
    take();const args:Expr[]=[];if(!(peek()?.kind==='paren'&&peek()!.value===')')){args.push(or());while(peek()?.kind==='comma'){take();args.push(or());}}expect('paren',')');
    const need=(n:number)=>{if(args.length!==n)fail(`${t.value} 需要 ${n} 个参数`,t.at);};
    if(t.value==='if'){need(3);return {op:'if',condition:args[0]!,then:args[1]!,else:args[2]!};}
    if(t.value==='contains'){need(2);return binary('contains',args[0]!,args[1]!);}
    if(t.value==='concat'){need(2);return binary('concat',args[0]!,args[1]!);}
    return fail(`不支持函数 ${t.value}，只有 if / contains / concat`,t.at);
   }
   return {op:'field',id:t.value};
  }
  return fail(`这里不能出现「${t.value}」`,t.at);
 }
 const result=or();if(p<tokens.length)fail(`多余的「${tokens[p]!.value}」`,tokens[p]!.at);
 return result;
}
