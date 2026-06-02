import * as BABYLON from "@babylonjs/core";
import type { FixPopMinigameState } from "../../../worker/model/gameroom";
import { Minigame } from "./Minigame";

export class FixPopMinigame extends Minigame {
  private tvTarget = BABYLON.Vector3.Zero();
  private currentState?: FixPopMinigameState;

  constructor(scene: BABYLON.Scene) {
    super(scene);
    this.tvTarget = this.findTvTarget(scene);
  }

  public applyState(state?: FixPopMinigameState) {
    if (!state) return;

    const wasActive = this.currentState?.active ?? false;
    this.currentState = state;
    if (state.active) {
      this.showFixPopBanner(this.getActiveText(state));
      return;
    }

    if (wasActive || state.winnerName) {
      this.showFixPopBanner(state.winnerName ? `POP fixed\nTop engineer: ${state.winnerName}` : "POP repair complete");
    }
  }

  public beforeRender() {
    if (!this.currentState?.active) return;

    const remaining = this.currentState.endsAt ? Math.max(0, Math.ceil((this.currentState.endsAt - Date.now()) / 1000)) : 0;
    this.showFixPopBanner(`${this.getActiveText(this.currentState)}\n${remaining}s remaining`);
  }

  private getActiveText(state: FixPopMinigameState) {
    const scores = Object.entries(state.scores);
    const leader = scores.length > 0
      ? scores.sort((a, b) => b[1] - a[1])[0]
      : undefined;
    const leaderText = leader ? `Leader: ${state.playerNames[leader[0]] ?? leader[0]} (${leader[1]})` : "Interact with TV to answer trivia";
    return `Fix the POP\n${leaderText}`;
  }

  private showFixPopBanner(text: string) {
    this.showBanner("fixPop", text, this.tvTarget.add(new BABYLON.Vector3(0, 4.6, -0.35)));
  }

  private findTvTarget(scene: BABYLON.Scene) {
    const tvMesh = scene.meshes.find((mesh) => mesh.name === "TV" || mesh.name.startsWith("TV"))
      ?? scene.meshes.find((mesh) => mesh.name.toLowerCase().includes("tv"));
    return tvMesh?.getAbsolutePosition().add(new BABYLON.Vector3(0, 1.25, 0)) ?? new BABYLON.Vector3(0, 2.2, 0);
  }
}
