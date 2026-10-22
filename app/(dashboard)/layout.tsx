import { redirect } from "next/navigation";
import { authState, signOut } from "@/auth";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getTopbarData } from "@/lib/queries/notifications";

/**
 * Shell for every signed-in page: sidebar (lg+), topbar, bottom nav (< lg).
 * proxy.ts already redirects anonymous visitors; this check is the real guard,
 * since the proxy cannot read the database.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, suspended } = await authState();
  // The proxy still sees the cookie, so sending a suspended user to /login would bounce them back here
  if (suspended) redirect("/suspended");
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const { notifications, hasFailure } = await getTopbarData(userId);

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={session.user} notifications={notifications} hasFailure={hasFailure} signOutAction={signOutAction} />
        {/* pb-28 keeps content clear of the fixed bottom bar on mobile */}
        <main className="flex-1 px-4 py-6 pb-28 sm:px-6 lg:pb-8">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
