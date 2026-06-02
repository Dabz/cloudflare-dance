import { Hono } from "hono";
import { env } from "cloudflare:workers";
import { getUser, getColo } from "./auth";
import mds from "./mds";
import type { Room } from "./model/room";


const app = new Hono<{ Bindings: typeof env }>().basePath("/api");

export type RoomListResponse = {
  rooms: Room[];
  location: string;
  roomsInLocation: Room[];
  roomsOutsideLocation: Room[];
};

export type RoomUpsertResponse = {
  room: Room;
  created: boolean;
};

export type MeResponse = {
  location: string;
  user: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const route = app
  .get("/me", (c) => {
    const cf = c.req.raw.cf;
    const colo = getColo(cf);
    const user = getUser(c);

    return c.json({
      location: colo,
      user: user,
    } as MeResponse);
  })
  .get("/room/:id", async (c) => {
    const { id } = c.req.param();
    const gameroomStub = c.env.GAME_ROOM.getByName(id);
    const count = await gameroomStub.get_active_users_count();
    return c.json({
      room: id,
      user_count: count,
    });
  })
  .get("/room", async (c) => {
    const rooms = await mds.list_rooms();
    const colo = getColo(c.req.raw.cf);
    const roomsColo = rooms.filter((r) => r.LOCATION == colo);
    const roomsNotInColo = rooms.filter((r) => r.LOCATION !== colo);

    const res: RoomListResponse = {
      rooms: rooms,
      location: colo,
      roomsInLocation: roomsColo,
      roomsOutsideLocation: roomsNotInColo,
    };

    return c.json(res);
  })
  .post("/room/:loc", async (c) => {
    const { loc } = c.req.param();
    const existingRooms = await mds.get_rooms_in_loc(loc);
    let room: Room;
    let created = false;

    for (const existingRoom of existingRooms) {
      if (existingRoom.PLAYER_COUNT < 100) {
        room = existingRoom;
        break;
      }
    }

    if (!room) {
      room = await mds.upsert_room(loc, loc);
      created = true;
    }

    const res: RoomUpsertResponse = {
      room: room,
      created: created,
    };

    return c.json(res);
  })
  .get("/", (c) => {
    return c.json({
      hello: "world",
    });
  });

export default {
  fetch: async (r: Request, e: Env) => {
    const url = new URL(r.url);
    
    if (url.pathname.startsWith('/ws')) {
      if (url.pathname.startsWith('/ws/room/')) {
        if (r.headers.get("upgrade") !== "websocket") {
          return new Response("Expected Upgrade: websocket", { status: 426 });
        }
        const roomId = url.pathname.split('/').at(-1);
        const stub = e.GAME_ROOM.getByName(roomId)
        return await stub.fetch(r);
      }
    }

    return app.fetch(r, e);
  },
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    switch (controller.cron) {
      case "*/5 * * * *": {
         ctx.waitUntil(scheduled_clean_rooms(env, ctx))
      }
    }
  },
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function scheduled_clean_rooms(env: Env, ctx: ExecutionContext) {
  const rooms = await mds.list_rooms();
  for (const room of rooms) {
    const gameRoom = env.GAME_ROOM.getByName(room.ID);
    await gameRoom.delete_old_sessions();
  }
  mds.delete_old_empty_rooms();
}

export { GameRoom } from "./durable/gameroom";
export type AppType = typeof route;
