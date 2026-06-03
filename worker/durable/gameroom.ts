import { DurableObject } from "cloudflare:workers";
import type { Player, PlayerUpdates, PlayerUpdatesPayload } from "../model/player";
import {createPlayerIdCookie, getPlayerId, getPlayerIdentity} from "../auth";
import Const from "../const"

interface SessionData {
  id: string;
  displayName: string;
}


export class GameRoom extends DurableObject<Env> {
  players: PlayerUpdates = {};
  isLoopRunning = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      await this.migrate();
    });
  }

  private async migrate() {
    this.ctx.storage.sql.exec(`
                              CREATE TABLE IF NOT EXISTS SESSIONS (
                                ID TEXT PRIMARY KEY,
                                CREATED_AT INTEGER,
                                LAST_SEEN INTEGER
                              );
                              `);
    this.ctx.storage.sql.exec(`
                              CREATE INDEX IF NOT EXISTS SESSION_LAST_SEEN_IDX
                              ON SESSIONS (LAST_SEEN);
                              `);
  }

  deleteOldSessions() {
    const session_timeout = 1000 * 30;
    const date_threshold = Date.now() - session_timeout;
    const res = this.ctx.storage.sql.exec(
      `DELETE FROM SESSIONS WHERE LAST_SEEN <= ?`,
      date_threshold,
    );
    return res.rowsWritten;
  }

  deleteUserOldSessions(id: string) {
    const wsList = this.ctx.getWebSockets(id)
    if (!wsList || wsList.length == 0) return;

    for (const ws of wsList) {
      ws.close(1000, Const.WS_REASON_RECONNECT);
    }
    this.deleteSession(id);
  }

  async getActiveUsersCount() {
    this.deleteOldSessions();
    const count = this.ctx.storage.sql
      .exec(`SELECT COUNT(ID) AS COUNT FROM SESSIONS`)
      .one();
    return count["COUNT"];
  }

  async fetch(req: Request): Promise<Response> {
    const existingPlayerId = getPlayerId(req.headers);
    const identity = getPlayerIdentity(req.headers)

    try {
      this.deleteOldSessions();
      this.deleteUserOldSessions(identity.id);
    } catch (e) {
      console.error("Failed deleting old sessions", e)
    }
    const now = Date.now();
    this.ctx.storage.sql.exec(
      `
                                            INSERT INTO SESSIONS VALUES (?, ?, ?)
                                             ON CONFLICT (ID) DO UPDATE SET LAST_SEEN = excluded.LAST_SEEN
                                             `,
      identity.id,
      now,
      now,
    );

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    const sessionInfo: SessionData = { id: identity.id, displayName: identity.displayName };
    server.serializeAttachment(sessionInfo);
    this.ctx.acceptWebSocket(server, [identity.id]);

    const headers = new Headers();
    if (!existingPlayerId) {
      headers.set("Set-Cookie", createPlayerIdCookie(identity.id));
    }

    return new Response(null, {
      status: 101,
      headers,
      webSocket: client,
    });
  }

  deleteSession(id: string): number {
    return this.ctx.storage.sql.exec(`DELETE FROM SESSIONS WHERE ID = ?`, id)
      .rowsWritten;
  }

  async updateUser(player: Player) {
    const now = new Date().getTime();
    const res = this.ctx.storage.sql.exec(
      `
                                            INSERT INTO SESSIONS VALUES (?, ?, ?)
                                             ON CONFLICT (ID) DO UPDATE SET LAST_SEEN = excluded.LAST_SEEN
                                             `, player.id, now, now
    );
    return res.rowsWritten;
  }

  async maybeUpdateLastseen(id: string) {
    const player = this.players[id];
    if (player && player.lastSeenSync && player.lastSeenSync < Const.D1_LAST_SEEN_UPDATE_FREQENCY) {
      return;
    }
    const now = new Date().getTime();
    this.updateUser(player);

    if (!this.players[id]) {
      this.players[id] = { x: 0, y: 0, z: 0, id: id, displayName: "", lastSeenSync: now};
    } else {
      this.players[id].lastSeenSync = now;
    }

  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    const session = ws.deserializeAttachment() as SessionData;
    try {
      const incomingPlayerData = JSON.parse(message.toString()) as Player;
      const playerData: Player = {
        ...incomingPlayerData,
        id: session.id,
        displayName: session.displayName,
      };
      this.maybeUpdateLastseen(playerData.id)
      this.players[session.id] = playerData;
      this.updateUser(session.id);
      this.ensureBroadcastLoop();
    } catch(e) {
      console.error("failed processing WS incomming message", e)
    }
  }

  private ensureBroadcastLoop() {
    if (this.isLoopRunning) return;
    this.isLoopRunning = true;
    this.runBroadcastLoop();
  }

  private async runBroadcastLoop() {
    while (this.isLoopRunning) {
      try {
        await this.doRun();
      } catch (e) {
        console.error("Exception in broadcast loop", e);
      }
    }
  }

  private async doRun() {
    await new Promise((res) => setTimeout(res, 100));
    const allClients = this.ctx.getWebSockets();
    if (allClients.length == 0) {
      this.isLoopRunning = false;
      this.players = {};
      return;
    }

    if (Object.entries(this.players).length > 0) {
      const updatesToSend: PlayerUpdates = { ...this.players };
      const payload: PlayerUpdatesPayload = {
        players: updatesToSend,
        time: new Date().getTime(),
      };
      const payloadString = JSON.stringify(payload);

      for (const ws of allClients) {
        ws.send(payloadString);
      }
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ) {
    const session = ws.deserializeAttachment() as SessionData;
    delete this.players[session.id];
    this.deleteSession(session.id);
    if (this.ctx.getWebSockets().length === 0) {
      this.isLoopRunning = false;
    }
  }
}
