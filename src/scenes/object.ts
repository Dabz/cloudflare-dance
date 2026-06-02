import * as BABYLON from '@babylonjs/core'
import type {PlayerCharacter} from './player';

export class UsableObject {
  InteractDistance = 15;
  public interact(_scene: BABYLON.Scene, _mainPlayer: PlayerCharacter) {
    void _scene;
    void _mainPlayer;
    throw new Error("Not implemented");
  }
}
