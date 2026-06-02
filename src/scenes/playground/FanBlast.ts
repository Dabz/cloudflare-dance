import * as BABYLON from "@babylonjs/core";
import type { PlayerCharacter } from "../player";
import type { PlaygroundActionContext, PlaygroundActionObject } from "./types";
import { PlaygroundAction } from "./types";

export class FanBlast extends PlaygroundAction {
  constructor(context: PlaygroundActionContext) {
    super(context);
  }

  run(_scene: BABYLON.Scene, player: PlayerCharacter | undefined, object: PlaygroundActionObject) {
    const direction = object.mesh.getDirection(BABYLON.Axis.X).normalize().add(new BABYLON.Vector3(0, 0.35, 0));
    player?.characterController.setVelocity(direction.scale(12));
    for (const body of this.context.fanBodies) this.context.applyImpulseToBody(body, direction.scale(1.5));
  }
}
