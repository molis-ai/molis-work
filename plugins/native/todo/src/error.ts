export class TodoError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TodoError";
    this.code = code;
  }
}
