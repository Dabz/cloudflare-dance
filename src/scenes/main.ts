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
  _laptopScreenTexture?: BABYLON.DynamicTexture;
  _laptopVideoTexture?: BABYLON.VideoTexture;
  _laptopScreenMaterial?: BABYLON.StandardMaterial;
  _laptopUrl = "";
  _tvMesh?: BABYLON.AbstractMesh;
  _shadowGenerator?: BABYLON.ShadowGenerator;

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

    const light = new BABYLON.DirectionalLight("dir01", BABYLON.Vector3.Zero(), this._scene);
    light.position = new BABYLON.Vector3(12, 30, -12);
    light.setDirectionToTarget(new BABYLON.Vector3(0, 0, -4));
    light.intensity = 2;
    const lightSphere = BABYLON.Mesh.CreateSphere("sphere", 10, 2, scene);
    lightSphere.position = light.position;
    lightSphere.material = new BABYLON.StandardMaterial("light", scene);
    lightSphere.material.emissiveColor = new BABYLON.Color3(1, 1, 0);
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

    const cubes = [
      "Cube",
      "Cube.001",
      "Cube.002",
      "Cube.003",
      "Cube.004",
      "Cube.005",
    ];
    cubes.forEach((meshName) => {
      const mesh = scene.getMeshByName(meshName)
      new BABYLON.PhysicsAggregate(
        mesh,
        BABYLON.PhysicsShapeType.BOX,
        { mass: 0.1 },
      );   
      this.addShadowCaster(mesh);
    });

    const immutables = [ "TV", "TV_BORDER" ]
    immutables.forEach((meshName) => {
      const mesh = scene.getMeshByName(meshName);
      new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.MESH);
      mesh.isPickable = false;
      mesh.freezeWorldMatrix()
      mesh.doNotSyncBoundingInfo = true;

      this.addShadowCaster(mesh);
    })

    const ground = scene.getMeshByName("Ground");
    if (ground) {
      new BABYLON.PhysicsAggregate(ground, BABYLON.PhysicsShapeType.MESH);
      this.addShadowCaster(ground)
    }

    this.addLaptop(scene);

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
    this.addShadowCaster(scene.getMeshByName("Cube.007"));
    this.addShadowCaster(planeMesh);

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
  }

  public resize() {
    this._scene?.getEngine().resize();
  }

  public setLaptopUrl(url: string, snapshot: string, lastUpdate?: number) {
    this._laptopUrl = url;
    if (this.isHlsUrl(url)) {
      const videoDelta = lastUpdate ? (new Date().getTime() - lastUpdate) / 1000 : 0;
      this.playLaptopVideo(url, videoDelta);
      return;
    }

    this.stopLaptopVideo();
    this.drawLaptopScreen(url, snapshot);
  }

  public updateTvFramePosition(frame: HTMLIFrameElement | null) {
    if (!frame || !this._scene || !this._camera || !this._tvMesh || !this._laptopUrl) {
      if (frame) frame.style.display = "none";
      return;
    }

    const engine = this._scene.getEngine();
    const canvas = engine.getRenderingCanvas();
    if (!canvas) {
      frame.style.display = "none";
      return;
    }

    const boundingInfo = this._tvMesh.getBoundingInfo();
    const transform = this._tvMesh.getWorldMatrix();
    const viewport = this._camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const projected = boundingInfo.boundingBox.vectors.map((point) => (
      BABYLON.Vector3.Project(
        point,
        transform,
        this._scene.getTransformMatrix(),
        viewport,
      )
    ));

    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / engine.getRenderWidth();
    const scaleY = canvasRect.height / engine.getRenderHeight();
    const xs = projected.map((point) => canvasRect.left + point.x * scaleX);
    const ys = projected.map((point) => canvasRect.top + point.y * scaleY);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);

    if (right <= 0 || bottom <= 0 || left >= window.innerWidth || top >= window.innerHeight) {
      frame.style.display = "none";
      return;
    }

    frame.style.display = "block";
    frame.style.left = `${left}px`;
    frame.style.top = `${top}px`;
    frame.style.width = `${right - left}px`;
    frame.style.height = `${bottom - top}px`;
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

  private addLaptop(scene: BABYLON.Scene) {
    const screenFrame = scene.getMeshByName("TV");
    if (!screenFrame) return;

    this._tvMesh = screenFrame;

    this._laptopScreenTexture = new BABYLON.DynamicTexture(
      "sharedLaptopScreenTexture",
      { width: 0, height: 0 },
      scene,
    );
    const screenMaterial = new BABYLON.StandardMaterial("sharedLaptopScreenMaterial", scene);
    this._laptopScreenMaterial = screenMaterial;
    screenMaterial.diffuseTexture = this._laptopScreenTexture;
    screenMaterial.emissiveColor = new BABYLON.Color3(0.85, 0.9, 1);
    screenMaterial.specularColor = new BABYLON.Color3(1, 1, 1);
    screenMaterial.backFaceCulling = false;
    screenFrame.material = screenMaterial;
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

  private drawLaptopScreen(url: string, snapshot: string) {
    if (!this._laptopScreenTexture || !this._laptopScreenMaterial) return;

    this._laptopScreenMaterial.diffuseTexture = this._laptopScreenTexture;

    const context = this._laptopScreenTexture.getContext();
    const { width, height } = this._laptopScreenTexture.getSize();
    context.clearRect(0, 0, width, height);
    if (url && snapshot) {
      this._laptopScreenTexture.updateURL(`data:image/png;base64, ${snapshot}`)
    } else {
      context.fillStyle = "#eaf9ff";
      context.font = "bold 48px sans-serif";
      context.fillText("No URL configured", 54, 225);
      context.fillStyle = "#6bdcff";
      context.font = "30px sans-serif";
      context.fillText("Use the URL control to set the room display.", 54, 282);
    }

    this._laptopScreenTexture.update();
  }

  private playLaptopVideo(url: string, delta: number) {
    if (!this._scene || !this._laptopScreenMaterial) return;

    this.stopLaptopVideo();
    const videoTexture = new BABYLON.VideoTexture(
      "sharedLaptopVideoTexture",
      url,
      this._scene,
      false,
      false,
      BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
      {
        autoPlay: false,
        loop: true,
        muted: true,
      },
    );
    this._laptopVideoTexture = videoTexture;
    this._laptopScreenMaterial.diffuseTexture = videoTexture;

    videoTexture.video.addEventListener("loadedmetadata", () => {
      videoTexture.video.currentTime = (delta % videoTexture.video.duration);
      setTimeout(() => {
        videoTexture.video.muted = false;
        videoTexture.video.play().catch((error) => {
          console.error("Failed to play laptop video", error);
        });
      }, 1000);
    });

  }

  private stopLaptopVideo() {
    if (!this._laptopVideoTexture) return;

    this._laptopVideoTexture.video.pause();
    this._laptopVideoTexture.dispose();
    this._laptopVideoTexture = undefined;
  }

  private isHlsUrl(url: string) {
    if (!url) return false;

    try {
      return new URL(url).pathname.toLowerCase().endsWith(".m3u8");
    } catch {
      return false;
    }
  }
}
