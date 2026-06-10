import * as BABYLON from '@babylonjs/core'
import type {PlayerCharacter} from './player';
import {UsableObject} from './object';
import type {InteractionSubscriber} from './main';

export class TV extends UsableObject {
  _laptopScreenTexture?: BABYLON.DynamicTexture;
  _laptopVideoTexture?: BABYLON.VideoTexture;
  _laptopScreenMaterial?: BABYLON.StandardMaterial;
  _laptopUrl = "";
  _tvMesh?: BABYLON.AbstractMesh;
  _scene: BABYLON.Scene;
  _onInteract?: InteractionSubscriber;

  constructor(onInteract?: InteractionSubscriber) {
    super();
    this._onInteract = onInteract;
  }

  init(scene: BABYLON.Scene) {
    this._scene = scene;
    const screenFrame = scene.getMeshByName("TV_primitive1");
    if (!screenFrame) return;

    this._tvMesh = screenFrame;
    screenFrame.isPickable = true;
    screenFrame.actionManager = new BABYLON.ActionManager(scene);
    screenFrame.actionManager.registerAction(
      new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickTrigger, () => {
        this._onInteract?.("tv-interact");
      }),
    );

    this._laptopScreenTexture = new BABYLON.DynamicTexture(
      "sharedLaptopScreenTexture",
      { width: 0, height: 0 },
      scene,
    );
    this._laptopScreenTexture.wAng = Math.PI / 2;
    this._laptopScreenTexture.uAng = Math.PI;
    const screenMaterial = new BABYLON.StandardMaterial("sharedLaptopScreenMaterial", scene);
    this._laptopScreenMaterial = screenMaterial;
    screenMaterial.diffuseTexture = this._laptopScreenTexture;
    screenMaterial.emissiveColor = new BABYLON.Color3(0.85, 0.9, 1);
    screenMaterial.specularColor = new BABYLON.Color3(1, 1, 1);
    screenMaterial.backFaceCulling = false;
    screenFrame.material = screenMaterial;
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

    this._laptopVideoTexture.wAng = Math.PI / 2;
    this._laptopVideoTexture.uAng = Math.PI;

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

  public interact(scene: BABYLON.Scene, mainPlayer: PlayerCharacter) {
    void scene;
    void mainPlayer;
    this._onInteract?.("tv-interact");
  }

  public beforeRender(_scene: BABYLON.Scene, _camera: BABYLON.ArcFollowCamera, mainPlayer?: PlayerCharacter) {
    if (mainPlayer) {
      const distance = BABYLON.Vector3.Distance(this._tvMesh.getAbsolutePosition(), mainPlayer.character.getAbsolutePosition());
      if (distance < this.InteractDistance && mainPlayer.usableObject != this) {
        mainPlayer.usableObject = this;
      } 
      if (distance > this.InteractDistance && mainPlayer.usableObject == this) {
        this._onInteract?.("tv-leave");
        mainPlayer.usableObject = null;
      }
    }
  }

}
