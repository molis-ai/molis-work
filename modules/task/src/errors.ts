export type TaskErrorFactory = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
) => Error;

export class TaskError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "TaskError";
    this.code = code;
    this.details = details;
  }
}

export const defaultTaskErrorFactory: TaskErrorFactory = (code, message, details) =>
  new TaskError(code, message, details);
