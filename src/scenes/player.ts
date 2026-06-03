import * as BABYLON from "@babylonjs/core";
import type {Player} from "../../worker/model/player";
import earcut from 'earcut';
const fontData = await (await fetch("/font.json")).json();

export class PlayerCharacter {
  mainPlayer: boolean;
  id: string;
  text?: BABYLON.Mesh;

  character: BABYLON.Mesh;
  characterController: BABYLON.PhysicsCharacterController;
  characterOrientation: BABYLON.Quaternion;
  characterGravity: BABYLON.Vector3;
  characterPosition: BABYLON.Vector3;

  state: "IN_AIR" | "ON_GROUND" | "START_JUMP" = "IN_AIR";
  inputDirection = new BABYLON.Vector3(0,0,0);
  wantJump: number = 0;

  inAirSpeed = 8.0;
  onGroundSpeed = 10.0;
  jumpHeight = 1.5;

  forwardLocalSpace = new BABYLON.Vector3(0, 0, 1);

  public static createPlayer(mainPlayer: boolean, id: string, scene: BABYLON.Scene, otherPlayer?: Player): PlayerCharacter {
    const player = new PlayerCharacter()
    player.id = id;
    player.mainPlayer = mainPlayer;
    player.characterOrientation = BABYLON.Quaternion.Identity();
    player.characterGravity = new BABYLON.Vector3(0, -18, 0);

    const h = 1.8;
    const r = 0.6;
    player.character = BABYLON.MeshBuilder.CreateCapsule("CharacterDisplay", {height: h, radius: r}, scene);
    player.character.material = new BABYLON.StandardMaterial("capsule", scene);
    if (mainPlayer) {
      player.character.material.diffuseColor = new BABYLON.Color3(0.4,0.5,0.8);
    } else {
      player.character.material.diffuseColor = new BABYLON.Color3(0.2,0.9,0.8);
    }

    player.characterPosition = new BABYLON.Vector3(3., 0.3, -8.);
    player.characterController = new BABYLON.PhysicsCharacterController(player.characterPosition, {capsuleHeight: h, capsuleRadius: r}, scene);

    if (!mainPlayer && otherPlayer) {
      player.text = BABYLON.MeshBuilder.CreateText(otherPlayer.id, otherPlayer.displayName, fontData, { size: 1,  resolution: 1, depth: 0.1}, scene, earcut);
    }

    return player;
  }

  public addListenersToKeyboardAndMouse(scene: BABYLON.Scene, camera: BABYLON.FollowCamera) {
    // Only add listeners for mainPlayer
    if (!this.mainPlayer) return;

    let isKeyDown = false;
    let isMouseDown = false;

    let mouseDownY = 0;
    scene.onPointerObservable.add((pointerInfo) => {
      switch (pointerInfo.type) {
        case BABYLON.PointerEventTypes.POINTERDOWN:
          isMouseDown = true;
          mouseDownY = pointerInfo.event.y;
          break;

        case BABYLON.PointerEventTypes.POINTERUP:
          isMouseDown = false;
          if (!isKeyDown) {
            this.inputDirection.z = 0;
          }
          break;

        case BABYLON.PointerEventTypes.POINTERMOVE:
          if (isMouseDown) {
          const tgt = camera.getTarget().clone();
          camera.position.addInPlace(camera.getDirection(BABYLON.Vector3.Right()).scale(pointerInfo.event.movementX * -0.02));
          camera.setTarget(tgt);

          if (!isKeyDown)
            {
              const deltaY = mouseDownY - pointerInfo.event.y;
              if (Math.abs(deltaY) > 100) {
                this.inputDirection.z = Math.sign(deltaY);
              }
            }
        }
        break;

        case BABYLON.PointerEventTypes.POINTERDOUBLETAP:
          ++this.wantJump;
        break;
      }
    });
    // Input to direction
    // from keys down/up, update the Vector3 inputDirection to match the intended direction. Jump with space
    scene.onKeyboardObservable.add((kbInfo) => {
      switch (kbInfo.type) {
        case BABYLON.KeyboardEventTypes.KEYDOWN:
          isKeyDown = true;
        if (kbInfo.event.key == 'w' || kbInfo.event.key == 'ArrowUp') {
          this.inputDirection.z = 1;
        } else if (kbInfo.event.key == 's' || kbInfo.event.key == 'ArrowDown') {
          this.inputDirection.z = -1;
        } else if (kbInfo.event.key == 'a' || kbInfo.event.key == 'ArrowLeft') {
          this.inputDirection.x = -1;
        } else if (kbInfo.event.key == 'd' || kbInfo.event.key == 'ArrowRight') {
          this.inputDirection.x = 1;
        } else if (kbInfo.event.key == ' ') {
          this.wantJump += 1;
        }
        break;
        case BABYLON.KeyboardEventTypes.KEYUP:
          isKeyDown = false;
        if (kbInfo.event.key == 'w' || kbInfo.event.key == 's' || kbInfo.event.key == 'ArrowUp' || kbInfo.event.key == 'ArrowDown') {
          this.inputDirection.z = 0;    
        }
        if (kbInfo.event.key == 'a' || kbInfo.event.key == 'd' || kbInfo.event.key == 'ArrowLeft' || kbInfo.event.key == 'ArrowRight') {
          this.inputDirection.x = 0;
        } else if (kbInfo.event.key == ' ') {
          this.wantJump = 0;
        }
        break;
      }
    });
  }

