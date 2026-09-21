export class DatasetError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DatasetError";
    this.code = code;
  }
}
