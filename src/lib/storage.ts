import "server-only";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { get as blobGet, put as blobPut } from "@vercel/blob";
import { randomToken, sign, verify } from "./crypto";

/**
 * File storage for brief/deliverable uploads and signed PDFs.
 *
 * Two drivers, chosen at runtime:
 * - **Vercel Blob (private)** when `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` is set — used on
 *   Vercel, where the local disk is not persistent. Connecting a Blob store to the Vercel project
 *   sets these automatically (OIDC + BLOB_STORE_ID for new stores).
 * - **Local disk** (`STORAGE_DIR`, default ./storage) otherwise — local dev and VPS hosting.
 *
 * The rest of the app only sees opaque storage keys. Files are never served from Blob URLs
 * directly: downloads go through /api/files/[key] with an HMAC signature and expiry (PRD §12),
 * which streams the private blob server-side. See docs/DECISIONS.md D-011, D-013.
 */

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // stays under the 4.5 MB function body limit

const BLOB_PREFIX = "vmh-uploads/";

export function storageDriver(): "blob" | "local" {
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID ? "blob" : "local";
}

function root() {
  // turbopackIgnore: the upload folder is runtime data, not part of the build output.
  return path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./storage");
}

const KEY_RE = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9]{1,8})?$/;

function safePath(key: string) {
  if (!KEY_RE.test(key)) throw new Error("Bad storage key");
  return path.join(/*turbopackIgnore: true*/ root(), key);
}

export async function putFile(file: File): Promise<{ key: string; size: number }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 4 MB. Share a link instead.");
  const ext = (file.name.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? "bin").toLowerCase();
  const key = `${randomToken(18)}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  if (storageDriver() === "blob") {
    await blobPut(BLOB_PREFIX + key, bytes, {
      access: "private",
      addRandomSuffix: false,
      contentType: file.type || "application/octet-stream",
    });
  } else {
    await mkdir(/*turbopackIgnore: true*/ root(), { recursive: true });
    await writeFile(/*turbopackIgnore: true*/ safePath(key), bytes);
  }
  return { key, size: file.size };
}

export async function getFile(key: string): Promise<Buffer | null> {
  if (!KEY_RE.test(key)) return null;
  try {
    if (storageDriver() === "blob") {
      const res = await blobGet(BLOB_PREFIX + key, { access: "private" });
      if (!res || res.statusCode !== 200) return null;
      return Buffer.from(await new Response(res.stream).arrayBuffer());
    }
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
