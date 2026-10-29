import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";
import { inngestRequestAllowed } from "@/lib/inngest-guard";

// Inngest calls this endpoint to discover the functions and to execute their steps
const handlers = serve({ client: inngest, functions });

type Handler = typeof handlers.GET;

// Unsigned (dev mode) requests are only taken from the local Dev Server, never through the tunnel
const guarded =
  (handler: Handler): Handler =>
  (...args) =>
    inngestRequestAllowed(args[0].headers) ? handler(...args) : Promise.resolve(new Response("Not found", { status: 404 }));

export const GET = guarded(handlers.GET);
export const POST = guarded(handlers.POST);
export const PUT = guarded(handlers.PUT);
