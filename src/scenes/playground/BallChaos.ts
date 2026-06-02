import * as BABYLON from "@babylonjs/core";
import { PlaygroundAction, type PlaygroundActionContext, type PlaygroundActionObject } from "./types";
import { PlayerCharacter } from "../player";

export class BallChaos extends PlaygroundAction {
  constructor(context: PlaygroundActionContext) {
    super(context);
  }

  run(scene: BABYLON.Scene, _player: PlayerCharacter | undefined, object: PlaygroundActionObject) {
    const center = object.mesh.getAbsolutePosition();
    for (const body of this.context.dynamicBodies) {
      const pos = body.transformNode.getAbsolutePosition();
      if (BABYLON.Vector3.Distance(pos, center) < 8) {
        const impulse = new BABYLON.Vector3((Math.random() - 0.5) * 4, 4 + Math.random() * 4, (Math.random() - 0.5) * 4);
        this.context.applyImpulseToBody(body, impulse);
      }
    }
    this.context.burstConfetti(scene, center.add(new BABYLON.Vector3(0, 1, 0)), 120);
  }
}
