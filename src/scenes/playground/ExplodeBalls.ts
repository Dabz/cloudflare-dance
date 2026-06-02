import * as BABYLON from "@babylonjs/core";
import type { PlayerCharacter } from "../player";
import { PlaygroundAction, type PlaygroundActionContext, type PlaygroundActionObject } from "./types";

export class ExplodeBalls extends PlaygroundAction {
  constructor(context: PlaygroundActionContext) {
    super(context);
  }

  run(scene: BABYLON.Scene, player: PlayerCharacter | undefined, object: PlaygroundActionObject) {
    const launchCount = this.context.nextLaunchCount();
    this.context.burstConfetti(scene, object.mesh.getAbsolutePosition().add(new BABYLON.Vector3(0, 1.2, 0)), 160);
    for (let i = 0; i < 50; i++) {
      const ball = BABYLON.MeshBuilder.CreateSphere(`explode_launched_goof_${launchCount}_${i}`, { diameter: 0.62, segments: 18 }, scene);
      const direction = object.mesh.getDirection(BABYLON.Axis.Y).normalize();
      ball.position = object.mesh.getAbsolutePosition().add(direction.scale(1.2)).add(new BABYLON.Vector3(0, 0.2, 0));
      this.context.makeCollidable(ball);
      ball.material = this.context.createMaterial(`explode_launched_goof_${launchCount}_${i}_mat`, scene, this.context.randomColor(), true);
      const aggregate = new BABYLON.PhysicsAggregate(ball, BABYLON.PhysicsShapeType.SPHERE, { mass: 0.36, restitution: 0.9, friction: 0.22 });
      this.context.applyImpulseToBody(aggregate, direction.add(new BABYLON.Vector3(0, 0.16, 0)).normalize().scale(13));
      this.context.dynamicBodies.push(aggregate);
      this.context.fanBodies.push(aggregate);
      this.context.addShadowCaster(ball);
      this.context.registerProjectile(ball, player?.id);
    }
  }
}
