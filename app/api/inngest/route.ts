import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

// Inngest calls this endpoint to discover the functions and to execute their steps
export const { GET, POST, PUT } = serve({ client: inngest, functions });
