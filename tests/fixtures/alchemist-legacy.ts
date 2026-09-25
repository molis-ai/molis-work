import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { openAlchemistStore } from "@molis-ai/molis-work-plugin-alchemist";

/** Historical rows, not the retired demo generation/writing implementation. */
export function seedAlchemistLegacy(home: string) {
  openAlchemistStore(home).close();
  const db = openHomeSqliteDatabase(home, "alchemist");
  try {
    db.prepare("INSERT INTO directions VALUES (?, ?, ?, ?, ?, ?)").run("old-direction", "project-a", "旧方向", "保留历史", "2024-01-01", "2024-02-01");
    db.prepare("INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("old-card", "old-direction", "project-a", "demo", "kept", "旧演示卡", "旧亮点", "用户", "场景", "问题", "机制", "价值", "原理由", '["原假设"]', '["原未知"]', '["原范围"]', '["不做"]', "2024-01-01", "2024-02-01");
    db.prepare("INSERT INTO decisions VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("old-decision", "old-card", "old-direction", "project-a", "hold", "历史判断理由", "2024-02-01", "2024-02-01");
  } finally { db.close(); }
}
