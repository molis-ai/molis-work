import {directions} from './directions.mjs';
const luminance=hex=>{const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
const contrast=(a,b)=>{const l=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (l[0]+.05)/(l[1]+.05);};
let bad=false;for(const d of directions)for(const theme of ['light','dark'])for(const [foreground,background]of [['ink','paper'],['muted','paper'],['action-ink','action'],['red','paper'],['accent','paper'],['green','paper'],['amber','paper']]){const ratio=contrast(d[theme][foreground],d[theme][background]);console.log(d.id,theme,foreground,background,ratio.toFixed(2));if(ratio<4.5)bad=true;}if(bad)process.exitCode=1;
