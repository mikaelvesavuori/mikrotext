export class MikroTextError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(message: string, status = 400, code = "BAD_REQUEST") {
    super(message);
    this.name = "MikroTextError";
    this.status = status;
    this.code = code;
  }
}
