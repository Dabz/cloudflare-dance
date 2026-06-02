import * as BABYLON from "@babylonjs/core";
import { PlaygroundAction, type PlaygroundActionContext, type PlaygroundActionObject } from "./types";
import { PlayerCharacter } from "../player";

export class BonkToys extends PlaygroundAction {
  constructor(context: PlaygroundActionContext) {
    super(context);
  }

  run(scene: BABYLON.Scene, player: PlayerCharacter | undefined, object: PlaygroundActionObject) {
    const origin = player?.character.getAbsolutePosition() ?? object.mesh.getAbsolutePosition();
    for (const body of this.context.dynamicBodies) {
      const pos = body.transformNode.getAbsolutePosition();
      const delta = pos.subtract(origin);
      if (delta.length() < 6) this.context.applyImpulseToBody(body, delta.normalize().scale(7).add(new BABYLON.Vector3(0, 3.5, 0)));
    }
    this.context.burstConfetti(scene, origin.add(new BABYLON.Vector3(0, 1, 0)), 80);
  }
}
