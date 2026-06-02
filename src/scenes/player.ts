import * as BABYLON from "@babylonjs/core"
import type {Player} from "../../worker/model/player";
import earcut from 'earcut';
import type {UsableObject} from "./object";
import type {InteractionSubscriber} from "./main";
import {MeshCache} from "./cache";
const fontData = await (await fetch("/font.json")).json();

const textColors = [
  new BABYLON.Color4(1, 0.95, 0.82, 1),
  new BABYLON.Color4(1, 0.27, 0.04, 1),
  new BABYLON.Color4(1, 0.48, 0.09, 1),
  new BABYLON.Color4(0.03, 0.02, 0.01, 1),
];

function createText(name: string, text: string, scene: BABYLON.Scene, size = 1): BABYLON.Mesh {
  const mesh = BABYLON.MeshBuilder.CreateText(name, text, fontData, {
    size,
    faceColors: textColors,
    resolution: 2,
    depth: 0.16,
  }, scene, earcut);
  const material = new BABYLON.StandardMaterial(`${name}_orange`, scene);
  material.diffuseColor = new BABYLON.Color3(1, 0.48, 0.09);
  material.emissiveColor = new BABYLON.Color3(0.42, 0.12, 0.01);
  material.specularColor = new BABYLON.Color3(1, 0.76, 0.22);
  mesh.material = material;
  mesh.scaling.x = 1.08;
  mesh.rotation.z = -0.08;
  return mesh;
}

function hasCoarsePointer() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

function clampCameraBeta(beta: number) {
  return Math.min(Math.PI / 2, Math.max(0.12, beta));
}

function clampCameraRadius(radius: number) {
  return Math.min(11, Math.max(4.5, radius));
}

function getPointerDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

type CharacterAnimation = "idle" | "dance1" | "dance2" | "run" | "walk" | "jump";
export type CharacterName = "characterY" | "josh" | "megan";

const WALK_TO_IDLE_MS = 750;
const LOCOMOTION_BLEND_MS = 180;
export const CHARACTER_NAMES: CharacterName[] = ["characterY", "josh", "megan"];

