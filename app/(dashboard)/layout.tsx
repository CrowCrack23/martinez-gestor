import { redirect } from "next/navigation";
import { requireUser, signOut } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";

async function signOutAction() {
  "use server";
  await signOut();
  redirect("/login");
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <DashboardShell user={user} signOutAction={signOutAction}>
      {children}
    </DashboardShell>
  );
}
