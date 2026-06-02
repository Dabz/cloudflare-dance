export interface Player {
  ID: string,
  X: number,
  Y: number,
  Z: number,
}

export interface PlayerUpdatesPayload {
  players: PlayerUpdates;
  time: number;
}

export interface PlayerUpdates {
  [key: string]: Player;
}
