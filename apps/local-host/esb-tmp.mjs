import { transform, transformSync } from "esbuild";
const src = "function a(){return 1}\n".repeat(200000);
let t=Date.now(); transformSync(src,{loader:"js",minifyWhitespace:true}); console.log("sync",Date.now()-t);
t=Date.now(); await transform(src,{loader:"js",minifyWhitespace:true}); console.log("async",Date.now()-t);
t=Date.now(); await Promise.all([1,2,3,4].map(()=>transform(src,{loader:"js",minifyWhitespace:true}))); console.log("async x4",Date.now()-t);
