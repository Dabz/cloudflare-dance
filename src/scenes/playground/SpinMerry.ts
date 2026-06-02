import * as BABYLON from "@babylonjs/core";
import { PlaygroundAction, type PlaygroundActionContext, type PlaygroundActionObject } from "./types";

export class SpinMerry extends PlaygroundAction {
  constructor(context: PlaygroundActionContext) {
    super(context);
  }

  run(_scene: BABYLON.Scene, _player: undefined, _object: PlaygroundActionObject) {
    this.context.toggleMerrySpeed();
  }

  getState() {
    return { speed: this.context.getMerrySpeed() };
  }

  applyState(state: unknown) {
    if (!state || typeof state !== "object" || !("speed" in state)) return;
    const speed = Number((state as { speed: unknown }).speed);
    if (Number.isFinite(speed)) this.context.setMerrySpeed(speed);
  }
}
