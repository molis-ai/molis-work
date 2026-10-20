import {openBaselineHomeSqlite,openAggregateCopyOwner,type AggregateCopyContext} from '@molis-ai/molis-work-storage';
import {FORM_DATABASE,FORM_HOME_STORE} from './store.js';
import {formAggregates} from './replication.js';
/** The same owner graph, with a read-only source connection and no missing-store creation. */
export function openFormCopyOwner(home:string,context:AggregateCopyContext){return openAggregateCopyOwner(home,FORM_HOME_STORE.path,FORM_DATABASE,formAggregates,context,()=>openBaselineHomeSqlite(home,FORM_HOME_STORE.path,FORM_DATABASE));}
