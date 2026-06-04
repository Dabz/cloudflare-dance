/* eslint-disable @typescript-eslint/no-unused-vars */
import * as BABYLON from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "../../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

import "@babylonjs/loaders/glTF";
import type { Player } from "../../worker/model/player";
import { PlayerCharacter } from "./player";

export class MainScene {
  mainPlayer: PlayerCharacter;
  _otherPlayers: { [key: string]: PlayerCharacter } = {};
  otherPlayers: Player[] = [];

  _scene: BABYLON.Scene;
  _camera: BABYLON.FollowCamera;

  public async createScene(engine: BABYLON.Engine, mainPlayer?: Player ): Promise<BABYLON.Scene> {
    if (this._scene) this.dispose();
    const scene = new BABYLON.Scene(engine);
    this._scene = scene;
    this._camera = new BABYLON.FollowCamera(
      "camera1",
      new BABYLON.Vector3(0, 10, -10),
      scene,
    );
    const light = new BABYLON.HemisphericLight(
      "light",
      new BABYLON.Vector3(0, 1, 0),
      scene,
    );

    this._camera.radius = 15;
    this._camera.heightOffset = 4;
    this._camera.rotationOffset = 180;
    this._camera.cameraAcceleration = 0.05;
    this._camera.maxCameraSpeed = 20;

    light.intensity = 0.7;
    const havokInterface = await HavokPhysics({ locateFile: () => havokWasmUrl });
    if (this._scene !== scene) return scene;

    const hk = new BABYLON.HavokPlugin(undefined, havokInterface);
    scene.enablePhysics(new BABYLON.Vector3(0, -9.8, 0), hk);
    await BABYLON.ImportMeshAsync("/level.glb", scene);
    if (this._scene !== scene) return scene;

    const lightmap = new BABYLON.Texture("/lightmap.jpg");
    const lightmapped = [
       "level_primitive0",
       "level_primitive1",
       "level_primitive2"
    ];

    lightmapped.forEach((meshName) => {
      const mesh = scene.getMeshByName(meshName);
      new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.MESH);
      mesh.isPickable = false;
      mesh.material.lightmapTexture = lightmap;
      mesh.material.useLightmapAsShadowmap = true;
      mesh.material.lightmapTexture.uAng = Math.PI;
      mesh.material.lightmapTexture.level = 1.6;
      mesh.material.lightmapTexture.coordinatesIndex = 1;
      mesh.freezeWorldMatrix();
      mesh.doNotSyncBoundingInfo = true;
    });
    const cubes = [
      "Cube",
      "Cube.001",
      "Cube.002",
      "Cube.003",
      "Cube.004",
      "Cube.005",
    ];
    cubes.forEach((meshName) => {
      new BABYLON.PhysicsAggregate(
        scene.getMeshByName(meshName),
        BABYLON.PhysicsShapeType.BOX,
        { mass: 0.1 },
      );
    });

    const planeMesh = scene.getMeshByName("Cube.006");
    planeMesh.scaling.set(0.03, 3, 1);
   const fixedMass = new BABYLON.PhysicsAggregate(
     scene.getMeshByName("Cube.007"),
     BABYLON.PhysicsShapeType.BOX,
     { mass: 0 },
   );
   const plane = new BABYLON.PhysicsAggregate(
     planeMesh,
     BABYLON.PhysicsShapeType.BOX,
     { mass: 0.1 },
   );

   const joint = new BABYLON.HingeConstraint(
     new BABYLON.Vector3(0.75, 0, 0),
     new BABYLON.Vector3(-0.25, 0, 0),
     new BABYLON.Vector3(0, 0, -1),
     new BABYLON.Vector3(0, 0, 1),
     scene,
   );
   fixedMass.body.addConstraint(plane.body, joint);

    if (mainPlayer) {
      this.addMainPlayer(mainPlayer);
    }

    return scene;
  }

  public addMainPlayer(player: Player) {
    this.mainPlayer = PlayerCharacter.createPlayer(true, player.id, this._scene);
    if (player.x != null && player.y != null && player.z != null) {
      this.mainPlayer.updatePosition(new BABYLON.Vector3(player.x, player.y, player.z))
    }
    if (player.rotationY != null) {
      this.mainPlayer.updateRotation(player.rotationY, false);
    }
    this._camera.setTarget(this.mainPlayer.characterPosition);
    this.mainPlayer.addListenersToKeyboardAndMouse(this._scene, this._camera);

    // Display tick update: compute new camera position/target, update the capsule for the character display
    this._scene.onBeforeRenderObservable.add((scene: BABYLON.Scene) => {
      this.mainPlayer.beforeRender(scene, this._camera);
    });

    // After physics update, compute and set new velocity, update the character controller state
    this._scene.onAfterPhysicsObservable.add((_) => {
      this.mainPlayer.afterPhysics(this._scene, this._camera);
    });
  }

  public dispose() {
    if (this._scene) {
      this._scene.dispose();
      this._scene = null;
    }
  }

  public resize() {
    this._scene?.getEngine().resize();
  }

  public updatePlayerPosition(nextPlayers: Player[]) {
    if (!this._scene) return;
    const currentOtherPlayersMeshName = Object.keys(this._otherPlayers);
    const nextOtherPlayerIds = [];

    for (const otherPlayer of nextPlayers) {
      // Skipping if trying to update main player
      if (otherPlayer.id === this.mainPlayer.id) { 
        continue;
      }

      nextOtherPlayerIds.push(otherPlayer.id);
      // If other player meshes doesn't exist; let's create it
      if (currentOtherPlayersMeshName.indexOf(otherPlayer.id) == -1) {
        const otherPlayerCharacter = PlayerCharacter.createPlayer(
          false,
          otherPlayer.id,
          this._scene,
          otherPlayer,
        );
        this._otherPlayers[otherPlayer.id] = otherPlayerCharacter;
        continue;
      }

      // Updates other player meshes position
      const otherPlayerCharacter = this._otherPlayers[otherPlayer.id];
      otherPlayerCharacter.updatePosition(
        new BABYLON.Vector3(otherPlayer.x, otherPlayer.y, otherPlayer.z),
      );
      otherPlayerCharacter.updateRotation(otherPlayer.rotationY ?? 0);
    }

    // Check if there are meshes to delete
    for (const otherMeshPlayer of currentOtherPlayersMeshName) {
      if (nextOtherPlayerIds.indexOf(otherMeshPlayer) == -1) {
        const otherPlayer = this._otherPlayers[otherMeshPlayer];
        otherPlayer.dispose();
        delete this._otherPlayers[otherMeshPlayer];
      }
    }
  }

  public render() {
    this._scene?.render();
  }
}
