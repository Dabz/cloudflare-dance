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
  lastSeenSync: number,
}

export interface PlayerUpdatesPayload {
  players: PlayerUpdates;
  time: number;
}

export interface PlayerUpdates {
  [key: string]: Player;
}
