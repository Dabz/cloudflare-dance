import {hc} from "hono/client";
import type {AppType} from "../worker";
import type { StreamVideo } from "../worker/model/streams";

let cachedVideos: StreamVideo[] = [];
export async function listStreams(): Promise<StreamVideo[]> {
  if (cachedVideos && cachedVideos.length > 0 ) { return cachedVideos; }

  const client = hc<AppType>('/')
  const meRes = await client.api.streams.$get();
  if (!meRes.ok) {
    throw new Error("Server failed to return credentials");
  }
  const meResJson = await meRes.json()
  cachedVideos = meResJson;
  return cachedVideos;
}
