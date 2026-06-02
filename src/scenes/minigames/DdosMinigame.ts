import * as BABYLON from "@babylonjs/core";
import type { DdosMinigameState } from "../../../worker/model/gameroom";
import { Minigame } from "./Minigame";

const BOT_COUNT = 18;
const HIT_DISTANCE = 0.72;

interface ProjectileTracker {
  mesh: BABYLON.AbstractMesh;
  ownerId?: string;
  createdAt: number;
}

export class DdosMinigame extends Minigame {
  private bots = new Map<string, BABYLON.AbstractMesh>();
  private projectiles: ProjectileTracker[] = [];
  private reportedHits = new Set<string>();
  private botMaterial: BABYLON.StandardMaterial;
  private tvTarget = BABYLON.Vector3.Zero();
  private currentState?: DdosMinigameState;
  private localPlayerId?: string;
  private onBotHit: (botId: string) => void;

  constructor(scene: BABYLON.Scene, onBotHit: (botId: string) => void) {
    super(scene);
    this.onBotHit = onBotHit;
    this.tvTarget = this.findTvTarget(scene);
    this.botMaterial = new BABYLON.StandardMaterial("ddosBotMaterial", scene);
    this.botMaterial.diffuseColor = new BABYLON.Color3(1, 0.08, 0.02);
    this.botMaterial.emissiveColor = new BABYLON.Color3(0.55, 0.03, 0.02);
    this.botMaterial.specularColor = new BABYLON.Color3(1, 0.55, 0.35);
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
      this.showBanner(this.getActiveText(state));
      return;
    }

    this.disposeBots();
    this.reportedHits.clear();
    if (wasActive || state.winnerName) {
      this.showBanner(state.winnerName ? `DDoS defended\nTop defender: ${state.winnerName}` : "DDoS defended");
    }
  }

  public beforeRender() {
    if (!this.currentState?.active) return;

    const time = performance.now() * 0.001;
    const remaining = this.currentState.endsAt ? Math.max(0, Math.ceil((this.currentState.endsAt - Date.now()) / 1000)) : 0;
    this.showBanner(`${this.getActiveText(this.currentState)}\n${remaining}s remaining`);

    this.currentState.remainingBots.forEach((botId) => {
      const bot = this.bots.get(botId);
      if (!bot) return;
      const index = Number(botId.replace("bot-", "")) || 0;
      const angle = time * (0.7 + index * 0.015) + index * ((Math.PI * 2) / BOT_COUNT);
      const radius = 3.6 + Math.sin(time * 1.8 + index) * 0.55;
      bot.position.set(
        this.tvTarget.x + Math.cos(angle) * radius,
        this.tvTarget.y + 1.2 + Math.sin(time * 2.4 + index) * 0.8,
        this.tvTarget.z + Math.sin(angle) * (radius * 0.72),
      );
      bot.rotation.y += 0.08;
      bot.rotation.x += 0.035;
    });
    this.checkProjectileHits();
  }

  public dispose() {
    this.disposeBots();
    super.dispose();
    this.botMaterial.dispose();
  }

  private getActiveText(state: DdosMinigameState) {
    const scores = Object.entries(state.scores);
    const leader = scores.length > 0
      ? scores.sort((a, b) => b[1] - a[1])[0]
      : undefined;
    const leaderText = leader ? `Leader: ${state.playerNames[leader[0]] ?? leader[0]} (${leader[1]})` : "Hit bots with cannon balls";
    return `DDoS attack on TV\n${leaderText}`;
  }

  private findTvTarget(scene: BABYLON.Scene) {
    const tvMesh = scene.meshes.find((mesh) => mesh.name === "TV" || mesh.name.startsWith("TV"))
      ?? scene.meshes.find((mesh) => mesh.name.toLowerCase().includes("tv"));
    return tvMesh?.getAbsolutePosition().add(new BABYLON.Vector3(5, 1.25, 5)) ?? new BABYLON.Vector3(0, 2.2, 0);
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
}
