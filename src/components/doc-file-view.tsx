import type { Document } from "@/db/schema";
import { signedFileUrl } from "@/lib/storage";

/** Shows an uploaded document file (D-021): PDFs inline, Word files as a download. Links are signed and expire. */
export function DocFileView({ doc }: { doc: Document }) {
  if (!doc.fileKey) return <p className="text-sm text-muted">No file uploaded yet.</p>;
  const url = signedFileUrl(doc.fileKey, doc.fileName ?? "document");
  const isPdf = doc.fileMime === "application/pdf";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 p-3 text-sm">
        <span className="break-all font-medium">{doc.fileName}</span>
        <a href={url} target="_blank" rel="noreferrer" className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white">
          {isPdf ? "Open PDF" : "Download"}
        </a>
      </div>
      {isPdf ? (
        <iframe src={url} title={doc.title} className="h-[75vh] w-full rounded-md border border-border bg-white" />
      ) : (
        <p className="text-sm text-muted">This is a Word file. Download it to read it, then come back here to accept.</p>
      )}
    </div>
  );
}
