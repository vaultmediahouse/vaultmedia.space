/**
 * Public base URL for links in messages (credentials, share links, emails).
 * APP_URL wins; on Vercel it falls back to the production domain Vercel provides.
 */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
