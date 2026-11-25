import { Marked } from "marked";

/**
 * Markdown → HTML for documents. Raw HTML in the source is escaped (not rendered), so a
 * document can never inject scripts into the client's browser.
 */
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const md = new Marked({ gfm: true, breaks: true });
md.use({
  renderer: {
    html({ text }) {
      return escape(text);
    },
    link({ href, text }) {
      const safe = /^(https?:|mailto:|tel:|\/)/i.test(href) ? href : "#";
      return `<a href="${escape(safe)}" target="_blank" rel="noreferrer noopener">${text}</a>`;
    },
  },
});

export function renderMarkdown(src: string): string {
  return md.parse(src, { async: false }) as string;
}
