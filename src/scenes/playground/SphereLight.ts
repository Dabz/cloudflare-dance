import * as BABYLON from "@babylonjs/core";
import { PlaygroundAction, type PlaygroundActionObject } from "./types";

export class SphereLight extends PlaygroundAction {
  private light?: BABYLON.PointLight;
  private enabled = false;
  private originalMaterial?: BABYLON.Nullable<BABYLON.Material>;

  run(scene: BABYLON.Scene, _player: undefined, object: PlaygroundActionObject) {
    this.applyEnabled(!this.enabled, object, scene);
  }

  getState() {
    return { enabled: this.enabled };
  }

  applyState(state: unknown, object: PlaygroundActionObject) {
    if (!state || typeof state !== "object" || !("enabled" in state)) return;

    this.applyEnabled(Boolean((state as { enabled: unknown }).enabled), object, object.mesh.getScene());
  }

  private applyEnabled(enabled: boolean, object: PlaygroundActionObject, scene: BABYLON.Scene) {
    this.enabled = enabled;
    const mesh = object.mesh;

    if (!this.originalMaterial) this.originalMaterial = mesh.material;
    if (!this.light) {
      this.light = new BABYLON.PointLight(`${mesh.name}_sphere_light`, mesh.getAbsolutePosition(), scene);
      this.light.diffuse = new BABYLON.Color3(1, 0.86, 0.28);
      this.light.specular = new BABYLON.Color3(1, 0.95, 0.75);
      this.light.range = 18;
    }

    this.light.setEnabled(this.enabled);
    this.light.intensity = this.enabled ? 18 : 0;

    if (this.enabled) {
      const material = new BABYLON.StandardMaterial(`${mesh.name}_emissive_light_material`, scene);
      material.diffuseColor = new BABYLON.Color3(1, 0.82, 0.18);
      material.emissiveColor = new BABYLON.Color3(4, 3.1, 0.75);
      material.specularColor = new BABYLON.Color3(1, 1, 1);
      mesh.material = material;
      return;
    }

    mesh.material = this.originalMaterial;
  }
}
