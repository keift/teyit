export class ValidationError extends Error {
  public code: string;
  public parts: Record<string, unknown>;

  public constructor(options: { message: string; code: string; parts: Record<string, unknown> }) {
    super(options.message);

    this.name = 'ValidationError';

    this.code = options.code;
    this.parts = options.parts;

    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
