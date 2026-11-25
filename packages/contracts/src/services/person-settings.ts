import type { PersonSettingKind } from "../platform/plugin-partition.js";

/** One stored person setting of an installation (`horizontal/person-settings`, S-person-settings-private). */
export interface PersonSettingRecord {
  readonly key: string;
  readonly kind: PersonSettingKind;
  readonly portable: boolean;
  readonly value: unknown;
  readonly revision: number;
  readonly updated_at: string;
}
