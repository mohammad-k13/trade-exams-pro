// Pure time and access rules for exams. Used by services and tests.

export type DisplayStatus = "draft" | "scheduled" | "active" | "closed";

export interface ExamTiming {
  status: "DRAFT" | "PUBLISHED";
  startsAt: Date;
  endsAt: Date;
  closedAt: Date | null;
}

export function displayStatus(e: ExamTiming, now: Date): DisplayStatus {
  if (e.status === "DRAFT") return "draft";
  if (e.closedAt && e.closedAt <= now) return "closed";
  if (now >= e.endsAt) return "closed";
  return now < e.startsAt ? "scheduled" : "active";
}

/** Deadline = min(startedAt + duration, exam end). */
export function attemptDeadline(startedAt: Date, durationMinutes: number, examEnd: Date): Date {
  return new Date(Math.min(startedAt.getTime() + durationMinutes * 60_000, examEnd.getTime()));
}

/**
 * Saves are accepted this long after the deadline. It covers only network latency for an answer sent
 * in the final moment; the countdown the student sees ends at the real deadline.
 */
export const SAVE_GRACE_MS = 5_000;

export function isExpired(deadlineAt: Date, now: Date): boolean {
  return now.getTime() > deadlineAt.getTime() + SAVE_GRACE_MS;
}

export interface ReviewPolicyInput extends ExamTiming {
  reviewPolicy: "NEVER" | "AFTER_SUBMIT" | "AFTER_CLOSE" | "AT_TIME";
  reviewAt: Date | null;
  maxAttempts: number;
}

/**
 * When a student may see answers and hidden candles. Requires a finished attempt and the master's policy.
 * Before the exam closes it also requires no attempts left, otherwise a student could read the answers
 * and then retake the exam.
 */
export function canReview(e: ReviewPolicyInput, finishedAttempts: number, hasInProgress: boolean, now: Date): boolean {
  if (finishedAttempts === 0 || hasInProgress) return false;
  const closed = displayStatus(e, now) === "closed";
  const noAttemptsLeft = finishedAttempts >= e.maxAttempts;
  switch (e.reviewPolicy) {
    case "NEVER":
      return false;
    case "AFTER_CLOSE":
      return closed;
    case "AFTER_SUBMIT":
      return closed || noAttemptsLeft;
    case "AT_TIME":
      return !!e.reviewAt && now >= e.reviewAt && (closed || noAttemptsLeft);
  }
}

/** The score alone reveals no answers, so it is shown once the exam is closed even without review. */
export function canSeeScore(e: ReviewPolicyInput, finishedAttempts: number, hasInProgress: boolean, now: Date): boolean {
  if (finishedAttempts === 0 || hasInProgress) return false;
  return displayStatus(e, now) === "closed" || canReview(e, finishedAttempts, hasInProgress, now);
}
