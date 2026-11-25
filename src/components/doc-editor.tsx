"use client";

import { useActionState, useMemo, useState } from "react";
import { documentAction, saveTemplateAction } from "@/actions/documents";
import { renderMarkdown } from "@/lib/markdown";
import { Button, Input } from "./ui";
import { FormMessage } from "./action-form";

/** Markdown editor with live preview, used for documents and templates. */
export function DocEditor({
  mode,
  id,
  title,
  content,
  locked,
  variables,
}: {
  mode: "document" | "template";
  id: string;
  title: string;
  content: string;
  locked?: boolean;
  variables?: { key: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(mode === "document" ? documentAction : saveTemplateAction, {});
  const [text, setText] = useState(content);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const html = useMemo(() => renderMarkdown(text), [text]);
  const missing = useMemo(() => [...new Set([...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]))], [text]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      {mode === "document" && <input type="hidden" name="op" value="save" />}
      <Input name={mode === "document" ? "title" : "name"} defaultValue={title} required aria-label="Title" />
      <div className="flex gap-1 text-sm lg:hidden">
        <button type="button" onClick={() => setTab("edit")} className={`rounded px-3 py-1 ${tab === "edit" ? "bg-ink text-white" : "bg-white"}`}>Edit</button>
        <button type="button" onClick={() => setTab("preview")} className={`rounded px-3 py-1 ${tab === "preview" ? "bg-ink text-white" : "bg-white"}`}>Preview</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <textarea
          name={mode === "document" ? "content" : "body"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={28}
          spellCheck
          className={`${tab === "preview" ? "hidden" : ""} w-full rounded-md border border-border bg-white p-3 font-mono text-[13px] leading-relaxed lg:block`}
        />
        <div className={`${tab === "edit" ? "hidden" : ""} prose-doc max-h-[42rem] overflow-y-auto rounded-md border border-border bg-white p-5 lg:block`} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      {missing.length > 0 && mode === "document" && (
        <p className="text-sm text-amber-700">Still to fill: {missing.map((m) => `{{${m}}}`).join(", ")}. Fill them in the text, or add agency details in Settings and recreate.</p>
      )}
      {variables && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Available variables</summary>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">{variables.map((v) => <code key={v.key}>{`{{${v.key}}}`} — {v.label}</code>)}</div>
        </details>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : locked ? "Save as new version" : mode === "document" ? "Save draft" : "Save template"}</Button>
        <span className="text-xs text-muted">Markdown: # heading, **bold**, - list, | table |</span>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
