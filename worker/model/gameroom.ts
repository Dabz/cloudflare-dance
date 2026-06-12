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

export interface PlaygroundInteractRequest {
  type: "playground";
  actionId: string;
  objectId?: string;
  objectState?: unknown;
}

export interface PlaygroundInteractPayload {
  type: "playground";
  actionId: string;
  objectId?: string;
  objectState?: unknown;
  playerId: string;
  time: number;
}

export interface PlaygroundObjectStates {
  [objectId: string]: unknown;
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
  playgroundObjectStates: PlaygroundObjectStates;
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

export type WSClientMessage = PlayerUpdateRequest | PlayerDanceRequest | PlaygroundInteractRequest | RoomDisplayUrlRequest | ChatRequest;
export type WSServerMessage = PlayerUpdatesPayload | PlayerDancePayload | PlaygroundInteractPayload | RoomStatePayload | ChatPayload;

export interface PlayerUpdates {
  [key: string]: Player;
}
