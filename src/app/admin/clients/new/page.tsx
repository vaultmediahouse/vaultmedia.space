import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ClientFields } from "@/components/client-fields";
import { Card, PageHeader } from "@/components/ui";
import { createClientAction } from "@/actions/admin";

export const metadata: Metadata = { title: "Add client" };

export default function NewClientPage() {
  return (
    <>
      <PageHeader title="Add client" subtitle="The client gets the default rate card; you can change it on the next screen, then create their login." />
      <Card className="max-w-3xl">
        <ActionForm action={createClientAction} className="space-y-4">
          <ClientFields />
          <SubmitButton>Create client</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
