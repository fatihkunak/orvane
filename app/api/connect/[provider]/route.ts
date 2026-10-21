import { startConnect } from "@/lib/social/oauth-flow";

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  return startConnect(req, (await params).provider);
}
