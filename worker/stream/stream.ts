import { env } from "cloudflare:workers";
import type { StreamVideo } from "../model/streams";

export default {
  listStreams: async function(): Promise<StreamVideo[]> {
    const list = await env.STREAM.videos.list();
    if (!list || list.length == 0) return [];
    return list.map((stream) => { return ({
      id: stream.id,
      thumbnail: stream.thumbnail,
      readyToStream: stream.readyToStream,
      meta: stream.meta,
      size: stream.size,
      preview: stream.preview,
      duration: stream.duration,
      hlsPlaybackUrl: stream.hlsPlaybackUrl
    } as StreamVideo);});
  }
}
