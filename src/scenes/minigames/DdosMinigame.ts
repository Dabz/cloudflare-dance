import * as BABYLON from "@babylonjs/core";
import type { DdosMinigameState } from "../../../worker/model/gameroom";
import { Minigame } from "./Minigame";

const HIT_DISTANCE = 0.72;
const TV_HIT_DISTANCE = 0.95;
const BOT_SPAWN_INTERVAL_MS = 2_500;
const BOT_TRAVEL_DURATION_MS = 16_000;
const BOT_SPAWN_ORIGIN = new BABYLON.Vector3(10, 10, 50);

interface ProjectileTracker {
  mesh: BABYLON.AbstractMesh;
  ownerId?: string;
  createdAt: number;
}

export class DdosMinigame extends Minigame {
  private bots = new Map<string, BABYLON.AbstractMesh>();
  private projectiles: ProjectileTracker[] = [];
  private reportedHits = new Set<string>();
  private reportedBreaches = new Set<string>();
  private botMaterial: BABYLON.StandardMaterial;
  private fireMaterial: BABYLON.StandardMaterial;
  private smokeMaterial: BABYLON.StandardMaterial;
  private tvMesh?: BABYLON.AbstractMesh;
  private tvTarget = BABYLON.Vector3.Zero();
  private currentState?: DdosMinigameState;
  private localPlayerId?: string;
  private onBotHit: (botId: string) => void;
  private onBotBreach: (botId: string) => void;
  private fireMeshes: BABYLON.AbstractMesh[] = [];
  private fireLight?: BABYLON.PointLight;

  constructor(scene: BABYLON.Scene, onBotHit: (botId: string) => void, onBotBreach: (botId: string) => void) {
    super(scene);
    this.onBotHit = onBotHit;
    this.onBotBreach = onBotBreach;
    this.tvMesh = this.findTvMesh(scene);
    this.tvTarget = this.findTvTarget(scene);
    this.botMaterial = new BABYLON.StandardMaterial("ddosBotMaterial", scene);
    this.botMaterial.diffuseColor = new BABYLON.Color3(1, 0.08, 0.02);
    this.botMaterial.emissiveColor = new BABYLON.Color3(0.55, 0.03, 0.02);
    this.botMaterial.specularColor = new BABYLON.Color3(1, 0.55, 0.35);

    this.fireMaterial = new BABYLON.StandardMaterial("ddosTvFireMaterial", scene);
    this.fireMaterial.diffuseColor = new BABYLON.Color3(1, 0.28, 0.02);
    this.fireMaterial.emissiveColor = new BABYLON.Color3(1, 0.18, 0.01);
    this.fireMaterial.alpha = 0.82;

    this.smokeMaterial = new BABYLON.StandardMaterial("ddosTvSmokeMaterial", scene);
    this.smokeMaterial.diffuseColor = new BABYLON.Color3(0.08, 0.07, 0.06);
    this.smokeMaterial.emissiveColor = new BABYLON.Color3(0.03, 0.025, 0.02);
    this.smokeMaterial.alpha = 0.46;
  }

  public setLocalPlayerId(playerId?: string) {
    this.localPlayerId = playerId;
  }

  public registerProjectile(mesh: BABYLON.AbstractMesh, ownerId?: string) {
    this.projectiles.push({ mesh, ownerId, createdAt: Date.now() });
  }

  public applyState(state?: DdosMinigameState) {
    if (!state) return;

    const wasActive = this.currentState?.active ?? false;
    this.currentState = state;

    if (state.active) {
      this.ensureBots(state.remainingBots);
      this.setFireEnabled(false);
      this.showBanner(this.getActiveText(state));
      return;
    }

    this.disposeBots();
    this.reportedHits.clear();
    this.reportedBreaches.clear();
    this.setFireEnabled(state.tvOnFire);
    if (state.tvOnFire) {
      this.showBanner("DDoS breached the TV\nInteract with TV to repair it");
      return;
    }
    if (wasActive || state.winnerName) {
      this.showBanner(state.winnerName ? `DDoS defended\nTop defender: ${state.winnerName}` : "DDoS defended");
    }
  }

