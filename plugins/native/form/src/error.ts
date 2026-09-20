export class FormError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FormError";
    this.code = code;
  }
}
