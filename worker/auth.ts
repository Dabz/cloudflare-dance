import {Context} from "hono";
import type { PlayerIdentity } from "./model/player";
import CONST from "./const"


export function getUser(c: Context | Headers) {
  const CFUserHeaderName = "Cf-Access-Authenticated-User-Email";
  if (c instanceof Headers) {
    return c.get(CFUserHeaderName) || 'UNKNOWN';
  } else if (c instanceof Context) {
    return c.req.header(CFUserHeaderName) || "UNKNOWN";
  }
}

export function getDisplayName(c: Context | Headers): string {
  return getUser(c) || "UNKNOWN";
}

export function getPlayerId(headers: Headers): string | undefined {
  const cookieHeader = headers.get("Cookie");
  if (!cookieHeader) return undefined;

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name === CONST.PLAYER_ID_COOKIE) {
      return decodeURIComponent(valueParts.join("="));
    }
  }
}

export function createPlayerId(): string {
  return crypto.randomUUID();
}

export function createPlayerIdCookie(playerId: string): string {
  return `${CONST.PLAYER_ID_COOKIE}=${encodeURIComponent(playerId)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function getPlayerIdentity(headers: Headers): PlayerIdentity {
  return {
    id: getPlayerId(headers) || createPlayerId(),
    displayName: getDisplayName(headers),
  };
}

export function getColo(cf: unknown): string {
  if (cf && typeof cf === "object" && "colo" in cf) {
    const { colo } = cf as { colo?: unknown };
    return typeof colo === "string" ? colo : "UNKNOWN";
  }

  return "UNKNOWN";
}