  public getDesiredVelocity(deltaTime, supportInfo, characterOrientation, currentVelocity) {
    const nextState = this.getNextState(supportInfo);
    if (nextState != this.state) {
      this.state = nextState;
    }

    const upWorld = this.characterGravity.normalizeToNew();
    upWorld.scaleInPlace(-1.0);
    const forwardWorld = this.forwardLocalSpace.applyRotationQuaternion(characterOrientation);
    if (this.state == "IN_AIR") {
      const desiredVelocity = this.inputDirection.scale(this.inAirSpeed).applyRotationQuaternion(this.characterOrientation);
      const outputVelocity = this.characterController.calculateMovement(deltaTime, forwardWorld, upWorld, currentVelocity, BABYLON.Vector3.ZeroReadOnly, desiredVelocity, upWorld);
      outputVelocity.addInPlace(upWorld.scale(-outputVelocity.dot(upWorld)));
      outputVelocity.addInPlace(upWorld.scale(currentVelocity.dot(upWorld)));
      outputVelocity.addInPlace(this.characterGravity.scale(deltaTime));
      return outputVelocity;
    } else if (this.state == "ON_GROUND") {
      const desiredVelocity = this.inputDirection.scale(this.onGroundSpeed).applyRotationQuaternion(this.characterOrientation);

      let outputVelocity = this.characterController.calculateMovement(deltaTime, forwardWorld, supportInfo.averageSurfaceNormal, currentVelocity, supportInfo.averageSurfaceVelocity, desiredVelocity, upWorld);
      {
        outputVelocity.subtractInPlace(supportInfo.averageSurfaceVelocity);
        const inv1k = 1e-3;
        if (outputVelocity.dot(upWorld) > inv1k) {
          const velLen = outputVelocity.length();
          outputVelocity.normalizeFromLength(velLen);

          // Get the desired length in the horizontal direction
          const horizLen = velLen / supportInfo.averageSurfaceNormal.dot(upWorld);

          // Re project the velocity onto the horizontal plane
          const c = supportInfo.averageSurfaceNormal.cross(outputVelocity);
          outputVelocity = c.cross(upWorld);
          outputVelocity.scaleInPlace(horizLen);
        }
        outputVelocity.addInPlace(supportInfo.averageSurfaceVelocity);
        return outputVelocity;
      }
    } else if (this.state == "START_JUMP") {
      const u = Math.sqrt(2 * this.characterGravity.length() * this.jumpHeight);
      const curRelVel = currentVelocity.dot(upWorld);
      return currentVelocity.add(upWorld.scale(u - curRelVel));
    }
    return BABYLON.Vector3.Zero();
  }

  public getNextState(supportInfo: BABYLON.CharacterSurfaceInfo) {
    if (this.state == "IN_AIR") {
      if (supportInfo.supportedState == BABYLON.CharacterSupportedState.SUPPORTED) {
        return "ON_GROUND";
      }
      return "IN_AIR";
    } else if (this.state == "ON_GROUND") {
      if (supportInfo.supportedState != BABYLON.CharacterSupportedState.SUPPORTED) {
        return "IN_AIR";
      }

      if (this.wantJump > 0) {
        this.wantJump--;
        return "START_JUMP";
      }
      return "ON_GROUND";
    } else if (this.state == "START_JUMP") {
      return "IN_AIR";
    }
  }

  public beforeRender(scene: BABYLON.Scene, camera: BABYLON.FollowCamera) {
    this.character.position.copyFrom(this.characterController.getPosition());

    // Update Camera to follow main player
    if (this.mainPlayer) {
      const cameraDirection = camera.getDirection(new BABYLON.Vector3(0,0,1));
      cameraDirection.y = 0;
      cameraDirection.normalize();
      camera.setTarget(BABYLON.Vector3.Lerp(camera.getTarget(), this.character.position, 0.1));
      const dist = BABYLON.Vector3.Distance(camera.position, this.character.position);
      const amount = (Math.min(dist - 6, 0) + Math.max(dist - 9, 0)) * 0.04;
      cameraDirection.scaleAndAddToRef(amount, camera.position);
      camera.position.y += (this.character.position.y + 2 - camera.position.y) * 0.04;
    }
  }

  public afterPhysics(scene: BABYLON.Scene, camera: BABYLON.FollowCamera) {
    const dt = scene.deltaTime / 1000.0;
    if (dt == 0) return;

    const down = new BABYLON.Vector3(0, -1, 0);
    const support = this.characterController.checkSupport(dt, down);

    BABYLON.Quaternion.FromEulerAnglesToRef(0,camera.rotation.y, 0, this.characterOrientation);
    const desiredLinearVelocity = this.getDesiredVelocity(dt, support, this.characterOrientation, this.characterController.getVelocity());
    this.characterController.setVelocity(desiredLinearVelocity);
    this.characterController.integrate(dt, support, this.characterGravity);
    this.characterPosition = this.characterController.getPosition();
  }

  updatePosition(newPosition: BABYLON.Vector3) {
    if (this.mainPlayer) {
      this.characterPosition = newPosition;
      this.character.position = newPosition;
      this.characterController.setPosition(newPosition)
      return;
    }
    const easingFunction = new BABYLON.CubicEase();
    easingFunction.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);

    // 2. Trigger the quick animation helper
    BABYLON.Animation.CreateAndStartAnimation("smoothMove", this.character, "position", 60, 6, this.characterPosition.clone(), newPosition, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, easingFunction);
    this.characterPosition = newPosition;
    this.characterController.setPosition(newPosition.clone())

    if (this.text) {
      const newTextPosition = new BABYLON.Vector3(newPosition.x, newPosition.y + 1, newPosition.z)
      BABYLON.Animation.CreateAndStartAnimation("smoothMove", this.text, "position", 60, 6, this.text.position.clone(), newTextPosition, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, easingFunction);
    }
  }

  dispose() {
    this.character.dispose();
    this.characterController.dispose();
    this.text.dispose();
  }
}

