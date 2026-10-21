import { finishConnect } from "@/lib/social/oauth-flow";

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  return finishConnect(req, (await params).provider);
}
