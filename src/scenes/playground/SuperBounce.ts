import * as BABYLON from "@babylonjs/core";
import { PlaygroundAction, type PlaygroundActionContext, type PlaygroundActionObject } from "./types";
import type { PlayerCharacter } from "../player";

export class SuperBounce extends PlaygroundAction {
  constructor(context: PlaygroundActionContext) {
    super(context);
  }

  run(scene: BABYLON.Scene, player: PlayerCharacter | undefined, object: PlaygroundActionObject) {
    player?.characterController.setVelocity(new BABYLON.Vector3(0, 16, 0));
    this.context.burstConfetti(scene, object.mesh.getAbsolutePosition().add(new BABYLON.Vector3(0, 1, 0)), 70);
  }
}
