export class ValidationError extends Error {
  public code: string;
  public parts: Record<string, string>;

  public constructor(options: { message: string; code: string; parts: Record<string, string> }) {
    super(options.message);

    this.name = 'ValidationError';

    this.code = options.code;
    this.parts = options.parts;

    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
