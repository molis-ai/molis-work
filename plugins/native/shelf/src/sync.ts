import { openShelfStore, SHELF_DOCUMENT_PATH, createShelfSyncContent, type ShelfSyncOptions } from '@molis-ai/molis-work-module-shelf';

/** The same owner document as normal Shelf actions. Discovery neither seeds a sample nor probes a runtime. */
export const shelfSyncDocument={
  scope:'home-document' as const,path:SHELF_DOCUMENT_PATH,content:createShelfSyncContent,
  open(home:string,context:ShelfSyncOptions){return openShelfStore(home,{disabled:true},{},undefined,context).replica();},
};
