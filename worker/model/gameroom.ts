import type {Chat} from "./chat";
import type {Player} from "./player";

export interface PlayerUpdatesPayload {
  type: "player";
  players: PlayerUpdates;
  time: number;
}

export interface PlayerUpdateRequest {
  type: "player";
  player: Player;
}

export interface PlayerDanceRequest {
  type: "dance";
}

export interface PlayerDancePayload {
  type: "dance";
  playerId: string;
  time: number;
}

export interface RoomDisplayUrlRequest {
  type: "display-url";
  url: string;
}

export interface RoomStatePayload {
  type: "room-state";
  displayUrl: string;
  displaySnapshot: string;
  displayLastUpdate: number;
  time: number;
}

export interface ChatRequest {
  type: "chat";
  id: string;
  content: string;
}

export interface ChatPayload {
  type: "chat";
  chat: Chat;
}

export type WSClientMessage = PlayerUpdateRequest | PlayerDanceRequest | RoomDisplayUrlRequest | ChatRequest;
export type WSServerMessage = PlayerUpdatesPayload | PlayerDancePayload | RoomStatePayload | ChatPayload;

export interface PlayerUpdates {
  [key: string]: Player;
}
