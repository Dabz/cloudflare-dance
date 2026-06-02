import * as BABYLON from "@babylonjs/core";
import type { PlayerCharacter } from "../player";

export interface PlaygroundActionObject {
  mesh: BABYLON.AbstractMesh;
  id: string;
  objectId: string;
}

export class PlaygroundAction {
  context: PlaygroundActionContext;

  constructor(context: PlaygroundActionContext) {
    this.context = context;
  }
  run(scene: BABYLON.Scene, player: PlayerCharacter | undefined, object: PlaygroundActionObject): void {
    void scene;
    void player;
    void object;

    throw new Error("Not implemented");
  }

  getState(): unknown {
    return undefined;
  }

  applyState(_state: unknown, _object: PlaygroundActionObject): void {
    void _state;
    void _object;
    return;
  }
}

export interface PlaygroundActionContext {
  dynamicBodies: BABYLON.PhysicsAggregate[];
  fanBodies: BABYLON.PhysicsAggregate[];
  discoLights: BABYLON.DirectionalLight[];
  createMaterial(name: string, scene: BABYLON.Scene, color: BABYLON.Color3, emissive?: boolean): BABYLON.StandardMaterial;
  randomColor(): BABYLON.Color3;
  setMeshColor(mesh: BABYLON.AbstractMesh, color: BABYLON.Color3): void;
  applyImpulseToBody(aggregate: BABYLON.PhysicsAggregate, impulse: BABYLON.Vector3): void;
  makeCollidable(mesh: BABYLON.AbstractMesh): BABYLON.AbstractMesh;
  addShadowCaster(mesh?: BABYLON.AbstractMesh | null): void;
  registerProjectile(mesh: BABYLON.AbstractMesh, ownerId?: string): void;
  publishInteraction(actionId: string, objectId: string, objectState?: unknown): void;
  updateAimCamera(position: BABYLON.Vector3, target: BABYLON.Vector3): void;
  clearAimCamera(): void;
  burstConfetti(scene: BABYLON.Scene, position: BABYLON.Vector3, count: number): void;
  ensureDynamicBody(mesh: BABYLON.AbstractMesh, mass: number, shape: BABYLON.PhysicsShapeType): BABYLON.PhysicsAggregate;
  pickTeleportDestination(): BABYLON.Vector3;
  nextLaunchCount(): number;
  toggleDisco(): boolean;
  setDiscoEnabled(enabled: boolean): void;
  isDiscoEnabled(): boolean;
  enableDisco(): void;
  toggleMerrySpeed(): void;
  setMerrySpeed(speed: number): void;
  getMerrySpeed(): number;
  setLowGravityUntil(value: number): void;
  createDiscoLight(scene: BABYLON.Scene, index: number, color?: BABYLON.Color3): BABYLON.DirectionalLight;
}
