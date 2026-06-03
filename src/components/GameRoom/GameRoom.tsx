import { useEffect, useRef, type FC } from "react";
import styles from "./GameRoom.module.css";
import * as BABYLON from "@babylonjs/core";
import { MainScene } from "../../scenes/main";
import {useParams} from "react-router";
import {getPlayerIdentity} from "../../security/auth";
import type {Player, PlayerUpdatesPayload} from "../../../worker/model/player";
import Const from "../../../worker/const"
import {useNavigate} from 'react-router';

interface GameRoomProps {}

const GameRoom: FC<GameRoomProps> = () => {
  const mainScene: MainScene = new MainScene();
  const reactCanvas = useRef(null);
  const { id: roomId } = useParams()
  const navigate = useNavigate()

  function joinGame() {
    const ws = new WebSocket(`/ws/room/${roomId}`);
    ws.onopen = () => console.log('WebSocket connected');
    ws.onclose = (ev) => {
      console.log('WebSocket disconnected');
      if (ev.reason === Const.WS_REASON_RECONNECT) {
        console.warn("Disconnecting as a connection with similar ID have been detected")
        navigate('/')
      }
    }

    getPlayerIdentity().then(identity => {

      ws.addEventListener("message", (event) => {
        const payload = JSON.parse(event.data) as PlayerUpdatesPayload
        const otherPlayers = [] as Player[];
        const playerIds = Object.keys(payload.players);
        for (const playerId of playerIds) {
          if (playerId == identity.id) {
            continue;
          }
          otherPlayers.push(payload.players[playerId])
        }
        if (mainScene) {
          mainScene.updatePlayerPosition(otherPlayers);
        }
      });


      setInterval(() => {
        if (ws.readyState !== ws.OPEN || !mainScene || !mainScene.mainPlayer) {
          return
        }

        const player: Player = {
          id: identity.id,
          displayName: identity.displayName,
          x: mainScene.mainPlayer.characterPosition.x,
          y: mainScene.mainPlayer.characterPosition.y,
          z: mainScene.mainPlayer.characterPosition.z,
          lastSeenSync: new Date().getTime(),
        }
        ws.send(JSON.stringify(player))
      }, 100);
    });

    return () => {
      ws.close();
    }
  }

  function initBabylon() : () => void {
    console.log("Initiating main scene")
    const { current: canvas } = reactCanvas;
    if (!canvas) return;

    const engine = new BABYLON.Engine(canvas, true);
    mainScene.createScene(engine); 

    engine.runRenderLoop(() => {
      mainScene.render();
    });

    // Watch for browser/canvas resize events
    const resizeListener = function () {
      mainScene.resize();
    };

    if (window) {
      window.addEventListener("resize", resizeListener);
    }

    return () => {
      mainScene.dispose();

      if (window) {
        window.removeEventListener("resize", resizeListener);
      }
      console.log("Destroying main scene");
    };
  }

  useEffect(() => {
    return initBabylon();
  });

  useEffect(() => {
    return joinGame();
  });

  return (
    <>
    <canvas id={styles.renderCanvas} ref={reactCanvas}></canvas>
    </>
  );
};

export default GameRoom;
