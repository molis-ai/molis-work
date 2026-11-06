import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
process.env.MOLIS_SYNC_MINIFLARE_MODULE=require.resolve('miniflare');
