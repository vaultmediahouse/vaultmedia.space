import "server-only";
import path from "node:path";
import { Document as PDFDocument, Font, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { marked, type Token, type Tokens } from "marked";
import type { Client, Document, Invoice, InvoiceLine } from "@/db/schema";
import type { AppSettings } from "@/lib/settings";
import { formatINR } from "@/lib/money";
import { formatISTDate, formatISTDateTime } from "@/lib/week";

/**
 * PDF generation with @react-pdf/renderer (pure Node, no headless browser — works on serverless).
 * Text uses built-in Helvetica. Helvetica has no ₹ glyph, so a small Noto Sans (latin-ext subset, SIL OFL,
 * files in src/server/fonts) is registered as a per-glyph fallback: react-pdf takes each character from the
 * first font in the stack that has it (D-018). Bold/italic are set with fontWeight/fontStyle so both fonts
 * switch together.
 */
const FONT_DIR = path.join(process.cwd(), "src/server/fonts");
Font.register({
  family: "NotoRupee",
  fonts: [
    { src: path.join(FONT_DIR, "noto-sans-latin-ext-400-normal.woff"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "noto-sans-latin-ext-700-normal.woff"), fontWeight: 700 },
    { src: path.join(FONT_DIR, "noto-sans-latin-ext-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
  ],
});
Font.registerHyphenationCallback((word) => [word]);
const FONT = ["Helvetica", "NotoRupee"];

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: FONT, color: "#0f172a", lineHeight: 1.45 },
  brand: { fontSize: 16, fontWeight: 700 },
  gold: { color: "#b8913a" },
  muted: { color: "#64748b" },
  row: { flexDirection: "row" },
  h1: { fontSize: 15, fontWeight: 700, marginBottom: 8 },
  h2: { fontSize: 12, fontWeight: 700, marginTop: 12, marginBottom: 4 },
  h3: { fontSize: 10.5, fontWeight: 700, marginTop: 8, marginBottom: 3 },
  p: { marginBottom: 5 },
  th: { fontWeight: 700, backgroundColor: "#f1f5f9" },
  cell: { padding: 4, borderBottomWidth: 0.5, borderColor: "#cbd5e1" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: "#94a3b8", textAlign: "center" },
});

export async function invoicePdf(inv: Invoice, lines: InvoiceLine[], client: Client, settings: AppSettings) {
  const col = [0.55, 0.1, 0.15, 0.2];
  return renderToBuffer(
    <PDFDocument title={`Invoice ${inv.number}`} author={settings.businessName}>
      <Page size="A4" style={s.page}>
        <View style={[s.row, { justifyContent: "space-between", marginBottom: 24 }]}>
          <View>
            <Text style={s.brand}>{settings.businessName}</Text>
            {settings.businessAddress ? <Text style={s.muted}>{settings.businessAddress}</Text> : null}
            {settings.gstEnabled && settings.gstin ? <Text style={s.muted}>GSTIN: {settings.gstin}</Text> : null}
            {settings.businessEmail ? <Text style={s.muted}>{settings.businessEmail} {settings.businessPhone}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[s.h1, s.gold]}>{settings.gstEnabled ? "TAX INVOICE" : "INVOICE"}</Text>
            <Text>No. {inv.number}</Text>
            <Text>Date: {formatISTDate(inv.issuedAt)}</Text>
            <Text>Due: {formatISTDate(inv.dueDate)}</Text>
          </View>
        </View>
        <View style={{ marginBottom: 16 }}>
          <Text style={s.muted}>Bill to</Text>
          <Text style={{ fontWeight: 700 }}>{client.company}</Text>
          {client.address ? <Text>{[client.address, client.city].filter(Boolean).join(", ")}</Text> : null}
          {client.gstNo ? <Text>GST no.: {client.gstNo}</Text> : null}
          <Text style={[s.muted, { marginTop: 4 }]}>Work period: {formatISTDate(inv.weekStart)} – {formatISTDate(inv.weekEnd)}</Text>
        </View>
        <View>
          <View style={[s.row, s.th]}>
            {["Description", "Qty", "Rate", "Amount"].map((h, i) => (
              <Text key={h} style={[s.cell, { width: `${col[i] * 100}%`, textAlign: i ? "right" : "left" }]}>{h}</Text>
            ))}
          </View>
          {lines.map((l) => (
            <View key={l.id} style={s.row} wrap={false}>
              <Text style={[s.cell, { width: "55%" }]}>{l.description}</Text>
              <Text style={[s.cell, { width: "10%", textAlign: "right" }]}>{l.qty}</Text>
              <Text style={[s.cell, { width: "15%", textAlign: "right" }]}>{formatINR(l.rate, { decimals: true })}</Text>
              <Text style={[s.cell, { width: "20%", textAlign: "right" }]}>{formatINR(l.amount, { decimals: true })}</Text>
            </View>
          ))}
          <View style={{ alignItems: "flex-end", marginTop: 8 }}>
            <Text>Subtotal: {formatINR(inv.subtotal, { decimals: true })}</Text>
            {inv.taxRateBps > 0 ? <Text>GST {inv.taxRateBps / 100}%: {formatINR(inv.tax, { decimals: true })}</Text> : null}
            <Text style={{ fontWeight: 700, fontSize: 12, marginTop: 4 }}>Total: {formatINR(inv.total, { decimals: true })}</Text>
          </View>
        </View>
        <View style={{ marginTop: 24 }}>
          <Text style={s.h3}>How to pay</Text>
          {settings.upiId ? <Text>UPI: {settings.upiId}</Text> : null}
          {settings.bankDetails ? <Text>{settings.bankDetails}</Text> : null}
          <Text style={[s.muted, { marginTop: 6 }]}>Please pay within {settings.paymentWindowDays} days and add the payment reference (UTR) in the client portal. Only work approved by both parties and accepted on delivery, and qualified leads, are billed.</Text>
          {inv.status === "paid" ? <Text style={{ marginTop: 8, color: "#047857", fontWeight: 700 }}>PAID {inv.paidAt ? formatISTDate(inv.paidAt) : ""} {inv.paymentRef ? `· Ref ${inv.paymentRef}` : ""}</Text> : null}
        </View>
        <Text style={s.footer} fixed>{settings.businessName} · Generated by the client portal</Text>
      </Page>
    </PDFDocument>,
  );
}