  public beforeRender() {
    this.animateFire();
    if (!this.currentState?.active) return;

    const remaining = this.currentState.endsAt ? Math.max(0, Math.ceil((this.currentState.endsAt - Date.now()) / 1000)) : 0;
    this.showBanner(`${this.getActiveText(this.currentState)}\n${remaining}s remaining`);

    this.currentState.remainingBots.forEach((botId) => {
      const bot = this.bots.get(botId);
      if (!bot) return;
      this.updateBotPosition(botId, bot);
    });
    this.checkTvBreaches();
    this.checkProjectileHits();
  }

  public dispose() {
    this.disposeBots();
    this.disposeFire();
    super.dispose();
    this.botMaterial.dispose();
    this.fireMaterial.dispose();
    this.smokeMaterial.dispose();
  }

  private getActiveText(state: DdosMinigameState) {
    const scores = Object.entries(state.scores);
    const leader = scores.length > 0
      ? scores.sort((a, b) => b[1] - a[1])[0]
      : undefined;
    const leaderText = leader ? `Leader: ${state.playerNames[leader[0]] ?? leader[0]} (${leader[1]})` : "Hit bots with cannon balls";
    return `DDoS attack on TV\n${leaderText}`;
  }

  private findTvMesh(scene: BABYLON.Scene) {
    return scene.meshes.find((mesh) => mesh.name === "TV" || mesh.name.startsWith("TV"))
      ?? scene.meshes.find((mesh) => mesh.name.toLowerCase().includes("tv"));
  }

  private findTvTarget(scene: BABYLON.Scene) {
    const tvMesh = this.tvMesh ?? this.findTvMesh(scene);
    return tvMesh?.getAbsolutePosition().add(new BABYLON.Vector3(0, 1.25, 0)) ?? new BABYLON.Vector3(0, 2.2, 0);
  }

  private ensureBots(remainingBots: string[]) {
    for (const [botId, bot] of this.bots) {
      if (!remainingBots.includes(botId)) {
        bot.dispose();
        this.bots.delete(botId);
      }
    }

    for (const botId of remainingBots) {
      if (this.bots.has(botId)) continue;
      const bot = BABYLON.MeshBuilder.CreatePolyhedron(`ddos_${botId}`, { type: 2, size: 0.34 }, this.scene);
      bot.material = this.botMaterial;
      bot.isPickable = false;
      this.updateBotPosition(botId, bot);
      this.bots.set(botId, bot);
    }
  }

  private disposeBots() {
    for (const bot of this.bots.values()) bot.dispose();
    this.bots.clear();
  }

  private showBanner(text: string) {
    super.showBanner("ddos", text, this.tvTarget.add(new BABYLON.Vector3(0, 3.2, -0.35)));
  }

  private updateBotPosition(botId: string, bot: BABYLON.AbstractMesh) {
    const index = Number(botId.replace("bot-", "")) || 0;
    const startedAt = this.currentState?.startedAt ?? Date.now();
    const spawnAt = startedAt + index * BOT_SPAWN_INTERVAL_MS;
    const progress = Math.max(0, Math.min(1, (Date.now() - spawnAt) / BOT_TRAVEL_DURATION_MS));
    const spawn = this.getBotSpawnPosition(index);
    const easedProgress = progress * progress * (3 - 2 * progress);

    bot.position.copyFrom(BABYLON.Vector3.Lerp(spawn, this.tvTarget, easedProgress));
    bot.rotation.y += 0.08;
    bot.rotation.x += 0.035;
  }

