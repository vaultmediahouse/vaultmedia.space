import { requireAdmin } from "@/lib/auth";
import { Shell, ADMIN_NAV } from "@/components/shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <Shell user={user} nav={ADMIN_NAV}>
      {children}
    </Shell>
  );
}
