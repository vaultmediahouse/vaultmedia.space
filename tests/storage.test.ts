import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const store = new Map<string, { bytes: Buffer; opts: Record<string, unknown> }>();
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string, body: Buffer, opts: Record<string, unknown>) => {
    store.set(pathname, { bytes: Buffer.from(body), opts });
    return { pathname, url: `https://blob.test/${pathname}` };
  }),
  get: vi.fn(async (pathname: string) => {
    const hit = store.get(pathname);
    if (!hit) return null;
    return { statusCode: 200, stream: new Blob([new Uint8Array(hit.bytes)]).stream(), headers: new Headers(), blob: {} };
  }),
}));

const env = { ...process.env };
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "vmh-storage-"));
  process.env.STORAGE_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;
  store.clear();
  vi.resetModules();
});
afterEach(async () => {
  process.env = { ...env };
  await rm(dir, { recursive: true, force: true });
});

const file = () => new File([new TextEncoder().encode("hello vault")], "brief.PNG", { type: "image/png" });

describe("storage", () => {
  it("uses local disk without Blob credentials and round-trips", async () => {
    const s = await import("@/lib/storage");
    expect(s.storageDriver()).toBe("local");
    const { key, size } = await s.putFile(file());
    expect(key).toMatch(/\.png$/);
    expect(size).toBe(11);
    expect((await s.getFile(key))?.toString()).toBe("hello vault");
    expect(store.size).toBe(0);
  });

  it("uses private Vercel Blob when a store is configured", async () => {
    process.env.BLOB_STORE_ID = "store_test";
    const s = await import("@/lib/storage");
    expect(s.storageDriver()).toBe("blob");
    const { key } = await s.putFile(file());
    const saved = store.get(`vmh-uploads/${key}`);
    expect(saved?.opts).toMatchObject({ access: "private", addRandomSuffix: false, contentType: "image/png" });
    expect((await s.getFile(key))?.toString()).toBe("hello vault");
    expect(await s.getFile("missing.png")).toBeNull();
  });

  it("rejects unsafe keys and oversize files", async () => {
    const s = await import("@/lib/storage");
    expect(await s.getFile("../../etc/passwd")).toBeNull();
    const big = new File([new Uint8Array(s.MAX_UPLOAD_BYTES + 1)], "big.mp4");
    await expect(s.putFile(big)).rejects.toThrow(/4 MB/);
  });

  it("signed links verify and expire", async () => {
    const s = await import("@/lib/storage");
    const url = new URL("http://x" + s.signedFileUrl("abc.png", "a.png", 60));
    const [exp, sig] = [url.searchParams.get("exp")!, url.searchParams.get("sig")!];
    expect(s.verifyFileSignature("abc.png", exp, sig)).toBe(true);
    expect(s.verifyFileSignature("other.png", exp, sig)).toBe(false);
    expect(s.verifyFileSignature("abc.png", String(Math.floor(Date.now() / 1000) - 1), sig)).toBe(false);
  });
});
