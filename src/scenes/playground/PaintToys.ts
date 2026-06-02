import * as BABYLON from "@babylonjs/core";
import { PlaygroundAction, type PlaygroundActionContext, type PlaygroundActionObject } from "./types";

export class PaintToys extends PlaygroundAction {
  constructor(context: PlaygroundActionContext) {
    super(context);
  }

  run(scene: BABYLON.Scene, _player: undefined, object: PlaygroundActionObject) {
    this.context.dynamicBodies.forEach((body) => this.context.setMeshColor(body.transformNode as BABYLON.AbstractMesh, this.context.randomColor()));
    this.context.burstConfetti(scene, object.mesh.getAbsolutePosition().add(new BABYLON.Vector3(0, 1, 0)), 150);
  }
}
