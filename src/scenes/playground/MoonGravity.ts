import * as BABYLON from "@babylonjs/core";
import { PlaygroundAction, type PlaygroundActionContext, type PlaygroundActionObject } from "./types";

export class MoonGravity extends PlaygroundAction {
  constructor(context: PlaygroundActionContext) {
    super(context);
  }

  run(scene: BABYLON.Scene, _player: undefined, object: PlaygroundActionObject) {
    scene.getPhysicsEngine()?.setGravity(new BABYLON.Vector3(0, -2.2, 0));
    this.context.setLowGravityUntil(Date.now() + 9000);
    this.context.dynamicBodies.forEach((body) => this.context.applyImpulseToBody(body, new BABYLON.Vector3(0, 2.5, 0)));
    this.context.burstConfetti(scene, object.mesh.getAbsolutePosition().add(new BABYLON.Vector3(0, 1, 0)), 100);
  }
}
