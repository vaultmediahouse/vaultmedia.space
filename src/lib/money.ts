/** All money in the app is integer paise. These helpers convert for display and input. */

export function formatINR(paise: number, opts: { decimals?: boolean } = {}): string {
  const rupees = paise / 100;
  const showDecimals = opts.decimals ?? paise % 100 !== 0;
  return (
    "₹" +
    rupees.toLocaleString("en-IN", {
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}

/** Same as formatINR but with "Rs." — the built-in PDF fonts have no ₹ glyph. */
export function formatINRPlain(paise: number): string {
  return formatINR(paise, { decimals: true }).replace("₹", "Rs. ");
}

/** Parse a rupee amount typed by a user ("1,200.50") into paise. Returns null if invalid. */
export function rupeesToPaise(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).replace(/[,₹\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function paiseToRupeesInput(paise: number): string {
  return (paise / 100).toString();
}

/** Tax in basis points: 1800 bps = 18%. Rounded to the nearest paisa. */
export function taxFor(subtotal: number, taxRateBps: number): number {
  return Math.round((subtotal * taxRateBps) / 10000);
}
