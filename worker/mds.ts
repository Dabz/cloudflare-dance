import { env } from "cloudflare:workers";
import type {Room} from "./model/room";

export default {
  async upsertRoom(id: string, colo: string): Promise<Room> {
    const now = Date.now();
    const res = await env.CLOUDFLARE_PLEASE_METADATA.prepare(
      `INSERT INTO ROOMS (ID, LOCATION, PLAYER_COUNT, CREATED_AT, LAST_UPDATED_AT) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (ID) DO UPDATE SET LAST_UPDATED_AT = excluded.LAST_UPDATED_AT
      RETURNING *`,
    ).bind(id, colo, 0, now, now)
    .run<Room>();


    return res.results.at(0)
  },

  async listRooms(): Promise<Room[]> {
    const res = await env.CLOUDFLARE_PLEASE_METADATA.prepare(
      `SELECT ID, LOCATION, PLAYER_COUNT, CREATED_AT, LAST_UPDATED_AT
      FROM ROOMS`,
    ).all<Room>();
    return res.results
  },

  async getRoomsInLoc(loc: string): Promise<Room[]> {
    const res = await env.CLOUDFLARE_PLEASE_METADATA.prepare(
      `SELECT ID, LOCATION, PLAYER_COUNT, CREATED_AT, LAST_UPDATED_AT
      FROM ROOMS
      WHERE LOCATION = ?`,
    ).bind(loc).all<Room>();
      return res.results;
  },

  async deleteOldEmptyRooms(): Promise<number> {
    const threshold = Date.now() - (1000 * 60);
    const res = await env.CLOUDFLARE_PLEASE_METADATA.prepare(
      `DELETE FROM ROOMS WHERE PLAYER_COUNT = 0 AND LAST_UPDATED_AT < ?`
    ).bind(threshold).run();
    return res.meta.rows_written;
  }
}
