import {createPersonalSync,createWebCatalogAccess} from '@molis-ai/molis-work-app-local-host';
import {openMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';

/** A native-only coordinator still gets the live catalog owner; it never discovers or starts Runtime plugins. */
export async function createStaticPersonalSync(...args:Parameters<typeof createPersonalSync>) {
  const access=createWebCatalogAccess(args[0],openMolisWorkProjectCatalog);
  try {
    await access.warm();
    const [home,space,lease,,assertActive,discover,lifecycle]=args;
    const sync=await createPersonalSync(home,space,lease,access.withCatalog,assertActive,discover,lifecycle,access.read);
    if(!sync){await access.close();return null;}
    const close=sync.close.bind(sync);
    return Object.assign(sync,{withCatalog:access.withCatalog,async close(){close();await access.close();}});
  } catch(error) {await access.close();throw error;}
}
