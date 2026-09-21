export class PagesError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PagesError";
    this.code = code;
  }
}
