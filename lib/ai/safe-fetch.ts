import dns from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
import { allowPrivateUrls, isPrivateIp } from "@/lib/ai/security";

/**
 * `assertSafeBaseUrl` resolves the name once, when the setting is saved or used. A hostile DNS server can answer with a public
 * address then and an internal one when `fetch` connects a moment later (DNS rebinding). This closes that gap: the address
 * is checked by the connection itself, on the very lookup the socket is opened with, so what was checked is what is connected to.
 *
 * It uses undici's own `fetch` together with its own `Agent`: handing an Agent from one undici version to the `fetch` built into
 * Node, which bundles another, is not a supported pairing.
 */

type LookupCallback = (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;

function guardedLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    if (addresses.some((a) => isPrivateIp(a.address))) {
      const blocked = new Error(`${hostname} iç ağa çözümleniyor, bağlantı engellendi`) as NodeJS.ErrnoException;
      blocked.code = "ESSRF";
      return callback(blocked);
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0]!.address, addresses[0]!.family);
  });
}

let agent: Agent | undefined;
const guardedAgent = () => (agent ??= new Agent({ connect: { lookup: guardedLookup as never } }));

/**
 * Drop-in for `fetch` for calls to addresses a user typed. With `ALLOW_PRIVATE_LLM_URLS=1` (local Ollama and the like) it is
 * the ordinary `fetch`, because reaching a private address is the point there.
 */
export function guardedFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  if (allowPrivateUrls()) return fetch(url, init);
  return undiciFetch(url as never, { ...init, dispatcher: guardedAgent() } as never) as unknown as Promise<Response>;
}
