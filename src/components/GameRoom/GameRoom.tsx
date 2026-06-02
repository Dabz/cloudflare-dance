import { useEffect, useRef, type FC } from "react";
import styles from "./GameRoom.module.css";
import * as BABYLON from "@babylonjs/core";
import mainScene from "../../scenes/main";
import {useParams} from "react-router";
import type {Player} from "../../../worker/model/player";

interface GameRoomProps {}

const GameRoom: FC<GameRoomProps> = () => {
  const reactCanvas = useRef(null);
  const { id } = useParams()

  function joinGame() {
    const ws = new WebSocket(`/ws/room/${id}`);
    ws.onopen = () => console.log('WebSocket connected');
    ws.onclose = () => console.log('WebSocket disconnected');
    ws.addEventListener("message", (event) => {
      console.log("Message from server ", event.data);
    });
    setInterval(() => {
      if (ws.readyState !== ws.OPEN) {
        return
      }

      const player: Player = {
        ID: "",
        X: mainScene.characterPosition.x,
        Y: mainScene.characterPosition.y,
        Z: mainScene.characterPosition.z,
      }
      ws.send(JSON.stringify(player))
    }, 100);
  }

  function initBabylon() : () => void {
    console.log("Initiating main scene")
    const { current: canvas } = reactCanvas;
    if (!canvas) return;

    const engine = new BABYLON.Engine(canvas, true);
    const scene = mainScene.createScene(engine); //Call the createScene function
    let lastServerSync = new Date(0).getTime();

    engine.runRenderLoop(() => {
      const now = new Date().getTime();
      if ((now - lastServerSync) > 100) {
        console.log(mainScene.characterPosition.x);
        lastServerSync = now;
      }
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
      scene.getEngine().dispose();

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
