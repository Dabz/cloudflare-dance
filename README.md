# Cloudflare Dance

A multiplayer 3D party room built with React, Babylon.js, Cloudflare Workers, and Durable Objects. Players join a shared room, pick a character, dance, interact with GLTF-authored objects, use the shared TV, and play short room-wide minigames.

## What This Demonstrates

- Real-time multiplayer state over WebSockets.
- One Durable Object per game room for strongly consistent coordination.
- Babylon.js scene rendering with GLTF levels and characters.
- Persistent room state such as players, character selection, TV state, chats, object state, and minigames.
- Cloudflare platform bindings including Workers Assets, Durable Objects, D1, R2, Browser Rendering, and Stream.

## Architecture

The app is split into a browser client and a Cloudflare Worker backend.

The client renders the 3D room with Babylon.js and React UI overlays. It leverages WebSockets for realtime updates.

The Worker serves API routes with Hono and upgrades WebSocket connections into the room Durable Object.

Each room maps to one `GameRoom` Durable Object via `GAME_ROOM.getByName(roomId)`. That object is the authority for room coordination:

- Tracks active sessions and player positions.
- Stores player character selection in the `SESSIONS` table.
- Broadcasts room state, announcement and events.
- Persists room state in Durable Object storage.
- Runs minigame timers and scoring.
- Sends initial `room-state` to new joiners.

## Project Structure

```txt
src/
  components/GameRoom/     React game UI, menus, chat, popups
  scenes/                  Babylon.js scene, players, TV, playground
  scenes/minigames/        Room minigame renderers and helpers
  scenes/playground/       Per-interaction object action classes
  security/                Client auth/display name helpers

worker/
  index.ts                 Hono API and WebSocket routing
  durable/gameroom.ts      GameRoom Durable Object
  model/                   Shared request/payload types
  stream/                  Cloudflare Stream integration

public/
  characters/              GLTF character assets
  levels/                  GLTF room/level assets
```

## Durable Object Flow

1. Browser joins `/ws/room/:roomId`.
2. Worker routes the WebSocket to `GAME_ROOM.getByName(roomId)`.
3. `GameRoom` accepts the socket, stores session metadata, and sends `room-state`.
4. Clients send player updates and interaction requests.
5. `GameRoom` validates, persists, and broadcasts state to everyone in the room.
6. When the last socket disconnects, in-memory broadcast loops stop; durable state remains stored.

This keeps all players in a room synchronized without needing a separate database transaction for every frame.
A scheduled job is executed every 5 minutes to delete old and unused state.

## Minigames

Minigames are coordinated by the Durable Object and rendered by scene modules.

- `DDoS`: bots attack the TV; cannon hits score points.
- `Fix POP`: players answer Cloudflare trivia through the TV popup.

Scene renderers live in `src/scenes/minigames/`, while authoritative timing, scoring, and broadcasts live in `worker/durable/gameroom.ts`.

## GLTF-Driven Interactions

Interactive playground objects are authored in Blender and exported in the level GLTF. Objects become interactable when they expose custom properties such as:

```txt
interactionId = launch-ball
interactionLabel = Launch balls
interactionDistance = 3
```

TypeScript keeps the behavior; Blender owns placement and visuals.

## Local Development

Install dependencies:

```sh
npm install
```

Run locally:

```sh
npm run dev
```

Build:

```sh
npm run build
```

Deploy:

```sh
npm run deploy
```

Generate Cloudflare types:

```sh
npm run cf-typegen
```

## Cloudflare Configuration

Configured in `wrangler.jsonc`:

- Worker entrypoint: `worker/index.ts`
- Static assets: `dist/client (./public folder)`
- Durable Object binding: `GAME_ROOM`
- D1 database: `CLOUDFLARE_PLEASE_METADATA`
- R2 bucket: `R2_SAVE`
- Browser Rendering binding: `BROWSER`
- Stream binding: `STREAM`
- Cron trigger for cleanup

## Notes

This project is intentionally playful, but the architecture mirrors real production patterns: Durable Objects provide a natural coordination boundary for multiplayer rooms, while the client remains focused on rendering, input, and local effects.
