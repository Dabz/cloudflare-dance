import {Context} from "hono";
import type { PlayerIdentity } from "./model/player";
import CONST from "./const"

const UNKNOWN_DISPLAY_NAME = "UNKNOWN";
const MAX_DISPLAY_NAME_LENGTH = 40;


export function getUser(c: Context | Headers) {
  const CFUserHeaderName = "Cf-Access-Authenticated-User-Email";
  if (c instanceof Headers) {
    return c.get(CFUserHeaderName) || UNKNOWN_DISPLAY_NAME;
  } else if (c instanceof Context) {
    return c.req.header(CFUserHeaderName) || UNKNOWN_DISPLAY_NAME;
  }
}

export function getDisplayName(c: Context | Headers): string {
  return getUser(c) || UNKNOWN_DISPLAY_NAME;
}

export function sanitizeDisplayName(displayName: string | undefined | null): string | undefined {
  const sanitizedDisplayName = displayName?.trim().replace(/\s+/g, " ").slice(0, MAX_DISPLAY_NAME_LENGTH);
  return sanitizedDisplayName || undefined;
}

export function getDisplayNameOverride(url: string): string | undefined {
  return sanitizeDisplayName(new URL(url).searchParams.get("displayName"));
}

export function getReconnect(url: string): string | undefined {
  return sanitizeDisplayName(new URL(url).searchParams.get("reconnect"));
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

export function getPlayerIdentity(headers: Headers, displayNameOverride?: string): PlayerIdentity {
  const displayName = getDisplayName(headers);
  return {
    id: getPlayerId(headers) || createPlayerId(),
    displayName: displayName === UNKNOWN_DISPLAY_NAME && displayNameOverride ? displayNameOverride : displayName,
  };
}

export function getColo(cf: unknown): string {
  if (cf && typeof cf === "object" && "colo" in cf) {
    const { colo } = cf as { colo?: unknown };
    return typeof colo === "string" ? colo : "UNKNOWN";
  }

  return UNKNOWN_DISPLAY_NAME;
}
