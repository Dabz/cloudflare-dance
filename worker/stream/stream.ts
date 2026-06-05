import { env } from "cloudflare:workers";

export default {
  listStreams: async function(): Promise<string[]> {
    const list = await env.STREAM.videos.list();
    if (!list || list.length == 0) return [];
    return list.map((v) => v.meta["name"])
  }
}
