/** A passive, portable view of canonical saved SDK history. No execution handles or grants. */
export interface AgentSavedHistoryMessage { role: 'user'|'assistant'|'system'|'tool'|'event'; text: string }
export interface AgentSavedHistoryRun { run_id: string; outcome: string; messages: AgentSavedHistoryMessage[] }
export interface AgentSavedHistoryView { runs: AgentSavedHistoryRun[] }
