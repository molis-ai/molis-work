export class LingguangError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LingguangError";
    this.code = code;
  }
}
