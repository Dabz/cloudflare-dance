import { Hono } from "hono"
import { env } from "cloudflare:workers";
import { createPlayerIdCookie, getLocation, getDisplayNameOverride, getPlayerId, getPlayerIdentity } from "./auth";
import mds from "./mds";
import type { Room } from "./model/room";
import type {Player} from "./model/player";
import type {Chat} from "./model/chat";
import stream from "./stream/stream";


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

export type RoomCreateErrorResponse = {
  error: string;
};

export type MeResponse = {
  location: string;
  id: string;
  displayName: string;
}

export type PlayerCountResponse = {
  playerCount: number;
}

export type ChatHistoryResponse = {
  chats: Chat[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const route = app
  .get("/me", (c) => {
    const cf = c.req.raw.cf;
    const colo = getLocation(cf);
    const existingPlayerId = getPlayerId(c.req.raw.headers);
    const identity = getPlayerIdentity(c.req.raw.headers);

    if (!existingPlayerId) {
      c.header("Set-Cookie", createPlayerIdCookie(identity.id));
    }

    return c.json({
      location: colo,
      id: identity.id,
      displayName: identity.displayName,
    } as MeResponse);
  })
  .get("/room/:id/me", async (c) => {
    const { id } = c.req.param();
    const existingPlayerId = getPlayerId(c.req.raw.headers);
    const identity = getPlayerIdentity(c.req.raw.headers, getDisplayNameOverride(c.req.url));

    if (!existingPlayerId) {
      c.header("Set-Cookie", createPlayerIdCookie(identity.id));
    }
    const gameroomStub = c.env.GAME_ROOM.getByName(id);
    const me = await gameroomStub.getSession(identity.id, identity.displayName) as Player;
    return c.json(me);
  })
  .get("/room/:id", async (c) => {
    const { id } = c.req.param();
    const gameroomStub = c.env.GAME_ROOM.getByName(id);
    const count = await gameroomStub.getActiveUsersCount();
    return c.json({
      room: id,
      user_count: count,
    });
  })
  .get("/room/:id/player_count", async (c) => {
    const { id } = c.req.param();
    const gameroomStub = c.env.GAME_ROOM.getByName(id);
    const count = await gameroomStub.getActiveUsersCount();
    return c.json({playerCount: count} as PlayerCountResponse)
  })
  .get("/room/:id/chats", async (c) => {
    const { id } = c.req.param();
    const gameroomStub = c.env.GAME_ROOM.getByName(id);
    const chats = await gameroomStub.getChats() as Chat[];
    const response: ChatHistoryResponse = {
      chats: chats
    }
    return c.json(response);
  })
  .get("/room", async (c) => {
    const rooms = await mds.listRooms();
    const colo = getLocation(c.req.raw.cf);
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
    const body = await c.req.json<{ roomId?: unknown }>().catch(() => ({}));
    const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";

    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(roomId)) {
      return c.json({ error: "Room ID must be 3-32 letters, numbers, dashes, or underscores." } as RoomCreateErrorResponse, 400);
    }

    const room = await mds.createRoom(roomId, loc);
    if (!room) {
      return c.json({ error: "Room ID is already taken." } as RoomCreateErrorResponse, 409);
    }

    const res: RoomUpsertResponse = {
      room: room,
      created: true,
    };

    return c.json(res);
  })
  .get("/streams", async (c) => {
    const streams = await stream.listStreams()
    return c.json(streams);
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
          return playerJoinRoom(r, e)
        }
      }

      try {
        return app.fetch(r, e);
      } catch (e) {
        console.error(e);
        return new Response("Internal Server Error", { status: 500 })
      }
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

  async function playerJoinRoom(r: Request, e: Env) {
    const url = new URL(r.url);

    if (r.headers.get("upgrade") !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const roomId = url.pathname.split('/').at(-1);
    const stub = e.GAME_ROOM.getByName(roomId)
    return stub.fetch(r);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function scheduled_clean_rooms(env: Env, ctx: ExecutionContext) {
    const rooms = await mds.listRooms();
    for (const room of rooms) {
      const gameRoom = env.GAME_ROOM.getByName(room.ID);
      await gameRoom.deleteOldSessions();
    }
    const deletedRoomCount = mds.deleteOldEmptyRooms();
    console.log(`Deleted ${deletedRoomCount} rooms`)
  }

  export { GameRoom } from "./durable/gameroom";
  export type AppType = typeof route;
