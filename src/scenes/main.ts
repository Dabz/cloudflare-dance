/* eslint-disable @typescript-eslint/no-unused-vars */
import * as BABYLON from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "../../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

import "@babylonjs/loaders/glTF";
import type { Player } from "../../worker/model/player";
import { type CharacterName, PlayerCharacter } from "./player";
import {TV} from "./tv";
import {MeshCache} from "./cache";
import {Playground} from "./playground";
import { DdosMinigame } from "./minigames/DdosMinigame";
import { FixPopMinigame } from "./minigames/FixPopMinigame";
import type { DdosMinigameState, FixPopMinigameState } from "../../worker/model/gameroom";

export type InteractEventType = "none" | "tv-interact" | "tv-leave" | "player-dance" | "playground-interact" | "minigame-hit";
export interface PlaygroundInteractEventPayload {
  actionId?: string;
  objectId?: string;
  objectState?: unknown;
  botId?: string;
}

export type InteractionSubscriber = (event: InteractEventType, payload?: PlaygroundInteractEventPayload) => void;
export type LoadingProgressSubscriber = (progress: number) => void;


export class MainScene {
  mainPlayer: PlayerCharacter;
  tv: TV;
  playground: Playground;
  ddosMinigame?: DdosMinigame;
  fixPopMinigame?: FixPopMinigame;
  _otherPlayers: { [key: string]: PlayerCharacter } = {};
  otherPlayers: Player[] = [];
  _shadowGenerator?: BABYLON.ShadowGenerator;
  _sunLight?: BABYLON.DirectionalLight;
  _sunFillLight?: BABYLON.HemisphericLight;
  _sunLightSphere?: BABYLON.Mesh;

  _scene: BABYLON.Scene;
  _camera: BABYLON.ArcFollowCamera;
  private onInteract?: InteractionSubscriber;

  constructor(onInteract?: InteractionSubscriber) {
    this.onInteract = onInteract;
  }