// ---------------------------------------------------------------------------
// Markdown document → PDF
// ---------------------------------------------------------------------------

function inline(tokens: Token[] | undefined, key = "i"): React.ReactNode[] {
  if (!tokens) return [];
  return tokens.map((t, i) => {
    const k = `${key}-${i}`;
    if (t.type === "strong") return <Text key={k} style={{ fontWeight: 700 }}>{inline((t as Tokens.Strong).tokens, k)}</Text>;
    if (t.type === "em") return <Text key={k} style={{ fontStyle: "italic" }}>{inline((t as Tokens.Em).tokens, k)}</Text>;
    if (t.type === "br") return "\n";
    if ("tokens" in t && t.tokens) return <Text key={k}>{inline(t.tokens as Token[], k)}</Text>;
    return decode((t as { text?: string }).text ?? t.raw);
  });
}

const decode = (x: string) => x.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function block(t: Token, i: number): React.ReactNode {
  switch (t.type) {
    case "heading": {
      const h = t as Tokens.Heading;
      return <Text key={i} style={h.depth === 1 ? s.h1 : h.depth === 2 ? s.h2 : s.h3}>{inline(h.tokens)}</Text>;
    }
    case "paragraph":
      return <Text key={i} style={s.p}>{inline((t as Tokens.Paragraph).tokens)}</Text>;
    case "list": {
      const l = t as Tokens.List;
      return (
        <View key={i} style={{ marginBottom: 5 }}>
          {l.items.map((it, j) => (
            <View key={j} style={s.row}>
              <Text style={{ width: 16 }}>{l.ordered ? `${Number(l.start || 1) + j}.` : "•"}</Text>
              <Text style={{ flex: 1 }}>{inline(it.tokens.flatMap((x) => ("tokens" in x && x.tokens ? (x.tokens as Token[]) : [x])))}</Text>
            </View>
          ))}
        </View>
      );
    }
    case "table": {
      const tb = t as Tokens.Table;
      const w = `${100 / tb.header.length}%`;
      return (
        <View key={i} style={{ marginVertical: 6 }}>
          <View style={[s.row, s.th]}>{tb.header.map((h, j) => <Text key={j} style={[s.cell, { width: w }]}>{inline(h.tokens)}</Text>)}</View>
          {tb.rows.map((r, j) => (
            <View key={j} style={s.row} wrap={false}>{r.map((c, k) => <Text key={k} style={[s.cell, { width: w }]}>{inline(c.tokens)}</Text>)}</View>
          ))}
        </View>
      );
    }
    case "hr":
      return <View key={i} style={{ borderBottomWidth: 0.5, borderColor: "#cbd5e1", marginVertical: 10 }} />;
    case "space":
      return null;
    default:
      return <Text key={i} style={s.p}>{decode((t as { text?: string }).text ?? t.raw)}</Text>;
  }
}

export async function documentPdf(doc: Document, client: Client, settings: AppSettings) {
  const tokens = marked.lexer(doc.content, { gfm: true });
  return renderToBuffer(
    <PDFDocument title={doc.title} author={settings.businessName}>
      <Page size="A4" style={s.page}>
        <Text style={[s.muted, { fontSize: 8, marginBottom: 12 }]}>{settings.businessName} · {client.company} · Version {doc.version}</Text>
        {tokens.map(block)}
        {doc.acceptedAt ? (
          <View style={{ marginTop: 20, padding: 10, borderWidth: 0.5, borderColor: "#10b981" }} wrap={false}>
            <Text style={{ fontWeight: 700, color: "#047857" }}>Accepted electronically</Text>
            <Text>Signed by: {doc.acceptedName}</Text>
            <Text>Date and time: {formatISTDateTime(doc.acceptedAt)} IST</Text>
            <Text>IP address: {doc.acceptedIp}</Text>
          </View>
        ) : null}
        <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `${doc.title} · page ${pageNumber} of ${totalPages}`} />
      </Page>
    </PDFDocument>,
  );
}
