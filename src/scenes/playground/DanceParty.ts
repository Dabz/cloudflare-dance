import * as BABYLON from "@babylonjs/core";
import type { PlayerCharacter } from "../player";

import type { PlaygroundActionContext, PlaygroundActionObject } from "./types";
import { PlaygroundAction } from "./types";

export class DanceParty extends PlaygroundAction {
  constructor(context: PlaygroundActionContext) {
    super(context);
  }

  run(scene: BABYLON.Scene, player: PlayerCharacter | undefined, object: PlaygroundActionObject) {
    player?.dance();
    this.context.enableDisco();
    this.context.discoLights.forEach((light) => light.setEnabled(true));
    this.context.burstConfetti(scene, object.mesh.getAbsolutePosition().add(new BABYLON.Vector3(0, 1.2, 0)), 160);
  }
}