  public async createScene(engine: BABYLON.Engine, mainPlayer?: Player, onLoadingProgress?: LoadingProgressSubscriber ): Promise<BABYLON.Scene> {
    if (this._scene) this.dispose();
    onLoadingProgress?.(3);
    const scene = new BABYLON.Scene(engine);
    scene.shadowsEnabled = true;
    scene.collisionsEnabled = true;
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
    let lastOnLoadingProgress = 0;
    onLoadingProgress?.(0);

    const hk = new BABYLON.HavokPlugin(undefined, havokInterface);
    scene.enablePhysics(new BABYLON.Vector3(0, -9.8, 0), hk);
    const reportAssetProgress = (start: number, end: number) => (event: { loaded?: number; total?: number; lengthComputable?: boolean }) => {
      const total = event.total ?? 0;
      const loaded = event.loaded ?? 0;
      const ratio = total > 0 ? Math.min(1, loaded / total) : 0;
      const newProgress = Math.round(start + (end - start) * ratio);
      if (newProgress > lastOnLoadingProgress) {
        onLoadingProgress?.(newProgress);
        lastOnLoadingProgress = newProgress;
      }
    };
    const characterNames = [
      "characterY",
      "josh",
      "megan"
    ]
    let i = 0;
    const step = 50 / characterNames.length;
    for (const characterName of characterNames) {
      MeshCache[characterName] = await BABYLON.LoadAssetContainerAsync(`/characters/${characterName}/${characterName}.gltf`, scene, {
        onProgress: reportAssetProgress(i * step, (i + 1) * step ),
      })
      i += 1;
    }
    await BABYLON.ImportMeshAsync("/levels/1/level.gltf", scene, {
      onProgress: reportAssetProgress(50, 92),
    });

    if (this._scene !== scene) return scene;
    onLoadingProgress?.(96);
    scene.meshes.forEach((mesh) => this.addShadowReceiver(mesh));
    this.addSky(scene);

    this._scene.meshes.forEach((mesh) => {
      if (mesh.name.startsWith("Cube") || mesh.name.startsWith("Sphere")) {
        new BABYLON.PhysicsAggregate(
          mesh,
          BABYLON.PhysicsShapeType.BOX,
          { mass: 0.1 },
        );   
        mesh.checkCollisions = true;
        this.addShadowCaster(mesh);
      } else if (mesh.name.startsWith("TV") || mesh.name.startsWith("Icosphere") || mesh.name.startsWith("Wall")) {
        new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.MESH);
        mesh.checkCollisions = true;
        mesh.isPickable = false;
        mesh.freezeWorldMatrix()
        mesh.doNotSyncBoundingInfo = true;

        this.addShadowCaster(mesh);
      } else if (mesh.name.startsWith("floor") || mesh.name.startsWith("Ground") ||  mesh.name.startsWith("Cube")) {
        new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.MESH);
        mesh.checkCollisions = true;
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
    this.ddosMinigame = new DdosMinigame(scene, (botId) => {
      this.onInteract?.("minigame-hit", { botId });
    });
    this.fixPopMinigame = new FixPopMinigame(scene);
    this.addPlayground(scene);

    if (mainPlayer) {
      this.addMainPlayer(mainPlayer);
    }

    onLoadingProgress?.(100);

    return scene;
  }
  public addTV(scene: BABYLON.Scene) {
    this.tv = new TV(this.onInteract);
    this.tv.init(scene);
    this._scene.onBeforeRenderObservable.add((scene: BABYLON.Scene) => {
      this.tv.beforeRender(scene, this._camera, this.mainPlayer);
    });
  }

  public addPlayground(scene: BABYLON.Scene) {
    this.playground = new Playground((mesh) => this.addShadowCaster(mesh), (actionId, objectId, objectState) => {
      this.onInteract?.("playground-interact", { actionId, objectId, objectState });
    }, (mesh, ownerId) => {
      this.ddosMinigame?.registerProjectile(mesh, ownerId);
    }, (position, target) => {
      this._camera.setMeshTarget(null);
      this._camera.position.copyFrom(position);
      this._camera.setTarget(target);
    }, () => {
      if (!this.mainPlayer) return;
      this._camera.setMeshTarget(this.mainPlayer.character);
      this._camera.setTarget(this.mainPlayer.characterPosition);
    });
    this.playground.init(scene);
    this._scene.onBeforeRenderObservable.add((scene: BABYLON.Scene) => {
      this.playground.beforeRender(scene, this.mainPlayer);
      this.ddosMinigame?.beforeRender();
      this.fixPopMinigame?.beforeRender();
    });
  }

  public applyMinigameState(state?: DdosMinigameState) {
    this.ddosMinigame?.applyState(state);
  }

  public applyFixPopMinigameState(state?: FixPopMinigameState) {
    this.fixPopMinigame?.applyState(state);
  }

  public interactWithPlayground(actionId: string, playerId: string, objectId?: string, objectState?: unknown) {
    const player = this.mainPlayer?.id === playerId
      ? this.mainPlayer
      : this._otherPlayers[playerId];
      this.playground?.interact(actionId, player, objectId, objectState);
  }

  public applyPlaygroundObjectStates(states: Record<string, unknown> = {}) {
    this.playground?.applyObjectStates(states);
  }

  public addMainPlayer(player: Player) {
    if (this.mainPlayer) {
      return;
    }
    this.mainPlayer = PlayerCharacter.createPlayer(true, player.id, this._scene, player);
    this.mainPlayer.onInteract = this.onInteract;
    this.ddosMinigame?.setLocalPlayerId(this.mainPlayer.id);
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

    // Display tick update: compute new camera position/target, update the character display
    this._scene.onBeforeRenderObservable.add((scene: BABYLON.Scene) => {
      this.mainPlayer.beforeRender(scene, this._camera);
      for (const otherPlayer of Object.values(this._otherPlayers)) {
        otherPlayer.beforeRender(scene, this._camera);
      }
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

    this.ddosMinigame?.dispose();
    this.ddosMinigame = undefined;
    this.fixPopMinigame?.dispose();
    this.fixPopMinigame = undefined;

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

  public setMainPlayerMoveInput(x: number, z: number) {
    this.mainPlayer?.setMoveInput(x, z);
  }

  public setMainPlayerCharacter(character: CharacterName) {
    if (!this.mainPlayer?.changeCharacter(character)) return;

    this.addShadowCaster(this.mainPlayer.character);
    this._camera.setMeshTarget(this.mainPlayer.character);
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
      if (otherPlayer.character && otherPlayerCharacter.characterName !== otherPlayer.character) {
        otherPlayerCharacter.updateCharacter(otherPlayer.character);
        this.addShadowCaster(otherPlayerCharacter.character);
      }
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
    light.intensity = 0.75;
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
    fillLight.intensity = 0.14;
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
    const skyName = "blueSky";
    scene.clearColor = new BABYLON.Color4(0.62, 0.82, 1, 1);

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

    const skyTexture = new BABYLON.DynamicTexture(`${skyName}Texture`, { width: 1024, height: 512 }, scene);
    const context = skyTexture.getContext() as CanvasRenderingContext2D;
    const gradient = context.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, "#2f7eea");
    gradient.addColorStop(0.45, "#7fc9ff");
    gradient.addColorStop(0.78, "#d8f3ff");
    gradient.addColorStop(1, "#f6fbff");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1024, 512);

    context.fillStyle = "rgba(255, 255, 255, 0.74)";
    for (const [x, y, scale] of [[140, 150, 1.05], [330, 105, 0.72], [570, 165, 0.9], [850, 125, 0.82]] as const) {
      context.beginPath();
      context.ellipse(x, y, 70 * scale, 24 * scale, 0, 0, Math.PI * 2);
      context.ellipse(x + 48 * scale, y + 8 * scale, 58 * scale, 20 * scale, 0, 0, Math.PI * 2);
      context.ellipse(x - 45 * scale, y + 9 * scale, 46 * scale, 16 * scale, 0, 0, Math.PI * 2);
      context.fill();
    }
    skyTexture.update();
    skyTexture.coordinatesMode = BABYLON.Texture.SPHERICAL_MODE;
    skyTexture.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
    skyTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

    const skyMaterial = new BABYLON.StandardMaterial(`${skyName}Material`, scene);
    skyMaterial.diffuseTexture = skyTexture;
    skyMaterial.emissiveTexture = skyTexture;
    skyMaterial.emissiveColor = new BABYLON.Color3(1, 1, 1);
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
