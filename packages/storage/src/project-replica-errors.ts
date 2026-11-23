import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';

const codes = defineErrorCodes('storage', {
  replica_root_invalid: 'invalid',
  replica_identifier_invalid: 'invalid',
  replica_identity_scope_mismatch: 'forbidden',
  replica_rows_invalid: 'invalid',
  replica_tables_invalid: 'invalid',
  replica_row_invalid: 'invalid',
  replica_columns_invalid: 'invalid',
  replica_value_invalid: 'invalid',
  replica_scope_mismatch: 'forbidden',
  replica_json_invalid: 'invalid',
  replica_identity_invalid: 'invalid',
  replica_sequence_invalid: 'invalid',
  replica_sequence_missing: 'invalid',
  replica_journal_invalid: 'invalid',
});
export function replicaError(reason: keyof typeof codes) {
  return codes[reason]('项目同步数据校验失败，已保留原内容（' + reason + '）');
}
