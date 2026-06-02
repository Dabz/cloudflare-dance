import * as BABYLON from "@babylonjs/core";
import type {PlayerCharacter} from "../player";
import {PlaygroundAction, type PlaygroundActionContext, type PlaygroundActionObject} from "./types";


export class Teleport extends PlaygroundAction {
  constructor(context: PlaygroundActionContext) {
    super(context);
  }

  run(scene: BABYLON.Scene, player: PlayerCharacter | undefined, _object: PlaygroundActionObject) {
    if (!player) return;
    player.updatePosition(this.context.pickTeleportDestination());
    this.context.burstConfetti(scene, player.character.getAbsolutePosition(), 90);
  }
}

