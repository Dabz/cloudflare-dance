import * as BABYLON from "@babylonjs/core";
import type {Player} from "../../worker/model/player";
import earcut from 'earcut';
import type {UsableObject} from "./object";
import type {InteractionSubscriber} from "./main";
const fontData = await (await fetch("/font.json")).json();

export class PlayerCharacter {
  mainPlayer: boolean;
  id: string;
  text?: BABYLON.Mesh;
  interact?: BABYLON.Mesh;

  character: BABYLON.Mesh;
  characterController: BABYLON.PhysicsCharacterController;
  characterOrientation: BABYLON.Quaternion;
  characterGravity: BABYLON.Vector3;
  characterPosition: BABYLON.Vector3;
  rotationY = 0;

  state: "IN_AIR" | "ON_GROUND" | "START_JUMP" = "IN_AIR";
  inputDirection = new BABYLON.Vector3(0,0,0);
  wantJump: number = 0;

  inAirSpeed = 8.0;
  onGroundSpeed = 10.0;
  jumpHeight = 1.5;

  forwardLocalSpace = new BABYLON.Vector3(0, 0, 1);
  startPosition = new BABYLON.Vector3(0., 5, 0.);

  isDancing = false;
  usableObject?: UsableObject = undefined;

  _onInteract?: InteractionSubscriber;

  constructor(onInteract?: InteractionSubscriber) {
    this._onInteract = onInteract;
  }

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

    player.characterPosition = player.startPosition;
    player.characterController = new BABYLON.PhysicsCharacterController(player.characterPosition, {capsuleHeight: h, capsuleRadius: r}, scene);

    if (!mainPlayer && otherPlayer) {
      player.text = BABYLON.MeshBuilder.CreateText(otherPlayer.id, otherPlayer.displayName, fontData, { size: 1,  resolution: 1, depth: 0.1}, scene, earcut);
      player.updateRotation(otherPlayer.rotationY ?? 0, false);
    }

