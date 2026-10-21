import { auth } from "@/auth";
import { CalendarView } from "@/components/calendar/calendar-view";
import { listDatedPosts } from "@/lib/queries/posts";

export const metadata = { title: "Takvim" };

export default async function CalendarPage() {
  const session = await auth();
  const posts = await listDatedPosts(session!.user.id); // layout guarantees a session

  return (
    <div className="mx-auto w-full max-w-6xl">
      <CalendarView posts={posts} />
    </div>
  );
}
