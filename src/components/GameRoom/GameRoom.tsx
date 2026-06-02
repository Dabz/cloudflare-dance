import { useEffect, useRef, type FC } from "react";
import styles from "./GameRoom.module.css";
import * as BABYLON from "@babylonjs/core";
import { MainScene } from "../../scenes/main";
import {useParams} from "react-router";
import {getUsername} from "../../security/auth";
import type {Player, PlayerUpdatesPayload} from "../../../worker/model/player";

interface GameRoomProps {}

const GameRoom: FC<GameRoomProps> = () => {
  const mainScene = new MainScene();
  const reactCanvas = useRef(null);
  const { id: roomId } = useParams()

  function joinGame() {
    const ws = new WebSocket(`/ws/room/${roomId}`);
    ws.onopen = () => console.log('WebSocket connected');
    ws.onclose = () => console.log('WebSocket disconnected');

    getUsername().then((username) => {

      ws.addEventListener("message", (event) => {
        const payload = JSON.parse(event.data) as PlayerUpdatesPayload
        const otherPlayers = [] as Player[];
        const playerNames = Object.keys(payload.players);
        for (const playerName of playerNames) {
          if (playerName == username) {
            continue;
          }
          otherPlayers.push(payload.players[playerName])
        }
        mainScene.otherPlayers = otherPlayers;
      });


      setInterval(() => {
        if (ws.readyState !== ws.OPEN || !mainScene || !mainScene.characterPosition) {
          return
        }

        const player: Player = {
          ID: username,
          X: mainScene.characterPosition.x,
          Y: mainScene.characterPosition.y,
          Z: mainScene.characterPosition.z,
        }
        ws.send(JSON.stringify(player))
      }, 100);
    });
  }

  function initBabylon() : () => void {
    console.log("Initiating main scene")
    const { current: canvas } = reactCanvas;
    if (!canvas) return;

    const engine = new BABYLON.Engine(canvas, true);
    const scene = mainScene.createScene(engine); //Call the createScene function

    engine.runRenderLoop(() => {
      mainScene.tick();
      scene.render();
    });

    // Watch for browser/canvas resize events
    const resizeListener = function () {
      engine.resize();
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
    joinGame()
    return initBabylon();
  });

  return (
    <>
    <canvas id={styles.renderCanvas} ref={reactCanvas}></canvas>
    </>
  );
};

export default GameRoom;
