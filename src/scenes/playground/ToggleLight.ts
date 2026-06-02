import * as BABYLON from "@babylonjs/core";
import { PlaygroundAction, type PlaygroundActionContext, type PlaygroundActionObject } from "./types";

const neonColors = [
  new BABYLON.Color3(1, 0.12, 0.2),
  new BABYLON.Color3(0.15, 0.85, 1),
  new BABYLON.Color3(0.95, 0.95, 0.12),
  new BABYLON.Color3(0.25, 1, 0.35),
  new BABYLON.Color3(0.9, 0.2, 1),
  new BABYLON.Color3(1, 0.52, 0.08),
];

export class ToggleLight extends PlaygroundAction {
  private light: BABYLON.DirectionalLight;
  private color: BABYLON.Color3;
  private enabled = true;

  constructor(context: PlaygroundActionContext, id: string, mesh: BABYLON.AbstractMesh) {
    super(context);
    const index = Number(id.replace("toggle-light-", "")) || 0;
    this.color = neonColors[index + 1] ?? neonColors[index % neonColors.length];
    this.light = context.createDiscoLight(mesh, index, this.color);
    context.discoLights.push(this.light);
  }

  run(_scene: BABYLON.Scene, _player: undefined, object: PlaygroundActionObject) {
    this.applyEnabled(!this.enabled, object);
  }

  getState() {
    return { enabled: this.enabled };
  }

  applyState(state: unknown, object: PlaygroundActionObject) {
    if (!state || typeof state !== "object" || !("enabled" in state)) return;

    this.applyEnabled(Boolean((state as { enabled: unknown }).enabled), object);
  }

  private applyEnabled(enabled: boolean, object: PlaygroundActionObject) {
    this.enabled = enabled;
    this.light.setEnabled(enabled);
    this.context.setMeshColor(object.mesh, enabled ? this.color : new BABYLON.Color3(0.04, 0.04, 0.06));
  }
}
