import * as BABYLON from "@babylonjs/core";
import type { PlaygroundActionContext, PlaygroundActionObject } from "./types";
import { PlaygroundAction } from "./types";

export class Bowl extends PlaygroundAction {
  constructor(context: PlaygroundActionContext) {
    super(context);
  }

  run(_scene: BABYLON.Scene, _player: undefined, object: PlaygroundActionObject) {
    const aggregate = this.context.ensureDynamicBody(object.mesh, 1.4, BABYLON.PhysicsShapeType.SPHERE);
    aggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
    const direction = object.mesh.getDirection(BABYLON.Axis.Z).normalize();
    this.context.applyImpulseToBody(aggregate, direction.scale(-15).add(new BABYLON.Vector3(0, 0.4, 0)));
  }
}
