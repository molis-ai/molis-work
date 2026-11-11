/**
 * The one way the workbench reads a project's file sources (N52, specs/batch-06-shared-tools BSH-13): every source the project
 * shows, with its first page, in one request. The side panel's 资料 tab and a Goal's 「加输入」 both use it. A source listed but not
 * set up here is left out; one whose page failed is kept with its reason, and the rest still show. Later pages are read on demand.
 * `get` is the caller's own request helper, which answers the route's JSON.
 */
export const SIDE_FILE_SOURCES_CLIENT_SCRIPT = String.raw`const readSideFileSources=async(get)=>{
    const answer=await get('/api/side/files/sources?first_pages=1'),sources=[],pages=new Map();
    for(const source of answer.sources||[]){
      if(source.state==='unavailable')continue;
      sources.push(source);
      pages.set(source.id,source.state==='ready'?{items:source.page.entries,next:source.page.next_cursor,error:null}:{items:[],next:null,error:source.error||''});
    }
    return{sources,pages};
  };`;
