import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';

const codes = defineErrorCodes('host', {
  replica_scope_mismatch: 'forbidden',
  replica_key_invalid: 'invalid',
  replica_references_invalid: 'invalid',
  replica_decision_invalid: 'invalid',
  replica_input_invalid: 'invalid',
  replica_context_invalid: 'invalid',
  replica_invalid: 'invalid',
  replica_limit: 'too_large',
  replica_project_unavailable: 'invalid',
  replica_project_invalid: 'invalid',
});
export function replicaError(reason: keyof typeof codes) {
  const message = reason.includes('limit') ? '项目 Goal 记录超过同步容量限制，请保留本机数据并联系管理员' : 'Goal 同步数据校验失败，已保留原内容';
  return codes[reason](message + '（' + reason + '）');
}
