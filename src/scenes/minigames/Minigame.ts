import * as BABYLON from "@babylonjs/core";

export abstract class Minigame {
  protected scene: BABYLON.Scene;
  private banner?: BABYLON.AbstractMesh;
  private bannerTexture?: BABYLON.DynamicTexture;
  private bannerMaterial?: BABYLON.StandardMaterial;

  constructor(scene: BABYLON.Scene) {
    this.scene = scene;
  }

  public abstract beforeRender(): void;

  public dispose() {
    this.banner?.dispose();
    this.bannerTexture?.dispose();
    this.bannerMaterial?.dispose();
  }

  protected showBanner(name: string, text: string, position: BABYLON.Vector3) {
    if (!this.banner) {
      this.bannerTexture = new BABYLON.DynamicTexture(`${name}BannerTexture`, { width: 1024, height: 256 }, this.scene);
      this.bannerMaterial = new BABYLON.StandardMaterial(`${name}BannerMaterial`, this.scene);
      this.bannerMaterial.diffuseTexture = this.bannerTexture;
      this.bannerMaterial.emissiveTexture = this.bannerTexture;
      this.bannerMaterial.backFaceCulling = false;
      this.banner = BABYLON.MeshBuilder.CreatePlane(`${name}Banner`, { width: 7.2, height: 1.8 }, this.scene);
      this.banner.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
      this.banner.isPickable = false;
      this.banner.material = this.bannerMaterial;
    }

    this.banner.position.copyFrom(position);
    const texture = this.bannerTexture;
    if (!texture) return;

    const context = texture.getContext() as CanvasRenderingContext2D;
    context.clearRect(0, 0, 1024, 256);
    context.fillStyle = "rgba(8, 6, 4, 0.88)";
    context.fillRect(0, 0, 1024, 256);
    context.strokeStyle = "#ff6a00";
    context.lineWidth = 18;
    context.strokeRect(16, 16, 992, 224);
    const lines = text.split("\n");
    context.fillStyle = "#fff2d2";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "900 54px system-ui, sans-serif";
    context.fillText(lines[0] ?? name, 512, lines.length > 1 ? 86 : 128);
    if (lines[1]) {
      context.fillStyle = "#ffc447";
      context.font = "800 36px system-ui, sans-serif";
      context.fillText(lines[1], 512, 158);
    }
    if (lines[2]) {
      context.fillStyle = "#ff7a16";
      context.font = "900 30px system-ui, sans-serif";
      context.fillText(lines[2], 512, 208);
    }
    texture.update();
  }
}
