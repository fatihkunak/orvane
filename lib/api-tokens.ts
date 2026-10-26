import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Personal access tokens for the MCP endpoint. A token is 32 random bytes, shown ONCE at creation. Only its SHA-256 is stored,
 * so a database leak does not leak usable tokens (they are long and random, so a plain hash is enough, no slow KDF needed).
 */
export const TOKEN_PREFIX = "orv_";
export const MAX_ACTIVE_TOKENS = 10;
/** `lastUsedAt` is written at most this often, so a busy client does not write on every call */
const LAST_USED_GRANULARITY_MS = 60_000;

/** `orv_` + 32 random bytes as base64url (43 characters, no padding): the only shape a real token can have. */
const TOKEN_SHAPE = /^orv_[A-Za-z0-9_-]{43}$/;
/** Cheap, database-free check, so junk presented as a token never costs a query. */
export const looksLikeToken = (presented: string) => TOKEN_SHAPE.test(presented);

export const hashToken =(token: string) => createHash("sha256").update(token).digest("hex");

export interface ApiTokenView {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export class TokenError extends Error {}

export async function createApiToken(userId: string, rawName: string): Promise<{ token: string; view: ApiTokenView }> {
  const name = rawName.trim().slice(0, 60);
  if (!name) throw new TokenError("Belirtece bir ad ver");
  const active = await prisma.apiToken.count({ where: { userId, revokedAt: null } });
  if (active >= MAX_ACTIVE_TOKENS) throw new TokenError(`En fazla ${MAX_ACTIVE_TOKENS} etkin belirteç olabilir; birini iptal et`);

  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const row = await prisma.apiToken.create({
    data: { userId, name, tokenHash: hashToken(token), prefix: token.slice(0, TOKEN_PREFIX.length + 4) },
  });
  return { token, view: { id: row.id, name: row.name, prefix: row.prefix, createdAt: row.createdAt, lastUsedAt: null } };
}

export async function listApiTokens(userId: string): Promise<ApiTokenView[]> {
  const rows = await prisma.apiToken.findMany({ where: { userId, revokedAt: null }, orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt }));
}

export async function revokeApiToken(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.apiToken.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  return count === 1;
}

/** The user a presented token belongs to, or null (unknown, revoked, or the user is suspended). */
export async function verifyApiToken(presented: string, now = new Date()): Promise<{ userId: string; tokenId: string } | null> {
  if (!looksLikeToken(presented)) return null;
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(presented) },
    select: { id: true, userId: true, revokedAt: true, lastUsedAt: true, user: { select: { suspendedAt: true } } },
  });
  if (!row || row.revokedAt || row.user.suspendedAt) return null;
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_GRANULARITY_MS) {
    await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: now } });
  }
  return { userId: row.userId, tokenId: row.id };
}
