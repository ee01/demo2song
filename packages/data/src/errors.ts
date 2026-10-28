export class RepositoryConflictError extends Error {
  readonly code = "CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "RepositoryConflictError";
  }
}
