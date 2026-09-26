/** A minimal stdio MCP server with one writing tool: each call appends its note to mcp-notes.jsonl in its working directory. */
export const MCP_FIXTURE = `import {createInterface} from 'node:readline';
const tools=[{name:'record_review_note',description:'Record a reviewed note in this test workspace.',inputSchema:{type:'object',properties:{note:{type:'string'}},required:['note'],additionalProperties:false}}];
for await(const line of createInterface({input:process.stdin})){const m=JSON.parse(line);if(m.id===undefined)continue;let result;
if(m.method==='initialize')result={protocolVersion:m.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'coding-fixture',version:'1.0.0'}};
else if(m.method==='tools/list')result={tools};
else if(m.method==='tools/call'){const {appendFile}=await import('node:fs/promises');await appendFile('mcp-notes.jsonl',JSON.stringify(m.params.arguments)+'\\n');result={content:[{type:'text',text:'Saved one note: '+m.params.arguments.note}]};}
else {process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Not supported'}})+'\\n');continue;}
process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');}
`;
