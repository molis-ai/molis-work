export class AlchemistError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AlchemistError";
    this.code = code;
  }
}
