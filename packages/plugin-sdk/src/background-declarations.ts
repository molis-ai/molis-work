// The shape of a Manifest's `background` (PG-038): the jobs an activation may keep (`services.background.keep`). Only the shape and the
// permissions are checked here; where a job may be kept from, and when its writes are refused, is for the platform while it runs
// (packages/plugin-runtime `createActivationJobs`). `parsePluginManifest` is the one caller.

/** The name a job goes by, the same rule as a plugin's store name. */
const JOB_ID = /^[a-z][a-z0-9-]*$/u;
const JOB_FIELDS = new Set(["job_id", "reason", "permissions"]);

export function backgroundDeclarationProblems(value: unknown, permissions: ReadonlySet<string>): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return ["background 必须为对象"];
  const extra = Object.keys(value).filter(field => field !== "jobs");
  if (extra.length > 0) return [`background 不认这些字段：${extra.join("、")}`];
  if (!Array.isArray(value.jobs) || value.jobs.length === 0) return ["background.jobs 必须是至少有一项的数组"];
  const problems: string[] = [], seen = new Set<string>();
  for (const job of value.jobs) {
    if (!isRecord(job) || typeof job.job_id !== "string" || !JOB_ID.test(job.job_id)) {
      problems.push("后台作业的 job_id 必须是小写字母开头、只含小写字母、数字和连字符的名字");
      continue;
    }
    const id = job.job_id;
    if (seen.has(id)) { problems.push(`后台作业重复：${id}`); continue; }
    seen.add(id);
    const unknown = Object.keys(job).filter(field => !JOB_FIELDS.has(field));
    if (unknown.length > 0) problems.push(`后台作业 ${id} 不认这些字段：${unknown.join("、")}`);
    if (typeof job.reason !== "string" || job.reason.trim().length === 0) problems.push(`后台作业 ${id} 要写明用途（reason）`);
    if (!Array.isArray(job.permissions) || job.permissions.some(permission => typeof permission !== "string")) {
      problems.push(`后台作业 ${id} 的 permissions 必须为字符串数组`);
      continue;
    }
    for (const permission of job.permissions as string[]) {
      if (!permissions.has(permission)) problems.push(`后台作业 ${id} 使用未声明权限 ${permission}`);
    }
  }
  return problems;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
