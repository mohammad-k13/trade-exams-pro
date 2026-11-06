import { ForbiddenError } from "./errors";

/** Who is performing an action. Every service takes one of these. */
export interface Actor {
  id: string;
  role: "ADMIN" | "MASTER" | "STUDENT";
  organizationId: string | null;
}

export interface MasterActor extends Actor {
  role: "MASTER";
  organizationId: string;
}

export function assertMaster(actor: Actor): asserts actor is MasterActor {
  if (actor.role !== "MASTER" || !actor.organizationId) throw new ForbiddenError();
}

export function assertStudent(actor: Actor): void {
  if (actor.role !== "STUDENT") throw new ForbiddenError();
}

export function assertAdmin(actor: Actor): void {
  if (actor.role !== "ADMIN") throw new ForbiddenError();
}
