"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/actions/auth";
import { Button, Input, Label } from "@/components/ui";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="current">Current (temporary) password</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <Label htmlFor="password" hint="(min. 10 characters, letters + a number)">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </div>
      <div>
        <Label htmlFor="confirm">Repeat new password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-700">{state.message}</p>}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Saving…" : "Save password"}</Button>
    </form>
  );
}
