import { auth } from "@/auth";
import { AnalyticsView } from "@/components/analytics/analytics-view";
import { getAnalytics } from "@/lib/queries/analytics";

export const metadata = { title: "Analitik" };

export default async function AnalyticsPage() {
  const session = await auth();
  const data = await getAnalytics(session!.user.id); // layout guarantees a session

  return (
    <div className="mx-auto w-full max-w-5xl">
      <AnalyticsView data={data} />
    </div>
  );
}
