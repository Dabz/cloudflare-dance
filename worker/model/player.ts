export interface PlayerIdentity {
  id: string;
  displayName: string;
}

export interface Player {
  id: string,
  displayName: string,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  lastSeenSync: number,
}

export interface PlayerUpdatesPayload {
  players: PlayerUpdates;
  time: number;
}

export interface PlayerDanceRequest {
  type: "dance";
}

export interface PlayerDancePayload {
  type: "dance";
  playerId: string;
  time: number;
}

export type PlayerClientMessage = Player | PlayerDanceRequest;
export type PlayerServerMessage = PlayerUpdatesPayload | PlayerDancePayload;

export interface PlayerUpdates {
  [key: string]: Player;
}
