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

export interface DdosMinigameState {
  name: "ddos";
  enabled: boolean;
  active: boolean;
  startedAt?: number;
  endsAt?: number;
  nextStartAt?: number;
  remainingBots: string[];
  scores: Record<string, number>;
  playerNames: Record<string, string>;
  winnerId?: string;
  winnerName?: string;
}

export interface TriviaQuestion {
  id: string;
  question: string;
  answers: string[];
  correctAnswerIndex: number;
}

export const CLOUDFLARE_TRIVIA_QUESTIONS: TriviaQuestion[] = [
  {
    id: "cf-network",
    question: "What is Cloudflare best known for operating globally?",
    answers: ["A private laptop fleet", "A connectivity cloud and edge network", "A desktop OS", "A browser extension store"],
    correctAnswerIndex: 1,
  },
  {
    id: "workers-runtime",
    question: "Cloudflare Workers run closest to users using which model?",
    answers: ["Edge serverless compute", "Only centralized VMs", "Desktop containers", "Mobile app plugins"],
    correctAnswerIndex: 0,
  },
  {
    id: "durable-objects",
    question: "What are Durable Objects useful for?",
    answers: ["Stateless image compression only", "Strongly consistent per-object coordination", "CSS generation", "DNS-only redirects"],
    correctAnswerIndex: 1,
  },
  {
    id: "ddos",
    question: "Which Cloudflare product area helps absorb large traffic attacks?",
    answers: ["DDoS mitigation", "Spreadsheet formulas", "Keyboard shortcuts", "Local file sync"],
    correctAnswerIndex: 0,
  },
  {
    id: "r2",
    question: "Cloudflare R2 is primarily used for what?",
    answers: ["Object storage", "Video meetings", "Password generation", "Browser bookmarks"],
    correctAnswerIndex: 0,
  },
  {
    id: "kv",
    question: "Cloudflare KV is best described as what kind of storage?",
    answers: ["Global low-latency key-value storage", "A GPU renderer", "A log-in screen", "A font format"],
    correctAnswerIndex: 0,
  },
  {
    id: "waf",
    question: "What does WAF stand for?",
    answers: ["Web Application Firewall", "Worker Asset Factory", "Wireless Access Format", "Wide Area Function"],
    correctAnswerIndex: 0,
  },
  {
    id: "zero-trust",
    question: "Cloudflare Zero Trust is mainly about securing what?",
    answers: ["Access to apps and networks", "Only image uploads", "Game controller input", "Laptop screen brightness"],
    correctAnswerIndex: 0,
  },
];

export interface FixPopMinigameState {
  name: "fix-pop";
  enabled: boolean;
  active: boolean;
  startedAt?: number;
  endsAt?: number;
  nextStartAt?: number;
  questionIds: string[];
  scores: Record<string, number>;
  playerNames: Record<string, string>;
  answeredPlayers: Record<string, boolean>;
  winnerId?: string;
  winnerName?: string;
}

export interface MinigameControlRequest {
  type: "minigame-control";
  enabled: boolean;
  startNow?: boolean;
  name?: "ddos" | "fix-pop";
}

export interface MinigameHitRequest {
  type: "minigame-hit";
  name: "ddos";
  botId: string;
}

export interface MinigameAnswerRequest {
  type: "minigame-answer";
  name: "fix-pop";
  answers: Record<string, number>;
}

export interface MinigamePayload {
  type: "minigame";
  event: "state" | "started" | "score" | "ended";
  state: DdosMinigameState | FixPopMinigameState;
  time: number;
}

export interface RoomStatePayload {
  type: "room-state";
  displayUrl: string;
  displaySnapshot: string;
  displayLastUpdate: number;
  playgroundObjectStates: PlaygroundObjectStates;
  minigame: DdosMinigameState;
  fixPopMinigame: FixPopMinigameState;
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

export interface RoomAnnouncementPayload {
  type: "room-announcement";
  message: string;
  time: number;
}

export type WSClientMessage = PlayerUpdateRequest | PlayerDanceRequest | PlaygroundInteractRequest | RoomDisplayUrlRequest | ChatRequest | MinigameControlRequest | MinigameHitRequest | MinigameAnswerRequest;
export type WSServerMessage = PlayerUpdatesPayload | PlayerDancePayload | PlaygroundInteractPayload | RoomStatePayload | ChatPayload | MinigamePayload | RoomAnnouncementPayload;

export interface PlayerUpdates {
  [key: string]: Player;
}
