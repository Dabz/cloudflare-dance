export interface Chat {
  id: string,
  content: string,
  createdAt: number,
  isInternal: number,
  playerId?: string
  playerDisplayName?: string
}
