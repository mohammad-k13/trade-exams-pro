/** Expected failure with a Persian message that is safe to show to the user. */
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor() {
    super("یافت نشد.", 404);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends AppError {
  constructor() {
    super("به این بخش دسترسی ندارید.", 403);
    this.name = "ForbiddenError";
  }
}
