import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { companyInbox } from "@/lib/communications";

export default function CompanyInboxPage() {
  return (
    <>
      <PageHeader
        icon={companyInbox.icon}
        title={companyInbox.name}
        description={companyInbox.description}
      />

      <div className="p-6 md:p-8">
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <Inbox className="size-8 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium text-foreground">
            No mailbox connected yet
          </p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Once the company email account is connected, incoming messages will
            appear here.
          </p>
        </div>
      </div>
    </>
  );
}