    return player;
  }

  public addListenersToKeyboardAndMouse(scene: BABYLON.Scene, camera: BABYLON.ArcFollowCamera) {
    // Only add listeners for mainPlayer
    if (!this.mainPlayer) return;

    let keyDowns = 0;
    let isMouseDown = false;

    let mouseDownY = 0;
    scene.onPointerObservable.add((pointerInfo) => {
      switch (pointerInfo.type) {
        case BABYLON.PointerEventTypes.POINTERDOWN: {
          isMouseDown = true; 
          mouseDownY = pointerInfo.event.y;
          break;
        }

        case BABYLON.PointerEventTypes.POINTERUP: {
          isMouseDown = false;
          if (keyDowns == 0) {
            this.inputDirection.z = 0;
          }
          break;
        }

        case BABYLON.PointerEventTypes.POINTERMOVE: {
          if (isMouseDown) {
            camera.alpha += pointerInfo.event.movementX * -0.02;
            const newBeta = camera.beta + pointerInfo.event.movementY * -0.02;
            if (newBeta >= 0 && newBeta <= Math.PI / 2) {
              camera.beta = newBeta;
            }

            if (!keyDowns)
              {
                const deltaY = mouseDownY - pointerInfo.event.y;
                if (Math.abs(deltaY) > 100) {
                  this.inputDirection.z = Math.sign(deltaY);
                }
              }
          }
          break;
        }

        case BABYLON.PointerEventTypes.POINTERDOUBLETAP: {
          ++this.wantJump;
          break;
        }
      }
    });
    // Input to direction
    // from keys down/up, update the Vector3 inputDirection to match the intended direction. Jump with space
    scene.onKeyboardObservable.add((kbInfo) => {
      switch (kbInfo.type) {
        case BABYLON.KeyboardEventTypes.KEYDOWN: {
          keyDowns += 1;
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
          } else if (kbInfo.event.key == 'q') {
            this.dance();
          }
          break
        }
        case BABYLON.KeyboardEventTypes.KEYUP: {
          keyDowns -= 1;
          if (kbInfo.event.key == 'e' && this.usableObject) {
            this.usableObject.interact(this.character.getScene(), this);
          }
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public beforeRender(scene: BABYLON.Scene, camera: BABYLON.ArcFollowCamera) {
    // Falling use-case - reseting to initial position
    if (this.characterController.getPosition().y < -20) {
      this.characterController.setPosition(this.startPosition);
    }
    this.character.position.copyFrom(this.characterController.getPosition());

    if (this.usableObject && !this.interact) {
      this.createInteractHint();
    }

    if (!this.usableObject && this.interact) {
      this.interact.dispose();
      this.interact = undefined;
    }

    if (this.interact) {
      this.interact.position = this.character.position.clone();
      this.interact.position.y += 1;
    }
  }

  public afterPhysics(scene: BABYLON.Scene, camera: BABYLON.ArcFollowCamera) {
    const dt = scene.deltaTime / 1000.0;
    if (dt == 0) return;

    const down = new BABYLON.Vector3(0, -1, 0);
    const support = this.characterController.checkSupport(dt, down);

    BABYLON.Quaternion.FromEulerAnglesToRef(0,camera.rotation.y, 0, this.characterOrientation);
    this.updateRotation(camera.rotation.y, false);
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

  updateRotation(rotationY: number, animate = true) {
    this.rotationY = rotationY;
    if (this.mainPlayer || !animate) {
      this.character.rotation.y = rotationY;

      if (this.interact) {
        this.interact.rotation.y = rotationY;
      }
      return;
    }

    const easingFunction = new BABYLON.CubicEase();
    easingFunction.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);
    BABYLON.Animation.CreateAndStartAnimation("smoothRotate", this.character, "rotation.y", 60, 6, this.character.rotation.y, rotationY, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, easingFunction);

    if (this.text) {
      BABYLON.Animation.CreateAndStartAnimation("smoothRotate", this.text, "rotation.y", 60, 6, this.text.rotation.y, rotationY * Math.PI, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, easingFunction);
    }
  }

  resetPosition() {
    const startPosition = this.startPosition.clone();
    this.characterPosition = startPosition;
    this.character.position.copyFrom(startPosition);
    this.characterController.setPosition(startPosition);
    this.characterController.setVelocity(BABYLON.Vector3.Zero());
    this.inputDirection.set(0, 0, 0);
  }

  createInteractHint() {
    const color = [
      new BABYLON.Color4(0, 0.8, 1, 0.5),
      new BABYLON.Color4(0, 0.9, 1, 0.5),
      new BABYLON.Color4(0, 0.9, 1, 0.5),
      new BABYLON.Color4(0, 0, 1, 0.5),
    ]
    this.interact = BABYLON.MeshBuilder.CreateText("hint_interact", "Press E", fontData, { size: 1, faceColors: color, resolution: 1, depth: 0.1}, this.character.getScene(), earcut);
    this.interact.position = this.character.position.clone();
    this.interact.position.y += 1;
  }


  dance() {
    if (this._onInteract) {
      this._onInteract("player-dance");
    }
    this.isDancing = true;
    const spinAnimation = BABYLON.Animation.CreateAndStartAnimation("danceSpin", this.character, "rotation.z", 60, 45, this.character.rotation.z, this.character.rotation.z + Math.PI * 2, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    const bounceAnimation = BABYLON.Animation.CreateAndStartAnimation("danceBounce", this.character, "scaling.y", 60, 18, 1, 1.25, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
    setTimeout(() => {
      this.isDancing = false;
      if (!this.character.isDisposed()) {
        this.character.scaling.y = 1;
        this.character.rotation.z = 0;
        spinAnimation.stop();
        bounceAnimation.stop();
      }
    }, 6000);
  }

  dispose() {
    this.character.dispose();
    this.characterController.dispose();
    this.text.dispose();
  }
}
