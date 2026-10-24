/** The JSON the Coding routes answer, as far as the main page reads it (src/routes-*.ts write it). */

export interface GoalSummary { readonly goal_id: string; readonly title: string; readonly work_status?: string }

export interface GoalChoice {
  readonly snapshot: {
    readonly goal: {
      readonly goal_id: string;
      readonly title: string;
      readonly outcome: string;
      readonly why: string;
      readonly business_logic: string;
      readonly in_scope: readonly string[];
      readonly out_of_scope: readonly string[];
      readonly constraints: readonly string[];
      readonly required_inputs: readonly string[];
      readonly promised_outputs: readonly string[];
      readonly [field: string]: unknown;
    };
    readonly state: {
      readonly agreement: { readonly version: number; readonly outcome?: string };
      readonly requirements: readonly { readonly statement: string; readonly human_decision_required?: boolean }[];
      readonly goal_event_cursor: number | string;
    };
  };
  readonly material: { readonly text: string };
}

export interface ArtifactRow {
  readonly reference: { readonly artifact_id: string; readonly version: number };
  readonly title: string;
  readonly kind: string;
  readonly saved_at: string;
  readonly file_count?: number;
  readonly archived?: boolean;
}
