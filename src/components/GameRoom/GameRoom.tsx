import { useEffect, useRef, useState, type FC, type FormEvent } from "react";
import styles from "./GameRoom.module.css";
import * as BABYLON from "@babylonjs/core";
import { MainScene } from "../../scenes/main";
import {useParams} from "react-router";
import {getPlayerIdentity, getPlayerInformationInRoom} from "../../security/auth";
import type {Player, PlayerDanceRequest, PlayerServerMessage, RoomDisplayUrlRequest} from "../../../worker/model/player";
import Const from "../../../worker/const"
import {useNavigate} from 'react-router';
import { getDisplayNameCookie, UNKNOWN_DISPLAY_NAME } from "../../security/displayName";
import type {StreamVideo} from "../../../worker/model/streams";
import {listStreams} from "../../streams";

function getDisplayNameForJoin(displayName: string): string {
  if (displayName !== UNKNOWN_DISPLAY_NAME) return displayName;
  return getDisplayNameCookie() ?? displayName;
}

function getStreamTitle(stream: StreamVideo, index: number): string {
  return stream.meta?.name || stream.meta?.filename || `Video ${index + 1}`;
}

const GameRoom: FC = () => {
  const reactCanvas = useRef<HTMLCanvasElement | null>(null);
  const mainSceneRef = useRef<MainScene | undefined>(undefined);
  const wsRef = useRef<WebSocket | undefined>(undefined);
  const [draftDisplayUrl, setDraftDisplayUrl] = useState("");
  const [streams, setStreams] = useState<StreamVideo[] | undefined>(undefined);
  const [tvPopupOpen, setTvPopupOpen] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(true);
  const { id: roomId } = useParams()
  const navigate = useNavigate()

  function shareDisplayUrl(url: string) {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    const payload: RoomDisplayUrlRequest = {
      type: "display-url",
      url,
    };
    wsRef.current.send(JSON.stringify(payload));
    setTvPopupOpen(false);
  }

  function dance() {
    mainSceneRef.current?.danceMainPlayer();
  }

  function saveDisplayUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    shareDisplayUrl(draftDisplayUrl);
  }

  useEffect(() => {
    if (!roomId) return;

    listStreams().then((streams) => { 
      setStreams(streams);
    });
    let disposed = false;
    let mainScene: MainScene | undefined;
    let engine: BABYLON.Engine | undefined;
    let ws: WebSocket | undefined;
    let wsInterval: ReturnType<typeof setInterval> | undefined;

    const resizeListener = function () {
      mainScene?.resize();
    };

    function connectWebSocket(roomId: string, displayNameOverride: string) {
      const wsUrl = `/ws/room/${roomId}${displayNameOverride ? `?displayName=${encodeURIComponent(displayNameOverride)}` : ""}`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => console.log('WebSocket connected');
      ws.onclose = (ev) => {
        console.log('WebSocket disconnected');
        if (!disposed && ev.reason === Const.WS_REASON_RECONNECT) {
          console.warn("Disconnecting as a connection with similar ID have been detected");
          navigate('/');
        }

        setTimeout(() => {
          connectWebSocket(roomId, displayNameOverride)
        }, 1000)
      };
      return ws;
    }


    async function joinGame() {
      try {
        const identity = await getPlayerIdentity();
        const displayName = getDisplayNameForJoin(identity.displayName);
        const displayNameOverride = identity.displayName === UNKNOWN_DISPLAY_NAME && displayName !== UNKNOWN_DISPLAY_NAME
          ? displayName
          : undefined;
          const mainPlayer = await getPlayerInformationInRoom(roomId, displayNameOverride);
          if (!mainPlayer || !mainPlayer.id) {
            console.error("Can't fetch identity information");
            return;
          }
          if (disposed) return;

          const { current: canvas } = reactCanvas;
          if (!canvas) return;

          console.log("Initiating main scene")
          mainScene = new MainScene((event) => {
            if (event === "tv-interact") {
              setTvPopupOpen(true)
            }
            if (event === "tv-leave") {
              setTvPopupOpen(false);
            }
            if (event === "player-dance") {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                const payload: PlayerDanceRequest = { type: "dance" };
                wsRef.current.send(JSON.stringify(payload));
              }
            }
          });
          mainSceneRef.current = mainScene;
          engine = new BABYLON.Engine(canvas, true);
          await mainScene.createScene(engine, mainPlayer);

          if (disposed) {
            mainScene.dispose();
            engine.dispose();
            return;
          }

          ws = connectWebSocket(roomId, displayNameOverride);

          wsInterval = setInterval(() => {
            if (!ws || ws.readyState !== ws.OPEN || !mainScene?.mainPlayer) {
              return
            }

            const player: Player = {
              id: mainPlayer.id,
              displayName: mainPlayer.displayName,
              x: mainScene.mainPlayer.characterPosition.x,
              y: mainScene.mainPlayer.characterPosition.y,
              z: mainScene.mainPlayer.characterPosition.z,
              rotationY: mainScene.mainPlayer.rotationY,
              lastSeenSync: new Date().getTime(),
            }
            ws.send(JSON.stringify(player))
          }, 100);

          engine.runRenderLoop(() => {
            if (!disposed) {
              mainScene?.render();
            }
          });

          window.addEventListener("resize", resizeListener);

          ws.addEventListener("message", (event) => {
            if (disposed || !mainScene?.mainPlayer) return;

            const payload = JSON.parse(event.data) as PlayerServerMessage
            if ("type" in payload && payload.type === "dance") {
              mainScene.dancePlayer(payload.playerId);
              return;
            }

            if ("type" in payload && payload.type === "room-state") {
              setDraftDisplayUrl(payload.displayUrl);
              mainScene.tv.setLaptopUrl(payload.displayUrl, payload.displaySnapshot, payload.displayLastUpdate);
              return;
            }

            const otherPlayers = [] as Player[];
            const playerIds = Object.keys(payload.players);
            for (const playerId of playerIds) {
              if (playerId == mainPlayer.id) {
                continue;
              }
              otherPlayers.push(payload.players[playerId])
            }
            mainScene.updatePlayerPosition(otherPlayers);
          });
      } catch (error) {
        if (disposed) {
          return;
        }

        console.error("Failed to join game", error);
        ws?.close();
        engine?.stopRenderLoop();
        mainScene?.dispose();
        engine?.dispose();
        return;
      }
    }

    void joinGame();

    return () => {
      disposed = true;

      console.log("Closing websocket")
      if (wsInterval) clearInterval(wsInterval);
      ws?.close();
      wsRef.current = undefined;
      window.removeEventListener("resize", resizeListener);

      console.log("Destroying main scene")
      engine?.stopRenderLoop();
      mainScene?.dispose();
      mainSceneRef.current = undefined;
      engine?.dispose();
    }
  }, [roomId, navigate]);

  return (
    <>
    <canvas id={styles.renderCanvas} ref={reactCanvas}></canvas>
    <section className={styles.ControlsPanel} aria-label="Room controls">
    <div className={styles.PrimaryControls}>
    <button type="button" onClick={() => navigate('/')}>Main Menu</button>
    <button type="button" onClick={() => mainSceneRef.current?.resetMainPlayerPosition()}>Reset</button>
    <button type="button" onClick={dance}>Dance</button>
    </div>
    <section className={styles.KeyboardHelp} aria-label="How to play">
    <button
    type="button"
    className={styles.KeyboardHelpToggle}
    aria-expanded={howToPlayOpen}
    onClick={() => setHowToPlayOpen((open) => !open)}
    >
    <span className={styles.PanelKicker}>How to play</span>
    <span>{howToPlayOpen ? "Hide" : "Show"}</span>
    </button>
    {howToPlayOpen && (
      <dl>
      <div>
      <dt><kbd>WASD</kbd> <span>or</span> <kbd>Arrows</kbd></dt>
      <dd>Move</dd>
      </div>
      <div>
      <dt><kbd>Space</kbd></dt>
      <dd>Jump</dd>
      </div>
      <div>
      <dt><kbd>Q</kbd></dt>
      <dd>Dance</dd>
      </div>
      <div>
      <dt><kbd>Mouse drag</kbd></dt>
      <dd>Look around</dd>
      </div>
      </dl>
    )}
    </section>
    </section>
    {tvPopupOpen && (
      <div className={styles.TvPopupBackdrop} role="presentation" onMouseDown={() => setTvPopupOpen(false)}>
      <section
      className={styles.TvDisplayPopup}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tv-display-title"
      onMouseDown={(event) => event.stopPropagation()}
      >
      <div className={styles.TvPopupHeader}>
      <span>Room TV</span>
      <button type="button" aria-label="Close TV display controls" onClick={() => setTvPopupOpen(false)}>Close</button>
      </div>
      <form className={styles.TvUrlForm} onSubmit={saveDisplayUrl}>
      <h2 id="tv-display-title">Set the laptop display</h2>
      <p>Share a webpage or video on the TV for everyone in this room.</p>
        <label htmlFor="tv-display-url">Laptop URL</label>
      <div className={styles.TvUrlRow}>
      <input
      id="tv-display-url"
      type="text"
      placeholder="https://example.com"
      value={draftDisplayUrl}
      onChange={(event) => setDraftDisplayUrl(event.target.value)}
      />
      <button type="submit">Share</button>
      </div>
      </form>
      <div className={styles.TvVideoPicker}>
      <span className={styles.TvVideoPickerTitle}>Choose a video</span>
      {streams === undefined && <p>Loading videos...</p>}
      {streams?.length === 0 && <p>No videos are available.</p>}
      {streams?.map((stream, index) => (
        <button
        key={stream.id}
        type="button"
        disabled={!stream.readyToStream || !stream.hlsPlaybackUrl}
        onClick={() => {
          setDraftDisplayUrl(stream.hlsPlaybackUrl);
          shareDisplayUrl(stream.hlsPlaybackUrl);
        }}
        >
        {stream.thumbnail && <img alt="" src={stream.thumbnail} />}
        <span>{getStreamTitle(stream, index)}</span>
        </button>
      ))}
      </div>
      </section>
      </div>
    )}
    </>
  );
};

export default GameRoom;
