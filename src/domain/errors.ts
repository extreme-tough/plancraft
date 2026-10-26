/** A rule in the domain was broken. `code` is stable and safe to log; the message is for people. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export type DomainErrorCode =
  | "not_found"
  | "wrong_target"
  | "locked_line"
  | "dependency_cycle"
  | "task_done"
  | "invalid_value"
  | "invalid_plan"
  | "stale_proposal"
  | "confirmed_changed"
  | "illegal_transition";
