import "server-only";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { randomToken, sign, verify } from "./crypto";

/**
 * File storage for brief/deliverable uploads and signed PDFs.
 *
 * v1 uses the local filesystem (STORAGE_DIR). This works on a VPS or in local dev, but NOT on
 * serverless hosts with ephemeral disks (e.g. Vercel). Before deploying there, swap putFile /
 * getFile for Vercel Blob (private), Supabase Storage or S3 — the rest of the app only uses
 * storage keys and signed URLs from this module. Tracked in docs/ROADMAP.md.
 *
 * Downloads go through /api/files/[key] with an HMAC signature and expiry (PRD §12).
 */

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // stays under the 4.5 MB function body limit

function root() {
  // turbopackIgnore: the upload folder is runtime data, not part of the build output.
  return path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./storage");
}

function safePath(key: string) {
  if (!/^[A-Za-z0-9_-]+(\.[A-Za-z0-9]{1,8})?$/.test(key)) throw new Error("Bad storage key");
  return path.join(/*turbopackIgnore: true*/ root(), key);
}

export async function putFile(file: File): Promise<{ key: string; size: number }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 4 MB. Share a link instead.");
  const ext = (file.name.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? "bin").toLowerCase();
  const key = `${randomToken(18)}.${ext}`;
  await mkdir(/*turbopackIgnore: true*/ root(), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ safePath(key), Buffer.from(await file.arrayBuffer()));
  return { key, size: file.size };
}

export async function getFile(key: string): Promise<Buffer | null> {
  try {
    const p = safePath(key);
    await stat(/*turbopackIgnore: true*/ p);
    return await readFile(/*turbopackIgnore: true*/ p);
  } catch {
    return null;
  }
}

/** A link valid for `ttlSeconds` (default 1 hour). */
export function signedFileUrl(key: string, fileName: string, ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = sign(`${key}:${exp}`);
  const q = new URLSearchParams({ exp: String(exp), sig, name: fileName });
  return `/api/files/${key}?${q.toString()}`;
}

export function verifyFileSignature(key: string, exp: string, sig: string): boolean {
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return verify(`${key}:${exp}`, sig);
}
