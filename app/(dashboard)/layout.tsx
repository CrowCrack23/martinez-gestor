import { redirect } from "next/navigation";
import { requireUser, signOut } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";

async function signOutAction() {
  "use server";
  await signOut();
  redirect("/login");
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-dvh">
      <Sidebar user={user} signOutAction={signOutAction} />
      <main className="flex-1 min-w-0 bg-background">
        <div className="p-6 max-w-[1400px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
