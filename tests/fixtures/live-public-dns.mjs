// Opt-in live-test network, loaded with NODE_OPTIONS=--import: use real public DNS for two fixed public targets.
// VPNs that synthesize reserved IPs can otherwise be correctly refused by the production SSRF guard.
// This changes only this test process's resolver, never the production policy or machine network.
// Keep EVERY A/AAAA answer; production still validates and pins the connection.
import dns from 'node:dns';
import promises from 'node:dns/promises';
import {syncBuiltinESMExports} from 'node:module';
import {appendFileSync} from 'node:fs';
const names=new Set(['simonwillison.net','registry.npmjs.org']);
const original=dns.lookup, originalPromise=promises.lookup;
const fetchDns=globalThis.fetch;
async function lookup(name, options={}) {
 const rows=(await Promise.all([1,28].map(async type=>{
  const response=await fetchDns(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,{signal:AbortSignal.timeout(8000),redirect:'error'});
  if(!response.ok)throw new Error(`live DNS HTTP ${response.status}`);
  const body=await response.json();if(body.Status!==0)throw new Error(`live DNS status ${body.Status}`);
  return (body.Answer||[]).filter(row=>row.type===1||row.type===28).map(row=>({address:row.data,family:row.type===1?4:6}));
 }))).flat();
 if(process.env.MOLIS_LIVE_DNS_LOG)appendFileSync(process.env.MOLIS_LIVE_DNS_LOG,JSON.stringify({name,rows})+'\n');
 const family=typeof options==='number'?options:options.family;
 const accepted=family?rows.filter(row=>row.family===family):rows;
 if(!accepted.length)throw new Error('live DNS empty');
 return typeof options==='object'&&options.all?accepted:accepted[0];
}
promises.lookup=(name,options)=>names.has(name)?lookup(name,options):originalPromise(name,options);
dns.lookup=(name,options,callback)=>{
 if(!names.has(name))return original(name,options,callback);
 if(typeof options==='function'){callback=options;options={};}
 lookup(name,options).then(rows=>Array.isArray(rows)?callback(null,rows):callback(null,rows.address,rows.family),callback);
};
syncBuiltinESMExports();
