import { useEffect, useRef, type FC } from "react";
import styles from "./GameRoom.module.css";
import * as BABYLON from "@babylonjs/core";
import { MainScene } from "../../scenes/main";
import {useParams} from "react-router";
import {getPlayerIdentity, getPlayerInformationInRoom} from "../../security/auth";
import type {Player, PlayerUpdatesPayload} from "../../../worker/model/player";
import Const from "../../../worker/const"
import {useNavigate} from 'react-router';
import { getDisplayNameCookie, UNKNOWN_DISPLAY_NAME } from "../../security/displayName";

function getDisplayNameForJoin(displayName: string): string {
  if (displayName !== UNKNOWN_DISPLAY_NAME) return displayName;
  return getDisplayNameCookie() ?? displayName;
}

const GameRoom: FC = () => {
  const reactCanvas = useRef<HTMLCanvasElement | null>(null);
  const { id: roomId } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (!roomId) return;

    let disposed = false;
    let mainScene: MainScene | undefined;
    let engine: BABYLON.Engine | undefined;
    let ws: WebSocket | undefined;
    let wsInterval: ReturnType<typeof setInterval> | undefined;

    const resizeListener = function () {
      mainScene?.resize();
    };

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
        mainScene = new MainScene();
        engine = new BABYLON.Engine(canvas, true);
        await mainScene.createScene(engine, mainPlayer);

        if (disposed) {
          mainScene.dispose();
          engine.dispose();
          return;
        }

        const wsUrl = `/ws/room/${roomId}${displayNameOverride ? `?displayName=${encodeURIComponent(displayNameOverride)}` : ""}`;
        ws = new WebSocket(wsUrl);
        ws.onopen = () => console.log('WebSocket connected');
        ws.onclose = (ev) => {
          console.log('WebSocket disconnected');
          if (!disposed && ev.reason === Const.WS_REASON_RECONNECT) {
            console.warn("Disconnecting as a connection with similar ID have been detected")
            navigate('/')
          }
        }

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

          const payload = JSON.parse(event.data) as PlayerUpdatesPayload
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
      window.removeEventListener("resize", resizeListener);

      console.log("Destroying main scene")
      engine?.stopRenderLoop();
      mainScene?.dispose();
      engine?.dispose();
    }
  }, [roomId, navigate]);

  return (
    <>
    <canvas id={styles.renderCanvas} ref={reactCanvas}></canvas>
    </>
  );
};

export default GameRoom;
