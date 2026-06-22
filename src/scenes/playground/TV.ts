import * as BABYLON from "@babylonjs/core";
import type { PlayerCharacter } from "../player";
import { PlaygroundAction, type PlaygroundActionContext, type PlaygroundActionObject } from "./types";

type MeshExtras = Record<string, unknown>;

function meshExtras(mesh: BABYLON.AbstractMesh): MeshExtras {
  const metadata = (mesh.metadata ?? {}) as MeshExtras;
  const gltf = (metadata.gltf ?? {}) as MeshExtras;
  const extras = (gltf.extras ?? metadata.extras ?? {}) as MeshExtras;
  return { ...metadata, ...extras };
}

function getString(extras: MeshExtras, key: string): string | undefined {
  const value = extras[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export class TV extends PlaygroundAction {
  public shouldBroadcast = false;
  private laptopScreenTexture?: BABYLON.DynamicTexture;
  private laptopVideoTexture?: BABYLON.VideoTexture;
  private laptopScreenMaterial?: BABYLON.StandardMaterial;
  private scene?: BABYLON.Scene;

  constructor(context: PlaygroundActionContext, mesh: BABYLON.AbstractMesh, extras?: MeshExtras) {
    super(context);
    this.init(mesh, extras);
  }

  run(scene: BABYLON.Scene, _player: PlayerCharacter | undefined, _object: PlaygroundActionObject) {
    void scene;
    void _player;
    void _object;
    this.context.openTV();
  }

  public setLaptopUrl(url: string, snapshot: string, lastUpdate?: number) {
    if (this.isHlsUrl(url)) {
      const videoDelta = lastUpdate ? (new Date().getTime() - lastUpdate) / 1000 : 0;
      this.playLaptopVideo(url, videoDelta);
      return;
    }

    this.stopLaptopVideo();
    this.drawLaptopScreen(url, snapshot);
  }

  private init(mesh: BABYLON.AbstractMesh, extras = meshExtras(mesh)) {
    const scene = mesh.getScene();
    const screenFrameName = getString(extras, "tvScreenFrame") ?? "TV";
    const screenFrame = scene.getMeshByName(screenFrameName) ?? mesh;

    this.scene = scene;
    this.laptopScreenTexture = new BABYLON.DynamicTexture(
      "sharedLaptopScreenTexture",
      { width: 0, height: 0 },
      scene,
    );
    this.laptopScreenTexture.wAng = Math.PI / 2;
    this.laptopScreenTexture.uAng = Math.PI;
    const screenMaterial = new BABYLON.StandardMaterial("sharedLaptopScreenMaterial", scene);
    this.laptopScreenMaterial = screenMaterial;
    screenMaterial.diffuseTexture = this.laptopScreenTexture;
    screenMaterial.emissiveColor = new BABYLON.Color3(0.85, 0.9, 1);
    screenMaterial.specularColor = new BABYLON.Color3(1, 1, 1);
    screenMaterial.backFaceCulling = false;
    screenFrame.material = screenMaterial;
  }

  private drawLaptopScreen(url: string, snapshot: string) {
    if (!this.laptopScreenTexture || !this.laptopScreenMaterial) return;

    this.laptopScreenMaterial.diffuseTexture = this.laptopScreenTexture;

    const context = this.laptopScreenTexture.getContext();
    const { width, height } = this.laptopScreenTexture.getSize();
    context.clearRect(0, 0, width, height);
    if (url && snapshot) {
      this.laptopScreenTexture.updateURL(`data:image/png;base64, ${snapshot}`);
    } else {
      context.fillStyle = "#eaf9ff";
      context.font = "bold 48px sans-serif";
      context.fillText("No URL configured", 54, 225);
      context.fillStyle = "#6bdcff";
      context.font = "30px sans-serif";
      context.fillText("Use the URL control to set the room display.", 54, 282);
    }

    this.laptopScreenTexture.update();
  }

  private playLaptopVideo(url: string, delta: number) {
    if (!this.scene || !this.laptopScreenMaterial) return;

    this.stopLaptopVideo();
    const videoTexture = new BABYLON.VideoTexture(
      "sharedLaptopVideoTexture",
      url,
      this.scene,
      false,
      false,
      BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
      {
        autoPlay: false,
        loop: true,
        muted: true,
      },
    );
    this.laptopVideoTexture = videoTexture;
    this.laptopScreenMaterial.diffuseTexture = videoTexture;

    this.laptopVideoTexture.wAng = Math.PI / 2;
    this.laptopVideoTexture.uAng = Math.PI;

    videoTexture.video.addEventListener("loadedmetadata", () => {
      videoTexture.video.currentTime = delta % videoTexture.video.duration;
      setTimeout(() => {
        videoTexture.video.muted = false;
        videoTexture.video.play().catch((error) => {
          console.error("Failed to play laptop video", error);
        });
      }, 5000);
    });
  }

  private stopLaptopVideo() {
    if (!this.laptopVideoTexture) return;

    this.laptopVideoTexture.video.pause();
    this.laptopVideoTexture.dispose();
    this.laptopVideoTexture = undefined;
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
