import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ChangePasswordForm } from "./form";

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const user = await requireUser({ allowTempPassword: true });
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">{user.mustChangePassword ? "Set your own password" : "Change password"}</h1>
      <p className="mb-5 text-sm text-muted">
        {user.mustChangePassword
          ? "You signed in with a temporary password. Choose a new one to continue."
          : "At least 10 characters, with letters and a number."}
      </p>
      <ChangePasswordForm />
      {!user.mustChangePassword && (
        <Link href="/" className="mt-4 block text-center text-sm text-muted hover:underline">Back</Link>
      )}
    </>
  );
}
