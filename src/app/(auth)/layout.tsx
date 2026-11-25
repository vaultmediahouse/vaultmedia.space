export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-lg font-semibold tracking-tight text-white">Vault Media House</div>
          <div className="text-sm text-gold">Client Work &amp; Billing Portal</div>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-xl">{children}</div>
      </div>
    </div>
  );
}
