import type { PluginInstanceRecord, PluginRuntimeRepository } from "@molis-ai/molis-work-contracts/platform/plugin";
import { cloneRecord } from "./runtime-rules.js";

export class MemoryPluginRuntimeRepository implements PluginRuntimeRepository {
  private readonly records = new Map<string, PluginInstanceRecord>();

  get(installId: string): PluginInstanceRecord | null {
    const record = this.records.get(installId);
    return record ? cloneRecord(record) : null;
  }

  list(): PluginInstanceRecord[] {
    return [...this.records.values()]
      .map(cloneRecord)
      .sort((left, right) => left.installed_at.localeCompare(right.installed_at)
        || left.install_id.localeCompare(right.install_id));
  }

  save(record: PluginInstanceRecord): void {
    this.records.set(record.install_id, cloneRecord(record));
  }
}
