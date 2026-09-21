export class PptError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PptError";
    this.code = code;
  }
}
