import * as BABYLON from "@babylonjs/core";
import type { Nullable } from "@babylonjs/core";
import type { PlayerCharacter } from "../player";
import { PlaygroundAction, type PlaygroundActionContext, type PlaygroundActionObject } from "./types";

interface CannonAimState {
  aiming: boolean;
  ownerId?: string;
  yaw: number;
  pitch: number;
  fireId?: number;
  transient?: boolean;
}

const AIM_SENSITIVITY_X = 0.002;
const AIM_SENSITIVITY_Y = 0.002;
const MIN_PITCH = -0.18;
const MAX_PITCH = 0.62;
const MIN_YAWN = -1 * Math.PI / 2 - 0.3;
const MAX_YAWN = -1 * Math.PI / 2 + 0.3;
const CROSSHAIR_DISTANCE = 8;
const CAMERA_BACK_DISTANCE = 3.6;
const CAMERA_HEIGHT = 1.55;

export class LaunchBall extends PlaygroundAction {
  private ownerId?: string;
  private yaw = 0;
  private pitch = 0.12;
  private fireId = 0;
  private aimingPlayer?: PlayerCharacter;
  private pointerObserver?: Nullable<BABYLON.Observer<BABYLON.PointerInfo>>;
  private keyboardObserver?: Nullable<BABYLON.Observer<BABYLON.KeyboardInfo>>;
  private crosshair?: BABYLON.LinesMesh;
  private lastAimBroadcast = 0;
  private baseWorldRotation?: BABYLON.Quaternion;
  private baseForwardWorld?: BABYLON.Vector3;
  private previousCanvasCursor?: string;

  constructor(context: PlaygroundActionContext) {
    super(context);
  }

  run(scene: BABYLON.Scene, player: PlayerCharacter | undefined, object: PlaygroundActionObject) {
    if (!player) return;
    if (this.ownerId && this.ownerId !== player.id) return;

    if (this.ownerId === player.id) {
      this.leaveAim(object, true);
      return;
    }

    this.enterAim(scene, player, object);
  }

  getState(): CannonAimState {
    return {
      aiming: Boolean(this.ownerId),
      ownerId: this.ownerId,
      yaw: this.yaw,
      pitch: this.pitch,
      fireId: this.fireId || undefined,
    };
  }

  applyState(state: unknown, object: PlaygroundActionObject) {
    if (!state || typeof state !== "object") return;
    const nextState = state as Partial<CannonAimState>;
    if (typeof nextState.yaw === "number") this.yaw = nextState.yaw;
    if (typeof nextState.pitch === "number") this.pitch = nextState.pitch;
    if (!nextState.aiming && this.aimingPlayer) {
      this.leaveAim(object, false);
      return;
    }

    this.ownerId = nextState.aiming ? nextState.ownerId : undefined;
    if (!nextState.aiming) {
      this.disposeCrosshair();
      return;
    }

    this.applyAimRotation(object);
    this.ensureCrosshair(object);
    this.updateCrosshair(object);

    if (typeof nextState.fireId === "number" && nextState.fireId !== this.fireId) {
      this.fireId = nextState.fireId;
      this.fire(object, nextState.ownerId, false);
    }
  }

  private enterAim(scene: BABYLON.Scene, player: PlayerCharacter, object: PlaygroundActionObject) {
    this.ownerId = player.id;
    this.aimingPlayer = player;
    player.isAiming = true;
    player.setMoveInput(0, 0);
    player.characterController.setVelocity(BABYLON.Vector3.Zero());
    this.hideCursor(scene);
    this.ensureBaseAimFrame(object);
    const direction = object.mesh.getDirection(BABYLON.Axis.Z).normalize();
    this.yaw = Math.atan2(direction.x, direction.z);
    this.pitch = Math.asin(Math.max(-1, Math.min(1, direction.y))) || 0.12;
    this.applyAimRotation(object);
    this.ensureCrosshair(object);
    this.addAimListeners(scene, object);
  }

  private leaveAim(object: PlaygroundActionObject, publish: boolean) {
    if (this.aimingPlayer) this.aimingPlayer.isAiming = false;
    this.aimingPlayer = undefined;
    this.ownerId = undefined;
    this.removeAimListeners();
    this.disposeCrosshair();
    this.restoreCursor(object.mesh.getScene());
    this.context.clearAimCamera();
    if (publish) this.context.publishInteraction(object.id, object.objectId, this.getState());
  }

  private hideCursor(scene: BABYLON.Scene) {
    const canvas = scene.getEngine().getRenderingCanvas();
    if (!canvas) return;

    this.previousCanvasCursor = canvas.style.cursor;
    canvas.style.cursor = "none";
  }

  private restoreCursor(scene: BABYLON.Scene) {
    const canvas = scene.getEngine().getRenderingCanvas();
    if (!canvas) return;

    canvas.style.cursor = this.previousCanvasCursor ?? "";
    this.previousCanvasCursor = undefined;
  }

