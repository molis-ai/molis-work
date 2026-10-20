import type {LocalWebCatalogRunner} from './web-project-settings.js';
type Catalog=Parameters<Parameters<LocalWebCatalogRunner>[1]>[0];
/** Existing originals are visible only to passive owner inspection; recycled partitions never become upload candidates. */
export function projectSyncCatalog(catalog:Catalog){
 return [...catalog.listProjects().map(p=>({project_id:p.project_id,display_name:p.display_name,database_path:p.database_path,recycled:false})),
  ...catalog.recycle.list().map(p=>({project_id:p.project_id,display_name:p.display_name,database_path:p.database_path,recycled:true}))];
}
