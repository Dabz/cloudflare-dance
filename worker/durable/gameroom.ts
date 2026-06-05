import { DurableObject, env } from "cloudflare:workers";
import puppeteer from "@cloudflare/puppeteer";
import type { Player, PlayerClientMessage, PlayerDancePayload, PlayerUpdates, PlayerUpdatesPayload, RoomStatePayload } from "../model/player";
import {createPlayerIdCookie, getDisplayNameOverride, getPlayerId, getPlayerIdentity} from "../auth";
import Const from "../const"

interface SessionData {
  id: string;
  displayName: string;
}

const DISPLAY_URL_STORAGE_KEY = "displayUrl";
const DISPLAY_IMAGE_STORAGE_KEY = "displayImage";

function normalizeDisplayUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Display URL must use http or https");
  }

  return url.toString();
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
                                LAST_SEEN INTEGER,
                                ACTIVE INTEGER,
                                X INTEGER,
                                Y INTEGER,
                                Z INTEGER,
                                ROTATION_Y REAL DEFAULT 0
                              );
                              `);
    const columns = this.ctx.storage.sql.exec<{ name: string }>(`PRAGMA table_info(SESSIONS)`).toArray();
    if (!columns.some((column) => column.name === "ROTATION_Y")) {
      this.ctx.storage.sql.exec(`ALTER TABLE SESSIONS ADD COLUMN ROTATION_Y REAL DEFAULT 0`);
    }
    this.ctx.storage.sql.exec(`
                              CREATE INDEX IF NOT EXISTS SESSION_LAST_SEEN_IDX
                              ON SESSIONS (LAST_SEEN);
                              `);
    this.ctx.storage.sql.exec(`
                              CREATE INDEX IF NOT EXISTS SESSION_ACTIVE_IDX
                              ON SESSIONS (ACTIVE);
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
  }

  async getActiveUsersCount() {
    this.deleteOldSessions();
    const count = this.ctx.storage.sql
      .exec(`SELECT COUNT(ID) AS COUNT FROM SESSIONS WHERE ACTIVE > 0`)
      .one();
    return count["COUNT"];
  }

  async fetch(req: Request): Promise<Response> {
    const existingPlayerId = getPlayerId(req.headers);
    const identity = getPlayerIdentity(req.headers, getDisplayNameOverride(req.url))

    try {
      this.deleteOldSessions();
      this.deleteUserOldSessions(identity.id);
    } catch (e) {
      console.error("Failed deleting old sessions", e)
    }
    const now = Date.now();
    this.ctx.storage.sql.exec(
      `
                                            INSERT INTO SESSIONS (ID, CREATED_AT, LAST_SEEN, ACTIVE) VALUES (?, ?, ?, 1)
                                             ON CONFLICT (ID) DO UPDATE SET LAST_SEEN = excluded.LAST_SEEN, ACTIVE = excluded.ACTIVE
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
    await this.sendRoomState(server);

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

  public getSession(id: string, displayName: string): Player {
    const res = this.ctx.storage.sql.exec(`SELECT ID, CREATED_AT, LAST_SEEN, X, Y, Z, ROTATION_Y FROM SESSIONS WHERE ID = ?`, id);
    const next = res .next();

    if (next.done) {
      return {
        "id": id,
        "displayName": displayName,
        "lastSeenSync": 0,
        "x": undefined,
        "y": undefined,
        "z": undefined,
        "rotationY": 0,
      } as Player
    }

    return {
      "id": id,
      "displayName": displayName,
      "lastSeenSync": next.value["LAST_SEEN"],
      "x": next.value["X"],
      "y": next.value["Y"],
      "z": next.value["Z"],
      "rotationY": next.value["ROTATION_Y"] ?? 0
    } as Player
  }

  deleteSession(id: string): number {
    return this.ctx.storage.sql.exec(`UPDATE SESSIONS SET ACTIVE = 0 WHERE ID = ?`, id)
    .rowsWritten;
  }

  async updateUser(player: Player) {
    const now = new Date().getTime();
    const res = this.ctx.storage.sql.exec(
      `
      INSERT INTO SESSIONS (ID, CREATED_AT, LAST_SEEN, X, Y, Z, ROTATION_Y) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (ID) DO 
      UPDATE SET LAST_SEEN = excluded.LAST_SEEN, X = excluded.X, Y = excluded.Y, Z = excluded.Z, ROTATION_Y = excluded.ROTATION_Y
      `, player.id, now, now, player.x, player.y, player.z, player.rotationY
    );
    return res.rowsWritten;
  }

  async maybeUpdateLastseen(id: string) {
    const player = this.players[id];
    const now = new Date().getTime();

    if (!player) {
      this.players[id] = { x: 0, y: 0, z: 0, rotationY: 0, id: id, displayName: "", lastSeenSync: now};
      return;
    }

    if (player.lastSeenSync && now - player.lastSeenSync < Const.D1_LAST_SEEN_UPDATE_FREQENCY) {
      return;
    }

    this.updateUser(player);
    player.lastSeenSync = now;
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    const session = ws.deserializeAttachment() as SessionData;
    try {
      const incomingMessage = JSON.parse(message.toString()) as PlayerClientMessage;
      if ("type" in incomingMessage && incomingMessage.type === "dance") {
        this.broadcastDance(ws, session.id);
        return;
      }

      if ("type" in incomingMessage && incomingMessage.type === "display-url") {
        await this.setDisplayUrl(incomingMessage.url);
        await this.refreshSnapshotUrlToPNG(incomingMessage.url);
        await this.broadcastRoomState();
        return;
      }

      const incomingPlayerData = incomingMessage as Player;
      const playerData: Player = {
        ...incomingPlayerData,
        id: session.id,
        displayName: session.displayName,
        rotationY: incomingPlayerData.rotationY ?? 0,
      };
      this.maybeUpdateLastseen(playerData.id)
      this.players[session.id] = playerData;
      this.updateUser(playerData);
      this.ensureBroadcastLoop();
    } catch(e) {
      console.error("failed processing WS incomming message", e)
    }
  }

  private broadcastDance(sender: WebSocket, playerId: string) {
    const payload: PlayerDancePayload = {
      type: "dance",
      playerId,
      time: new Date().getTime(),
    };
    const payloadString = JSON.stringify(payload);

    for (const client of this.ctx.getWebSockets()) {
      if (client !== sender) {
        client.send(payloadString);
      }
    }
  }

  private async getDisplayUrl(): Promise<string> {
    return (await this.ctx.storage.get<string>(DISPLAY_URL_STORAGE_KEY)) ?? "";
  }

  public async getDisplaySnapshot(): Promise<string> {
    return (await this.ctx.storage.get<string>(DISPLAY_IMAGE_STORAGE_KEY)) ?? "";
  }

  public async refreshSnapshotUrlToPNG(url: string): Promise<string> {
    try {
      const browser = await puppeteer.launch(env.BROWSER);
      const page = await browser.newPage();
      page.setViewport({
        width: 1024,
        height: 512
      })
      await page.emulateMediaFeatures([
         { name: "prefers-color-scheme", value: "dark" }
      ]);

      await page.goto(url);
      const screenshot = await page.screenshot({ type: 'png', encoding: "base64" });
      await this.ctx.storage.put(DISPLAY_IMAGE_STORAGE_KEY, screenshot);
      await browser.close();
      return screenshot;
    } catch (e) {
      console.error(e);
      return;
    }
  }

  private async setDisplayUrl(rawUrl: string) {
    const displayUrl = normalizeDisplayUrl(rawUrl);
    await this.ctx.storage.put(DISPLAY_URL_STORAGE_KEY, displayUrl);
  }

  private async sendRoomState(ws: WebSocket) {
    ws.send(JSON.stringify(await this.createRoomStatePayload()));
  }

  private async broadcastRoomState() {
    const payloadString = JSON.stringify(await this.createRoomStatePayload());
    for (const client of this.ctx.getWebSockets()) {
      client.send(payloadString);
    }
  }

  private async createRoomStatePayload(): Promise<RoomStatePayload> {
    return {
      type: "room-state",
      displayUrl: await this.ctx.storage.get(DISPLAY_URL_STORAGE_KEY),
      displaySnapshot: await this.ctx.storage.get(DISPLAY_IMAGE_STORAGE_KEY),
      time: new Date().getTime(),
    };
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

  async webSocketClose(ws: WebSocket) {
    const session = ws.deserializeAttachment() as SessionData;
    delete this.players[session.id];
    this.deleteSession(session.id);
    if (this.ctx.getWebSockets().length === 0) {
      this.isLoopRunning = false;
    }
  }
}
