/**
 * Shared shape for Server Action results used with React's useActionState.
 * Every action has the signature (prev: ActionState, formData: FormData) => Promise<ActionState>.
 */
export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Optional payload, e.g. a generated credentials message to copy. */
  data?: Record<string, string>;
  /** Changes on every result so forms can reset after success. */
  ts?: number;
};

export const initialState: ActionState = {};

export function fail(error: string): ActionState {
  return { ok: false, error, ts: Date.now() };
}

export function ok(message?: string, data?: Record<string, string>): ActionState {
  return { ok: true, message, data, ts: Date.now() };
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export function int(fd: FormData, key: string, fallback = 0): number {
  const n = Number(str(fd, key));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
