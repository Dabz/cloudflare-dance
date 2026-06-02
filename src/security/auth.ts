import {hc} from "hono/client";
import type {AppType} from "../../worker";
import type { Player, PlayerIdentity } from "../../worker/model/player";

let cachedIdentity: PlayerIdentity;
export async function getPlayerIdentity() {
  if (cachedIdentity) { return cachedIdentity; }

  const client = hc<AppType>('/')
  const meRes = await client.api.me.$get();
  if (!meRes.ok) {
    throw new Error("Server failed to return credentials");
  }
  const meResJson = await meRes.json()
  cachedIdentity = {
    id: meResJson.id,
    displayName: meResJson.displayName,
  };
  return cachedIdentity;
}

export async function getPlayerInformationInRoom(roomId: string, displayName?: string): Promise<Player> {
  const meUrl = new URL(`/api/room/${roomId}/me`, window.location.origin);
  if (displayName) {
    meUrl.searchParams.set("displayName", displayName);
  }

  const meRes = await fetch(meUrl);
  if (!meRes.ok) {
    throw new Error("Server failed to return credentials");
  }
  const player = await meRes.json();
  return player;
}
