import { DurableObject } from "cloudflare:workers";
import type { Player, PlayerUpdates, PlayerUpdatesPayload } from "../model/player";
import {getUser} from "../auth";

interface SessionData {
  id: string;
}


export class GameRoom extends DurableObject<Env> {
  playerUpdates: PlayerUpdates = {};
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

  delete_old_sessions() {
    const session_timeout = 1000 * 30;
    const date_threshold = Date.now() - session_timeout;
    const res = this.ctx.storage.sql.exec(
      `DELETE FROM SESSIONS WHERE LAST_SEEN <= ?`,
      date_threshold,
    );
    return res.rowsWritten;
  }

  async get_active_users_count() {
    this.delete_old_sessions();
    const count = this.ctx.storage.sql
      .exec(`SELECT COUNT(ID) AS COUNT FROM SESSIONS`)
      .one();
    return count["COUNT"];
  }

  async fetch(req: Request): Promise<Response> {
    const user = getUser(req.headers)

    this.delete_old_sessions();
    const now = Date.now();
    this.ctx.storage.sql.exec(
      `
                                            INSERT INTO SESSIONS VALUES (?, ?, ?)
                                            ON CONFLICT (ID) DO UPDATE SET LAST_SEEN = excluded.LAST_SEEN
                                            `,
      user,
      now,
      now,
    );

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    const sessionInfo: SessionData = { id: user };
    server.serializeAttachment(sessionInfo);
    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  delete_session(id: string): number {
    return this.ctx.storage.sql.exec(`DELETE FROM SESSIONS WHERE ID = ?`, id)
      .rowsWritten;
  }

  async update_user(id: string) {
    const res = this.ctx.storage.sql.exec(
      `UPDATE SESSIONS SET LAST_SEEN = ? WHERE ID = ?`,
      new Date().getTime(),
      id,
    );
    return res.rowsWritten;
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    const session = ws.deserializeAttachment() as SessionData;
    try {
      const playerData = JSON.parse(message.toString()) as Player;
      playerData.ID = session.id;
      this.playerUpdates[session.id] = playerData;
      this.update_user(session.id);
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
      await new Promise((res) => setTimeout(res, 100));
      const allClients = this.ctx.getWebSockets();
      if (allClients.length == 0) {
        this.isLoopRunning = false;
        this.playerUpdates = {};
        break;
      }

      if (Object.entries(this.playerUpdates).length > 0) {
        const updatesToSend: PlayerUpdates = { ...this.playerUpdates };
        this.playerUpdates = {};
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
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ) {
    const session = ws.deserializeAttachment() as SessionData;
    this.delete_session(session.id);
    if (this.ctx.getWebSockets().length === 0) {
      this.isLoopRunning = false;
    }
  }
}
