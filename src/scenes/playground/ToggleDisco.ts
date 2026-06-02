import * as BABYLON from "@babylonjs/core";
import { PlaygroundAction, type PlaygroundActionContext, type PlaygroundActionObject } from "./types";

export class ToggleDisco extends PlaygroundAction {
  constructor(context: PlaygroundActionContext) {
    super(context);
  }

  run(scene: BABYLON.Scene, _player: undefined, object: PlaygroundActionObject) {
    const enabled = this.context.toggleDisco();
    this.applyEnabled(enabled);
    this.context.burstConfetti(scene, object.mesh.getAbsolutePosition().add(new BABYLON.Vector3(0, 1, 0)), 90);
  }

  getState() {
    return { enabled: this.context.isDiscoEnabled() };
  }

  applyState(state: unknown) {
    if (!state || typeof state !== "object" || !("enabled" in state)) return;

    this.applyEnabled(Boolean((state as { enabled: unknown }).enabled));
  }

  private applyEnabled(enabled: boolean) {
    this.context.setDiscoEnabled(enabled);
    this.context.discoLights.forEach((light) => light.setEnabled(enabled));
  }
}
