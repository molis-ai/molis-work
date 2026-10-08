/**
 * An owner cannot clear the project's data in this process right now, though the data is still its to clear: the
 * service that holds it belongs to another process (the Agent runtime, the search index of a running Host), or this
 * process has no such service at all. It is not a failure: the step stays pending in the receipt, and a process that
 * has the service runs it.
 */
export class ProjectDeletedDeferred extends Error {
  readonly code = "project_deleted.deferred";
  constructor(message: string) { super(message); this.name = "ProjectDeletedDeferred"; }
}
