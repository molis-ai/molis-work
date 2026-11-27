import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { goldenFailure } from "./failure.mjs";
import { goldenActions, openGoldenHost } from "./session.mjs";

/** The seeded Todo and the scheduler must still identify the same future reminder after both starts. */
export function assertSeededReminders(manifest, root) {
  for (const entry of manifest.stores.filter(row => row.path.endsWith("due-registry/due-registry.db") && row.tables.due_entries > 0)) {
    const home = path.resolve(root, path.dirname(entry.path), "..");
    const library = new DatabaseSync(path.join(home, "personal-space/libraries/todo.db"), { readOnly: true });
    const due = new DatabaseSync(path.join(root, entry.path), { readOnly: true });
    try {
      const task = library.prepare("SELECT id, remind_at FROM todo_items WHERE title = ?").get("金样待办 seed 已改");
      const row = task && due.prepare("SELECT due_at FROM due_entries WHERE partition_id='personal' AND plugin_id='io.molis.work.todo' AND source='overview' AND entry_key=?").get("task:" + task.id);
      if (!row || Date.parse(row.due_at) !== Date.parse(task.remind_at)) throw goldenFailure("golden.seeded_reminder_missing", entry.path);
    } finally { due.close(); library.close(); }
  }
}

/** A retained library can belong to a disabled plugin. Enable it in the restored copy and read its original content through the owner. */
export async function readSeededPersonalPartition(manifest, homes) {
  for (const item of homes) {
    const recorded = relative => manifest.stores.find(store => store.path === path.posix.join(item.path, relative));
    const images = recorded("person-settings/person-settings.db")?.tables.person_settings > 0;
    const jelly = recorded("personal-space/libraries/jelly.db")?.tables.jelly_notes > 0;
    if (!images && !jelly) continue;
    const session = await openGoldenHost(item.at, { web: false });
    try {
      const withCatalog = session.host.configurePersonalPlanning(item.at, withMolisWorkProjectCatalog);
      const project = await withCatalog({ homeDirectory: item.at }, async catalog => {
        const member = plugin_id => catalog.addProjectPlugin({ project_id: PERSONAL_SPACE_PROJECT_ID, plugin_id, actor_id: "golden-replay" });
        if (images) await member("images");
        if (jelly) await member("jelly");
        return catalog.getProject(PERSONAL_SPACE_PROJECT_ID);
      });
      const { call } = goldenActions(session, project, "replay");
      if (images) {
        const { connections } = await call("images.connections.list");
        if (!connections.some(service => service.name === "金样图片连接 seed 已改" && service.model === "golden-model")) {
          throw goldenFailure("golden.seeded_image_connection_missing", item.path || "root");
        }
      }
      if (jelly) {
        const { notes } = await call("jelly.note.list", { query: "金样便笺 seed 已改" });
        if (!notes.some(note => note.title === "金样便笺 seed 已改")) throw goldenFailure("golden.seeded_jelly_note_missing", item.path || "root");
      }
    } finally { await session.close(); }
  }
}
