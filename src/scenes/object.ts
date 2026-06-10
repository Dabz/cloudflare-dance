import * as BABYLON from '@babylonjs/core'

export class UsableObject {
  InteractDistance = 15;
  public interact(scene: BABYLON.Scene, mainPlayer: PlayerCharacter) {
    throw new Error("Not implemented");
  }
}
