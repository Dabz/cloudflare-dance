/* eslint-disable @typescript-eslint/no-unused-vars */
import * as BABYLON from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "../../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

import "@babylonjs/loaders/glTF";
import type { Player } from "../../worker/model/player";
import { PlayerCharacter } from "./player";
import {TV} from "./tv";

export class MainScene {
  mainPlayer: PlayerCharacter;
  tv: TV;
  _otherPlayers: { [key: string]: PlayerCharacter } = {};
  otherPlayers: Player[] = [];
  _shadowGenerator?: BABYLON.ShadowGenerator;
  _sunLight?: BABYLON.DirectionalLight;
  _sunFillLight?: BABYLON.HemisphericLight;
  _sunLightSphere?: BABYLON.Mesh;

  _scene: BABYLON.Scene;
  _camera: BABYLON.ArcFollowCamera;

  public async createScene(engine: BABYLON.Engine, mainPlayer?: Player ): Promise<BABYLON.Scene> {
    if (this._scene) this.dispose();
    const scene = new BABYLON.Scene(engine);
    scene.shadowsEnabled = true;
    this._scene = scene;
    this._camera = new BABYLON.ArcFollowCamera(
      "camera1",
      0,
      Math.PI * 0.3,
      6,
      null,
      scene,
    );

    const light = this.addSunLight(scene);
    this._shadowGenerator = new BABYLON.ShadowGenerator(1024, light);
    this._shadowGenerator.usePercentageCloserFiltering = true;
    this._shadowGenerator.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    this._shadowGenerator.darkness = 0.35;

    const havokInterface = await HavokPhysics({ locateFile: () => havokWasmUrl });
    if (this._scene !== scene) return scene;

    const hk = new BABYLON.HavokPlugin(undefined, havokInterface);
    scene.enablePhysics(new BABYLON.Vector3(0, -9.8, 0), hk);
    await BABYLON.ImportMeshAsync("/level.glb", scene);
    if (this._scene !== scene) return scene;
    scene.meshes.forEach((mesh) => this.addShadowReceiver(mesh));
    this.addSky(scene);

    this._scene.meshes.forEach((mesh) => {
      if (mesh.name.startsWith("Cube") || mesh.name.startsWith("Sphere")) {
        new BABYLON.PhysicsAggregate(
          mesh,
          BABYLON.PhysicsShapeType.BOX,
          { mass: 0.1 },
        );   
        this.addShadowCaster(mesh);
      } else if (mesh.name.startsWith("TV") || mesh.name.startsWith("Icosphere") || mesh.name.startsWith("Wall")) {
        new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.MESH);
        mesh.isPickable = false;
        mesh.freezeWorldMatrix()
        mesh.doNotSyncBoundingInfo = true;

        this.addShadowCaster(mesh);
      } else if (mesh.name.startsWith("floor") || mesh.name.startsWith("Ground") ||  mesh.name.startsWith("Cube")) {
        new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.MESH);
      }
    });

    const planeMesh = scene.getMeshByName("Cube.006");
    if (planeMesh) {
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
    }

    this.addTV(scene);

    if (mainPlayer) {
      this.addMainPlayer(mainPlayer);
    }

    return scene;
  }
  public addTV(scene: BABYLON.Scene) {
    this.tv = new TV();
    this.tv.init(scene);
    this._scene.onBeforeRenderObservable.add((scene: BABYLON.Scene) => {
      this.tv.beforeRender(scene, this._camera, this.mainPlayer);
    });
  }

  public addMainPlayer(player: Player) {
    if (this.mainPlayer) {
      return;
    }
    this.mainPlayer = PlayerCharacter.createPlayer(true, player.id, this._scene);
    this.addShadowCaster(this.mainPlayer.character);
    this._camera.setMeshTarget(this.mainPlayer.character)
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

    this._sunLight = undefined;
    this._sunFillLight = undefined;
    this._sunLightSphere = undefined;
  }

  public resize() {
    this._scene?.getEngine().resize();
  }

  public resetMainPlayerPosition() {
    if (!this.mainPlayer) return;

    this.mainPlayer.resetPosition();
    this._camera.setTarget(this.mainPlayer.characterPosition);
  }

  public danceMainPlayer() {
    this.mainPlayer?.dance();
  }

  public dancePlayer(playerId: string) {
    if (this.mainPlayer?.id === playerId) {
      this.mainPlayer.dance();
      return;
    }

    this._otherPlayers[playerId]?.dance();
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
        this.addShadowCaster(otherPlayerCharacter.character);
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

  private addSunLight(scene: BABYLON.Scene) {
    const light = new BABYLON.DirectionalLight("sunLight", BABYLON.Vector3.Zero(), scene);
    light.position = new BABYLON.Vector3(28, 44, -24);
    light.setDirectionToTarget(new BABYLON.Vector3(0, 0, 0));
    light.intensity = 3.2;
    light.shadowMinZ = 1;
    light.shadowMaxZ = 120;
    light.orthoTop = 48;
    light.orthoBottom = -48;
    light.orthoLeft = -48;
    light.orthoRight = 48;
    this._sunLight = light;

    const fillLight = new BABYLON.HemisphericLight(
      "sunFillLight",
      new BABYLON.Vector3(0, 1, 0),
      scene,
    );
    fillLight.intensity = 0.55;
    fillLight.diffuse = new BABYLON.Color3(0.85, 0.9, 1);
    fillLight.groundColor = new BABYLON.Color3(0.22, 0.18, 0.14);
    this._sunFillLight = fillLight;

    const lightSphere = BABYLON.Mesh.CreateSphere("sunLightDisplay", 10, 2, scene);
    lightSphere.position = light.position;
    lightSphere.isPickable = false;
    const lightMaterial = new BABYLON.StandardMaterial("sunLightDisplayMaterial", scene);
    lightMaterial.emissiveColor = new BABYLON.Color3(1, 0.92, 0.45);
    lightSphere.material = lightMaterial;
    this._sunLightSphere = lightSphere;

    return light;
  }


  private addSky(scene: BABYLON.Scene) {
    const currentHour = new Date().getHours();
    const isSunlightTime = currentHour >= 6 && currentHour < 19;
    const skyName = isSunlightTime ? "daySky" : "nightSky";
    const skyTexturePath = isSunlightTime ? "/day-sky.svg" : "/night-sky.svg";

    const skyDome = BABYLON.MeshBuilder.CreateSphere(
      skyName,
      {
        diameter: 500,
        segments: 48,
        sideOrientation: BABYLON.Mesh.BACKSIDE,
      },
      scene,
    );
    skyDome.infiniteDistance = true;
    skyDome.isPickable = false;

    const skyTexture = new BABYLON.Texture(skyTexturePath, scene);
    skyTexture.coordinatesMode = BABYLON.Texture.SPHERICAL_MODE;
    skyTexture.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
    skyTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

    const skyMaterial = new BABYLON.StandardMaterial(`${skyName}Material`, scene);
    skyMaterial.diffuseTexture = skyTexture;
    skyMaterial.emissiveTexture = skyTexture;
    skyMaterial.emissiveColor = isSunlightTime
      ? new BABYLON.Color3(1, 1, 1)
      : new BABYLON.Color3(0.85, 0.9, 1);
      skyMaterial.specularColor = BABYLON.Color3.Black();
      skyMaterial.disableLighting = true;
      skyMaterial.backFaceCulling = false;

      skyDome.material = skyMaterial;
  }

  private addShadowCaster(mesh?: BABYLON.AbstractMesh | null) {
    if (!mesh || !this._shadowGenerator) return;

    this._shadowGenerator.addShadowCaster(mesh, true);
  }

  private addShadowReceiver(mesh?: BABYLON.AbstractMesh | null) {
    if (!mesh) return;

    mesh.receiveShadows = true;
    this._shadowGenerator.addShadowCaster(mesh);
  }

}