function normalizeCharacterName(character?: string): CharacterName {
  return CHARACTER_NAMES.includes(character as CharacterName) ? character as CharacterName : "characterY";
}

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
  isAiming = false;
  usableObject?: UsableObject = undefined;

  onInteract?: InteractionSubscriber;
  assetPrefix: string;
  animation?: BABYLON.AnimationGroup;
  remoteTargetPosition?: BABYLON.Vector3;
  characterName: CharacterName = "characterY";
  private walkUntil = 0;
  private animationBlendId = 0;
  private fadingAnimations = new Set<BABYLON.AnimationGroup>();
  private characterVersion = 0;
  private instantiatedRootNodes: BABYLON.Node[] = [];
  private instantiatedAnimationGroups: BABYLON.AnimationGroup[] = [];

  constructor(onInteract?: InteractionSubscriber) {
    this.onInteract = onInteract;
  }

  public static createPlayer(mainPlayer: boolean, id: string, scene: BABYLON.Scene, otherPlayer?: Player): PlayerCharacter {
    const player = new PlayerCharacter()
    player.id = id;
    player.mainPlayer = mainPlayer;
    player.characterOrientation = BABYLON.Quaternion.Identity();
    player.characterGravity = new BABYLON.Vector3(0, -18, 0);

    player.characterName = normalizeCharacterName(otherPlayer?.character);
    player.instantiateCharacter(scene, player.characterName);

    const h = 1;
    const r = 0.6;
    player.characterPosition = player.startPosition;
    player.characterController = new BABYLON.PhysicsCharacterController(player.characterPosition, {capsuleHeight: h, capsuleRadius: r}, scene);

    if (!mainPlayer && otherPlayer) {
      player.text = createText(otherPlayer.id, otherPlayer.displayName, scene);
      if (otherPlayer.x != null && otherPlayer.y != null && otherPlayer.z != null) {
        const initialPosition = new BABYLON.Vector3(otherPlayer.x, otherPlayer.y, otherPlayer.z);
        player.characterPosition = initialPosition.clone();
        player.character.position.copyFrom(initialPosition);
        player.characterController.setPosition(initialPosition.clone());
        player.text.position = new BABYLON.Vector3(initialPosition.x, initialPosition.y + 1, initialPosition.z);
      }
      player.updateRotation(otherPlayer.rotationY ?? 0, false);
    }

    return player;
  }

  private ensureAnimation(scene: BABYLON.Scene, animation: CharacterAnimation) {
    const animationName = this.assetPrefix + animation
    const nextAnimation = scene.getAnimationGroupByName(animationName)
      ?? (animation === "walk" ? scene.getAnimationGroupByName(this.assetPrefix + "idle") : null);

    if (!nextAnimation) return;

    if (this.animation && this.animation.name === nextAnimation.name) {
      return;
    }
    const previousAnimation = this.animation;
    const shouldBlend = previousAnimation
      && this.isLocomotionAnimation(previousAnimation)
      && this.isLocomotionAnimation(nextAnimation);

    this.animationBlendId += 1;
    for (const fadingAnimation of this.fadingAnimations) {
      if (fadingAnimation !== previousAnimation && fadingAnimation !== nextAnimation) {
        fadingAnimation.stop();
        this.fadingAnimations.delete(fadingAnimation);
      }
    }

    if (previousAnimation && !shouldBlend) {
      this.animation.stop();
    }

    this.animation = nextAnimation;
    this.animation.start(true, 1, this.animation.from, this.animation.to, false);

    if (shouldBlend) {
      this.blendLocomotionAnimation(scene, previousAnimation, nextAnimation, this.animationBlendId);
    } else {
      this.animation.setWeightForAllAnimatables(1);
    }
  }

  private instantiateCharacter(scene: BABYLON.Scene, characterName: CharacterName) {
    const previousPosition = this.character?.position?.clone() ?? this.characterPosition?.clone() ?? this.startPosition.clone();
    const previousRotation = this.rotationY;

    this.disposeCharacterInstance();
    this.characterName = characterName;
    this.characterVersion += 1;
    this.assetPrefix = `player_${this.id}_${this.characterVersion}_`;

    const entries = MeshCache[characterName].instantiateModelsToScene((sourceName) => `${this.assetPrefix}${sourceName}`, true, {});
    this.instantiatedRootNodes = entries.rootNodes;
    this.instantiatedAnimationGroups = entries.animationGroups;
    this.character = entries.rootNodes[0] as BABYLON.Mesh;
    this.character.scaling = new BABYLON.Vector3(1., 1., 1.);
    this.character.position.copyFrom(previousPosition);
    this.character.checkCollisions = true;
    this.character.ellipsoid = new BABYLON.Vector3(0.45, 0.9, 0.45);
    this.character.ellipsoidOffset = new BABYLON.Vector3(0, 0.9, 0);
    this.character.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(previousRotation, 0, 0);
    this.animation = undefined;
    this.ensureAnimation(scene, "idle");
  }

  private disposeCharacterInstance() {
    for (const animationGroup of this.instantiatedAnimationGroups) {
      animationGroup.stop();
      animationGroup.dispose();
    }
    for (const rootNode of this.instantiatedRootNodes) {
      rootNode.dispose(false, true);
    }
    this.instantiatedRootNodes = [];
    this.instantiatedAnimationGroups = [];
    this.fadingAnimations.clear();
  }

  public changeCharacter(characterName: string) {
    const nextCharacterName = normalizeCharacterName(characterName);
    if (this.characterName === nextCharacterName) return false;

    const scene = this.character.getScene();
    const position = this.characterController?.getPosition?.().clone() ?? this.characterPosition?.clone() ?? this.startPosition.clone();
    this.instantiateCharacter(scene, nextCharacterName);
    this.characterPosition = position.clone();
    this.character.position.copyFrom(position);
    this.characterController?.setPosition(position.clone());
    this.updateRotation(this.rotationY, false);
    return true;
  }

  private isLocomotionAnimation(animation: BABYLON.AnimationGroup) {
    return animation.name.endsWith("idle")
      || animation.name.endsWith("walk")
      || animation.name.endsWith("jump")
      || animation.name.endsWith("dance1")
      || animation.name.endsWith("dance2")
      || animation.name.endsWith("dance")
      || animation.name.endsWith("run");
  }

  private blendLocomotionAnimation(scene: BABYLON.Scene, previousAnimation: BABYLON.AnimationGroup, nextAnimation: BABYLON.AnimationGroup, blendId: number) {
    const startedAt = performance.now();
    previousAnimation.setWeightForAllAnimatables(1);
    nextAnimation.setWeightForAllAnimatables(0);
    this.fadingAnimations.add(previousAnimation);

    const observer = scene.onBeforeRenderObservable.add(() => {
      if (blendId !== this.animationBlendId) {
        scene.onBeforeRenderObservable.remove(observer);
        return;
      }

      const progress = Math.min(1, (performance.now() - startedAt) / LOCOMOTION_BLEND_MS);
      previousAnimation.setWeightForAllAnimatables(1 - progress);
      nextAnimation.setWeightForAllAnimatables(progress);

      if (progress < 1) return;

      previousAnimation.stop();
      previousAnimation.setWeightForAllAnimatables(1);
      nextAnimation.setWeightForAllAnimatables(1);
      this.fadingAnimations.delete(previousAnimation);
      scene.onBeforeRenderObservable.remove(observer);
    });
  }

  private isPlayingAnimation(animation: CharacterAnimation) {
    return this.animation?.name.endsWith(animation);
  }

  private startWalkTransition(scene: BABYLON.Scene) {
    this.walkUntil = performance.now() + WALK_TO_IDLE_MS;
    this.ensureAnimation(scene, "walk");
  }

  private updateGroundMovementAnimation(scene: BABYLON.Scene, moving = false) {
    if (this.mainPlayer) {
      moving = this.inputDirection.length() > 0;
    }
    if (moving) {
      this.walkUntil = 0;
      this.ensureAnimation(scene, "run");
      return;
    }

    const now = performance.now();
    if (this.isPlayingAnimation("run")) {
      this.startWalkTransition(scene);
      return;
    }

    if (this.isPlayingAnimation("walk")) {
      if (now < this.walkUntil) return;

      this.walkUntil = 0;
      this.ensureAnimation(scene, "idle");
      return;
    }

    if (this.walkUntil > now) {
      this.ensureAnimation(scene, "walk");
      return;
    }

    if (this.isPlayingAnimation("jump")) {
      this.walkUntil = 0;
      this.ensureAnimation(scene, "idle");
    }

    if (this.walkUntil) {
      this.walkUntil = 0;
      if (this.isPlayingAnimation("idle")) return;

      this.ensureAnimation(scene, "idle");
    }
  }

  public addListenersToKeyboardAndMouse(scene: BABYLON.Scene, camera: BABYLON.ArcFollowCamera) {
    // Only add listeners for mainPlayer
    if (!this.mainPlayer) return;

    let keyDowns = 0;
    let isPointerDown = false;
    let pointerDownX = 0;
    let pointerDownY = 0;
    let pointerDownTime = 0;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let activePointerId: number | undefined;
    let activePointerType = "mouse";
    let pinchDistance: number | undefined;
    const activePointers = new Map<number, { x: number; y: number }>();
    const coarsePointer = hasCoarsePointer();

    if (coarsePointer) {
      camera.radius = Math.max(camera.radius, 7.5);
      camera.beta = clampCameraBeta(Math.max(camera.beta, Math.PI * 0.33));
    }

    const rotateCamera = (deltaX: number, deltaY: number, sensitivity: number) => {
      camera.alpha += deltaX * -sensitivity;
      camera.beta = clampCameraBeta(camera.beta + deltaY * -sensitivity);
    };

    const zoomCamera = (delta: number) => {
      camera.radius = clampCameraRadius(camera.radius + delta);
    };

    const canvas = scene.getEngine().getRenderingCanvas();
    const onWheel = (event: WheelEvent) => {
      if (!document.hasFocus()) return;

      event.preventDefault();
      if (event.ctrlKey) {
        zoomCamera(event.deltaY * 0.012);
        return;
      }

      const deltaModeScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
      const deltaX = event.deltaX * deltaModeScale;
      const deltaY = event.deltaY * deltaModeScale;
      if (Math.abs(deltaY) >= Math.abs(deltaX)) {
        zoomCamera(deltaY * 0.018);
      } else {
        rotateCamera(deltaX, 0, 0.0045);
      }
    };

    canvas?.addEventListener("wheel", onWheel, { passive: false });
    scene.onDisposeObservable.add(() => {
      canvas?.removeEventListener("wheel", onWheel);
    });

    scene.onPointerObservable.add((pointerInfo) => {
      const event = pointerInfo.event as PointerEvent;
      const pointerId = event.pointerId ?? 0;
      const pointerType = event.pointerType || "mouse";
      switch (pointerInfo.type) {
        case BABYLON.PointerEventTypes.POINTERDOWN: {
          activePointers.set(pointerId, { x: event.clientX, y: event.clientY });

          if (!isPointerDown) {
            isPointerDown = true;
            activePointerId = pointerId;
            activePointerType = pointerType;
            pointerDownX = event.clientX;
            pointerDownY = event.clientY;
            lastPointerX = event.clientX;
            lastPointerY = event.clientY;
            pointerDownTime = performance.now();
          }

          if (activePointers.size === 2) {
            const [first, second] = Array.from(activePointers.values());
            pinchDistance = getPointerDistance(first, second);
          }

          event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture?.(pointerId);
          break;
        }

        case BABYLON.PointerEventTypes.POINTERUP: {
          const tapDistance = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
          const tapDuration = performance.now() - pointerDownTime;

          activePointers.delete(pointerId);
          if (activePointerId === pointerId) {
            isPointerDown = false;
            activePointerId = undefined;
            pinchDistance = undefined;
          }

          if (!this.isAiming && (activePointerType === "touch" || coarsePointer) && tapDistance < 14 && tapDuration < 280 && this.usableObject) {
            this.usableObject.interact(this.character.getScene(), this);
          }

          if (keyDowns == 0) {
            this.inputDirection.z = 0;
          }
          break;
        }

        case BABYLON.PointerEventTypes.POINTERMOVE: {
          if (activePointers.has(pointerId)) {
            activePointers.set(pointerId, { x: event.clientX, y: event.clientY });
          }

          if (activePointers.size === 2 && pinchDistance != null) {
            const [first, second] = Array.from(activePointers.values());
            const nextPinchDistance = getPointerDistance(first, second);
            zoomCamera((pinchDistance - nextPinchDistance) * 0.01);
            pinchDistance = nextPinchDistance;
            break;
          }

          if (isPointerDown && activePointerId === pointerId) {
            if (this.isAiming) {
              lastPointerX = event.clientX;
              lastPointerY = event.clientY;
              break;
            }
            const deltaX = event.movementX || event.clientX - lastPointerX;
            const deltaY = event.movementY || event.clientY - lastPointerY;
            lastPointerX = event.clientX;
            lastPointerY = event.clientY;

            if (activePointerType === "touch" || coarsePointer) {
              rotateCamera(deltaX, deltaY, 0.0038);
            } else {
              rotateCamera(deltaX, deltaY, 0.012);
            }
          }
          break;
        }

        case BABYLON.PointerEventTypes.POINTERDOUBLETAP: {
          if (! this.isAiming) {
            ++this.wantJump;
          }
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
          if (this.isAiming) {
            kbInfo.event.preventDefault();
            this.inputDirection.set(0, 0, 0);
            break;
          }
          if (kbInfo.event.key == 'w' || kbInfo.event.key == 'ArrowUp') {
            this.inputDirection.z = 1;
          } else if (kbInfo.event.key == 's' || kbInfo.event.key == 'ArrowDown') {
            this.inputDirection.z = -1;
          } else if (kbInfo.event.key == 'a' || kbInfo.event.key == 'ArrowLeft') {
            this.inputDirection.x = -1;
          } else if (kbInfo.event.key == 'd' || kbInfo.event.key == 'ArrowRight') {
            this.inputDirection.x = 1;
          } else if (kbInfo.event.key == ' ') {
            if (! this.isAiming) {
              this.wantJump += 1;
            }
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

  public setMoveInput(x: number, z: number) {
    if (this.isAiming) {
      this.inputDirection.set(0, 0, 0);
      return;
    }
    this.inputDirection.x = Math.max(-1, Math.min(1, x));
    this.inputDirection.z = Math.max(-1, Math.min(1, z));
  }

  public getDesiredVelocity(deltaTime, supportInfo, characterOrientation, currentVelocity): BABYLON.Vector3 {
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
      if (this.animation.name == "jump") {
        this.updateGroundMovementAnimation(this.character.getScene());
      }

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
      this.ensureAnimation(this.character.getScene(), "jump")
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
    if (!this.mainPlayer) {
      this.beforeRenderRemote(scene);
      return;
    }

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

  private beforeRenderRemote(scene: BABYLON.Scene) {
    if (!this.remoteTargetPosition) {
      this.updateGroundMovementAnimation(scene, false);
      return;
    }

    const deltaTime = scene.getEngine().getDeltaTime() / 1000;
    const currentPosition = this.character.position.clone();
    const remaining = this.remoteTargetPosition.subtract(currentPosition);
    const distance = remaining.length();

    if (distance < 0.03) {
      this.character.position.copyFrom(this.remoteTargetPosition);
      this.characterPosition = this.remoteTargetPosition.clone();
      this.characterController.setPosition(this.characterPosition.clone());
      this.remoteTargetPosition = undefined;
      if (this.isPlayingAnimation("jump")) {
        this.ensureAnimation(scene, "idle");
      } else {
        this.updateGroundMovementAnimation(scene, false);
      }
      this.updateTextPosition();
      return;
    }

    const step = remaining.scale(Math.min(1, deltaTime * 12));
    const horizontalStep = new BABYLON.Vector3(step.x, 0, step.z);
    if (horizontalStep.lengthSquared() > 0.0005) {
      this.updateRotation(Math.atan2(horizontalStep.x, horizontalStep.z), false);
    }
    this.character.moveWithCollisions(step);
    this.characterPosition = this.character.position.clone();
    this.characterController.setPosition(this.characterPosition.clone());
    this.updateTextPosition();

    if (Math.abs(step.y) > 0.035) {
      this.ensureAnimation(scene, "jump");
    } else if (horizontalStep.lengthSquared() > 0.0005) {
      this.updateGroundMovementAnimation(scene, true);
    } else {
      this.updateGroundMovementAnimation(scene, false);
    }
  }

  public afterPhysics(scene: BABYLON.Scene, camera: BABYLON.ArcFollowCamera) {
    const dt = scene.deltaTime / 1000.0;
    if (dt == 0) return;

    const down = new BABYLON.Vector3(0, -1, 0);
    const support = this.characterController.checkSupport(dt, down);

    BABYLON.Quaternion.FromEulerAnglesToRef(0,camera.rotation.y, 0, this.characterOrientation);
    if (this.inputDirection.lengthSquared() > 0.001) {
      const movementDirection = this.inputDirection.normalizeToNew().applyRotationQuaternion(this.characterOrientation);
      this.updateRotation(Math.atan2(movementDirection.x, movementDirection.z), false);
    }
    const desiredLinearVelocity = this.getDesiredVelocity(dt, support, this.characterOrientation, this.characterController.getVelocity());
    this.characterController.setVelocity(desiredLinearVelocity);
    this.characterController.integrate(dt, support, this.characterGravity);
    this.characterPosition = this.characterController.getPosition();
    if (this.state == "ON_GROUND") {
      this.updateGroundMovementAnimation(
        scene,
      );
    }
  }

  updatePosition(newPosition: BABYLON.Vector3) {
    if (!Number.isFinite(newPosition.x) || !Number.isFinite(newPosition.y) || !Number.isFinite(newPosition.z)) return;

    if (this.mainPlayer) {
      this.characterPosition = newPosition;
      this.character.position = newPosition;
      this.characterController.setPosition(newPosition)
      return;
    }
    const previousPosition = this.character.position.clone();
    const displacement = newPosition.subtract(previousPosition);

    if (displacement.length() > 3) {
      this.character.position.copyFrom(newPosition);
      this.remoteTargetPosition = undefined;
      this.walkUntil = 0;
      this.characterPosition = this.character.position.clone();
      this.characterController.setPosition(this.characterPosition.clone())
      this.updateTextPosition();
      if (this.animation && !this.animation.name.endsWith("idle")) {
        this.ensureAnimation(this.character.getScene(), "idle");
      }
      return;
    } else {
      this.remoteTargetPosition = newPosition.clone();
      const horizontalDisplacement = new BABYLON.Vector3(displacement.x, 0, displacement.z);
      if (horizontalDisplacement.lengthSquared() > 0.0005) {
        this.updateRotation(Math.atan2(horizontalDisplacement.x, horizontalDisplacement.z), false);
      }
    }
  }

  public updateCharacter(characterName?: string) {
    this.changeCharacter(normalizeCharacterName(characterName));
  }

  private updateTextPosition() {
    if (!this.text) return;

    this.text.position = new BABYLON.Vector3(this.characterPosition.x, this.characterPosition.y + 1, this.characterPosition.z)
  }

  updateRotation(rotationY: number, animate = true) {
    if (!this.mainPlayer && this.remoteTargetPosition) {
      const movementDirection = this.remoteTargetPosition.subtract(this.character.position);
      const horizontalMovementDirection = new BABYLON.Vector3(movementDirection.x, 0, movementDirection.z);
      if (horizontalMovementDirection.lengthSquared() > 0.0005) {
        rotationY = Math.atan2(horizontalMovementDirection.x, horizontalMovementDirection.z);
        animate = false;
      }
    }

    this.rotationY = rotationY;
    if (this.mainPlayer || !animate) {
      this.character.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(rotationY, 0, 0)

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
    this.walkUntil = 0;
    this.ensureAnimation(this.character.getScene(), "idle");
  }

  createInteractHint() {
    this.interact = createText("hint_interact", hasCoarsePointer() ? "Tap" : "Press E", this.character.getScene(), 0.9);
    this.interact.position = this.character.position.clone();
    this.interact.position.y += 1;
  }


  dance() {
    this.characterController.setVelocity(BABYLON.Vector3.Zero());
    this.walkUntil = 0;
    this.inputDirection = BABYLON.Vector3.Zero();

    this.ensureAnimation(this.character.getScene(), "dance1");
    if (this.onInteract) {
      this.onInteract("player-dance");
    }
  }

  dispose() {
    this.disposeCharacterInstance();
    this.characterController.dispose();
    this.text?.dispose();
  }
}
