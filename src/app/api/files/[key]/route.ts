import { getFile, verifyFileSignature } from "@/lib/storage";

/** Signed, expiring download links (PRD §12). Links are created by signedFileUrl(). */
export async function GET(req: Request, ctx: RouteContext<"/api/files/[key]">) {
  const { key } = await ctx.params;
  const url = new URL(req.url);
  if (!verifyFileSignature(key, url.searchParams.get("exp") ?? "", url.searchParams.get("sig") ?? "")) {
    return new Response("This link has expired. Reload the page to get a fresh one.", { status: 403 });
  }
  const file = await getFile(key);
  if (!file) return new Response("Not found", { status: 404 });
  const name = (url.searchParams.get("name") ?? key).replace(/[^\w.\- ]/g, "_");
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const types: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", pdf: "application/pdf" };
  const inline = ext in types;
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": types[ext] ?? "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