  private getBotSpawnPosition(index: number) {
    const angle = index * 1.73;
    return BOT_SPAWN_ORIGIN.add(new BABYLON.Vector3(
      Math.cos(angle) * 1.8,
      Math.sin(index * 0.91) * 1.1,
      Math.sin(angle) * 2.2,
    ));
  }

  private checkTvBreaches() {
    for (const [botId, bot] of this.bots) {
      if (this.reportedBreaches.has(botId)) continue;
      if (BABYLON.Vector3.Distance(bot.getAbsolutePosition(), this.tvTarget) > TV_HIT_DISTANCE) continue;

      this.reportedBreaches.add(botId);
      bot.dispose();
      this.bots.delete(botId);
      this.onBotBreach(botId);
    }
  }

  private checkProjectileHits() {
    const now = Date.now();
    this.projectiles = this.projectiles.filter((projectile) => {
      if (projectile.mesh.isDisposed() || now - projectile.createdAt > 12_000) return false;
      if (!this.localPlayerId || projectile.ownerId !== this.localPlayerId) return true;

      for (const [botId, bot] of this.bots) {
        if (this.reportedHits.has(botId)) continue;
        if (BABYLON.Vector3.Distance(projectile.mesh.getAbsolutePosition(), bot.getAbsolutePosition()) > HIT_DISTANCE) continue;

        this.reportedHits.add(botId);
        bot.dispose();
        this.bots.delete(botId);
        this.onBotHit(botId);
        return false;
      }
      return true;
    });
  }

  private setFireEnabled(enabled: boolean) {
    if (!enabled) {
      this.disposeFire();
      return;
    }

    if (this.fireMeshes.length > 0) return;

    for (let i = 0; i < 7; i++) {
      const flame = BABYLON.MeshBuilder.CreateCone(`ddos_tv_fire_${i}`, { height: 0.9 + i * 0.04, diameterBottom: 0.45, diameterTop: 0.02, tessellation: 6 }, this.scene);
      flame.material = this.fireMaterial;
      flame.isPickable = false;
      flame.position.copyFrom(this.tvTarget.add(new BABYLON.Vector3(Math.sin(i * 1.4) * 0.55, 0.35 + (i % 3) * 0.16, Math.cos(i * 1.1) * 0.34)));
      this.fireMeshes.push(flame);
    }

    for (let i = 0; i < 4; i++) {
      const smoke = BABYLON.MeshBuilder.CreateSphere(`ddos_tv_smoke_${i}`, { diameter: 0.42 + i * 0.12, segments: 8 }, this.scene);
      smoke.material = this.smokeMaterial;
      smoke.isPickable = false;
      smoke.position.copyFrom(this.tvTarget.add(new BABYLON.Vector3(Math.sin(i * 2.1) * 0.36, 1.2 + i * 0.28, Math.cos(i * 1.7) * 0.26)));
      this.fireMeshes.push(smoke);
    }

    this.fireLight = new BABYLON.PointLight("ddosTvFireLight", this.tvTarget.add(new BABYLON.Vector3(0, 1.1, 0)), this.scene);
    this.fireLight.diffuse = new BABYLON.Color3(1, 0.32, 0.04);
    this.fireLight.intensity = 9;
    this.fireLight.range = 7;
  }

  private animateFire() {
    if (this.fireMeshes.length === 0) return;

    const time = performance.now() * 0.001;
    this.fireMeshes.forEach((mesh, index) => {
      mesh.rotation.y += 0.03 + index * 0.003;
      mesh.scaling.y = 0.82 + Math.sin(time * 8 + index) * 0.16;
      mesh.scaling.x = 0.92 + Math.cos(time * 6 + index) * 0.08;
    });
    if (this.fireLight) this.fireLight.intensity = 7 + Math.sin(time * 10) * 2;
  }

  private disposeFire() {
    for (const mesh of this.fireMeshes) mesh.dispose();
    this.fireMeshes = [];
    this.fireLight?.dispose();
    this.fireLight = undefined;
  }
}