  private addAimListeners(scene: BABYLON.Scene, object: PlaygroundActionObject) {
    this.removeAimListeners();
    this.pointerObserver = scene.onPointerObservable.add((pointerInfo) => {
      if (!this.ownerId) return;
      const event = pointerInfo.event as PointerEvent;
      if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE) {
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;
        this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch - movementY * AIM_SENSITIVITY_Y));
        this.yaw = Math.min(MAX_YAWN, Math.max(MIN_YAWN, this.yaw + movementX * AIM_SENSITIVITY_X));
        this.applyAimRotation(object);
        this.updateCrosshair(object);
        this.publishAimState(object);
      }
      if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP) {
        this.fire(object, this.ownerId, true);
      }
    });
    this.keyboardObserver = scene.onKeyboardObservable.add((keyboardInfo) => {
      if (!this.ownerId || keyboardInfo.type !== BABYLON.KeyboardEventTypes.KEYDOWN) return;
      if (keyboardInfo.event.key !== " ") return;

      keyboardInfo.event.preventDefault();
      this.fire(object, this.ownerId, true);
    });
  }

  private removeAimListeners() {
    const scene = this.aimingPlayer?.character?.getScene();
    if (scene && this.pointerObserver) scene.onPointerObservable.remove(this.pointerObserver);
    if (scene && this.keyboardObserver) scene.onKeyboardObservable.remove(this.keyboardObserver);
    this.pointerObserver = undefined;
    this.keyboardObserver = undefined;
  }

  private publishAimState(object: PlaygroundActionObject) {
    const now = performance.now();
    if (now - this.lastAimBroadcast < 80) return;

    this.lastAimBroadcast = now;
    this.context.publishInteraction(object.id, object.objectId, { ...this.getState(), transient: true });
  }

  private fire(object: PlaygroundActionObject, ownerId: string | undefined, publish: boolean) {
    const scene = object.mesh.getScene();
    const launchCount = this.context.nextLaunchCount();
    const ball = BABYLON.MeshBuilder.CreateSphere(`launched_goof_${launchCount}`, { diameter: 0.62, segments: 18 }, scene);
    const direction = this.getAimDirection();
    const muzzlePosition = object.mesh.getAbsolutePosition().add(direction.scale(1.2)).add(new BABYLON.Vector3(0, 0.2, 0));
    ball.position = muzzlePosition;
    this.createMuzzleExplosion(scene, muzzlePosition, direction);
    this.context.makeCollidable(ball);
    ball.material = this.context.createMaterial(`launched_goof_${launchCount}_mat`, scene, this.context.randomColor(), true);
    const aggregate = new BABYLON.PhysicsAggregate(ball, BABYLON.PhysicsShapeType.SPHERE, { mass: 0.36, restitution: 0.9, friction: 0.22 });
    this.context.applyImpulseToBody(aggregate, direction.scale(15));
    this.context.dynamicBodies.push(aggregate);
    this.context.fanBodies.push(aggregate);
    this.context.addShadowCaster(ball);
    this.context.registerProjectile(ball, ownerId);

    if (publish) {
      this.fireId += 1;
      this.context.publishInteraction(object.id, object.objectId, { ...this.getState(), fireId: this.fireId, transient: true });
    }
  }

  private createMuzzleExplosion(scene: BABYLON.Scene, position: BABYLON.Vector3, direction: BABYLON.Vector3) {
    const flash = BABYLON.MeshBuilder.CreateSphere(`cannon_flash_${Date.now()}`, { diameter: 1.15, segments: 12 }, scene);
    flash.position.copyFrom(position);
    flash.isPickable = false;
    const flashMaterial = new BABYLON.StandardMaterial(`${flash.name}_material`, scene);
    flashMaterial.emissiveColor = new BABYLON.Color3(1, 0.48, 0.08);
    flashMaterial.diffuseColor = new BABYLON.Color3(1, 0.2, 0.02);
    flashMaterial.alpha = 0.72;
    flash.material = flashMaterial;

    const particles = new BABYLON.ParticleSystem(`cannon_explosion_${Date.now()}`, 90, scene);
    const texture = new BABYLON.DynamicTexture(`cannon_explosion_texture_${Date.now()}`, { width: 16, height: 16 }, scene);
    const context = texture.getContext() as CanvasRenderingContext2D;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 16, 16);
    texture.update();
    particles.particleTexture = texture;
    particles.emitter = position;
    particles.minEmitBox = new BABYLON.Vector3(-0.18, -0.18, -0.18);
    particles.maxEmitBox = new BABYLON.Vector3(0.18, 0.18, 0.18);
    particles.color1 = new BABYLON.Color4(1, 0.52, 0.06, 1);
    particles.color2 = new BABYLON.Color4(1, 0.08, 0.02, 1);
    particles.colorDead = new BABYLON.Color4(0.12, 0.1, 0.1, 0);
    particles.minSize = 0.16;
    particles.maxSize = 0.52;
    particles.minLifeTime = 0.16;
    particles.maxLifeTime = 0.48;
    particles.emitRate = 800;
    particles.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    particles.gravity = new BABYLON.Vector3(0, -2.5, 0);
    particles.direction1 = direction.scale(5).add(new BABYLON.Vector3(-2.4, -0.4, -2.4));
    particles.direction2 = direction.scale(9).add(new BABYLON.Vector3(2.4, 2.2, 2.4));
    particles.minAngularSpeed = -12;
    particles.maxAngularSpeed = 12;
    particles.targetStopDuration = 0.08;
    particles.disposeOnStop = true;
    particles.start();

    const start = performance.now();
    const observer = scene.onBeforeRenderObservable.add(() => {
      const progress = Math.min(1, (performance.now() - start) / 180);
      flash.scaling.setAll(1 + progress * 1.5);
      flashMaterial.alpha = 0.72 * (1 - progress);
      if (progress < 1) return;

      scene.onBeforeRenderObservable.remove(observer);
      flash.dispose();
      flashMaterial.dispose();
    });
  }

  private getAimDirection() {
    const cosPitch = Math.cos(this.pitch);
    return new BABYLON.Vector3(
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosPitch,
    ).normalize();
  }

  private applyAimRotation(object: PlaygroundActionObject) {
    this.ensureBaseAimFrame(object);
    if (!this.baseForwardWorld || !this.baseWorldRotation) return;

    const targetDirection = this.getAimDirection();
    const worldDelta = this.getRotationBetweenUnitVectors(this.baseForwardWorld, targetDirection);
    const targetWorldRotation = worldDelta.multiply(this.baseWorldRotation);
    const parent = object.mesh.parent;
    if (parent) {
      const parentRotation = new BABYLON.Quaternion();
      parent.computeWorldMatrix(true).decompose(undefined, parentRotation, undefined);
      object.mesh.rotationQuaternion = parentRotation.conjugate().multiply(targetWorldRotation);
      object.mesh.rotationQuaternion.x *= -1;;
      return;
    }

    object.mesh.rotationQuaternion = targetWorldRotation;
  }

  private ensureBaseAimFrame(object: PlaygroundActionObject) {
    if (this.baseForwardWorld && this.baseWorldRotation) return;

    const worldMatrix = object.mesh.computeWorldMatrix(true).clone();
    const worldRotation = new BABYLON.Quaternion();
    worldMatrix.decompose(undefined, worldRotation, undefined);
    this.baseWorldRotation = worldRotation.normalize();
    this.baseForwardWorld = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Z, worldMatrix).normalize();
  }

  private getRotationBetweenUnitVectors(from: BABYLON.Vector3, to: BABYLON.Vector3) {
    const source = from.normalizeToNew();
    const target = to.normalizeToNew();
    const dot = BABYLON.Vector3.Dot(source, target);

    if (dot > 0.999999) return BABYLON.Quaternion.Identity();
    if (dot < -0.999999) {
      let axis = BABYLON.Vector3.Cross(BABYLON.Axis.X, source);
      if (axis.lengthSquared() < 0.000001) axis = BABYLON.Vector3.Cross(BABYLON.Axis.Y, source);
      axis.normalize();
      return BABYLON.Quaternion.RotationAxis(axis, Math.PI);
    }

    const cross = BABYLON.Vector3.Cross(source, target);
    const rotation = new BABYLON.Quaternion(cross.x, cross.y, cross.z, 1 + dot);
    rotation.normalize();
    return rotation;
  }

  private ensureCrosshair(object: PlaygroundActionObject) {
    if (this.crosshair) return;

    this.crosshair = BABYLON.MeshBuilder.CreateLines(`${object.mesh.name}_aim_crosshair`, {
      points: [
        new BABYLON.Vector3(-0.35, 0, 0), new BABYLON.Vector3(0.35, 0, 0),
        new BABYLON.Vector3(0, -0.35, 0), new BABYLON.Vector3(0, 0.35, 0),
      ],
      updatable: true,
    }, object.mesh.getScene());
    this.crosshair.color = new BABYLON.Color3(1, 0.34, 0.02);
    this.updateCrosshair(object);
  }

  private updateCrosshair(object: PlaygroundActionObject) {
    if (!this.crosshair) return;

    const direction = this.getAimDirection();
    const cannonPosition = object.mesh.getAbsolutePosition();
    const target = cannonPosition.add(direction.scale(CROSSHAIR_DISTANCE));
    this.crosshair.position = target;
    this.crosshair.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    if (this.aimingPlayer) {
      const cameraPosition = cannonPosition
        .subtract(direction.scale(CAMERA_BACK_DISTANCE))
        .add(new BABYLON.Vector3(0, CAMERA_HEIGHT, 0));
      this.context.updateAimCamera(cameraPosition, target);
    }
  }

  private disposeCrosshair() {
    this.crosshair?.dispose();
    this.crosshair = undefined;
  }
}
