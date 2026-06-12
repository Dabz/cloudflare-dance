import * as BABYLON from "@babylonjs/core";
import type { PlayerCharacter } from "./player";
import { UsableObject } from "./object";
import { createPlaygroundAction } from "./playground/createAction";
import type { PlaygroundAction, PlaygroundActionContext } from "./playground/types";

type ShadowCaster = (mesh?: BABYLON.AbstractMesh | null) => void;
type PlaygroundInteractionPublisher = (actionId: string, objectId: string, objectState?: unknown) => void;
type MeshExtras = Record<string, unknown>;

const defaultInteractionLabels: Record<string, string> = {
  "ball-chaos": "Explode balls",
  bowl: "Bowl it",
  "toggle-light-0": "Toggle MINT",
  "toggle-light-1": "Toggle PINK",
  "toggle-light-2": "Toggle GOLD",
  "toggle-disco": "Toggle disco",
  "launch-ball": "Launch balls",
  "super-bounce": "Super bounce",
  "fan-blast": "Fan blast",
  "moon-gravity": "Moon gravity",
  "paint-toys": "Repaint toys",
  "spin-merry": "Spin faster",
  teleport: "Teleport",
  "dance-party": "Dance party",
  "bonk-toys": "Bonk nearby toys",
  "sphere-light": "Light sphere",
  "explode-balls": "Balls?",
};

const defaultInteractionDistances: Record<string, number> = {
  "ball-chaos": 2.8,
  "explode-balls": 9,
  "bowl": 3.2,
  "toggle-light-0": 2.4,
  "toggle-light-1": 2.4,
  "toggle-light-2": 2.4,
  "toggle-disco": 2.6,
  "launch-ball": 3,
  "super-bounce": 3,
  "fan-blast": 3.8,
  "moon-gravity": 2.8,
  "paint-toys": 2.8,
  "spin-merry": 3,
  "teleport": 3.2,
  "dance-party": 3,
  "bonk-toys": 3.2,
  "sphere-light": 9,
};

const neonColors = [
  new BABYLON.Color3(1, 0.12, 0.2),
  new BABYLON.Color3(0.15, 0.85, 1),
  new BABYLON.Color3(0.95, 0.95, 0.12),
  new BABYLON.Color3(0.25, 1, 0.35),
  new BABYLON.Color3(0.9, 0.2, 1),
  new BABYLON.Color3(1, 0.52, 0.08),
];

function randomColor(): BABYLON.Color3 {
  return neonColors[Math.floor(Math.random() * neonColors.length)].clone();
}

function createMaterial(name: string, scene: BABYLON.Scene, color: BABYLON.Color3, emissive = false) {
  const material = new BABYLON.StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.specularColor = new BABYLON.Color3(0.85, 0.85, 0.85);
  if (emissive) material.emissiveColor = color.scale(0.14);
  return material;
}

function setMeshColor(mesh: BABYLON.AbstractMesh, color: BABYLON.Color3) {
  const material = mesh.material;
  if (material instanceof BABYLON.StandardMaterial) {
    material.diffuseColor = color;
    material.emissiveColor = color.scale(0.18);
  }
}

function createLabel(name: string, text: string, position: BABYLON.Vector3, scene: BABYLON.Scene) {
  const texture = new BABYLON.DynamicTexture(`${name}_texture`, { width: 512, height: 128 }, scene);
  const context = texture.getContext() as CanvasRenderingContext2D;
  context.clearRect(0, 0, 512, 128);
  context.fillStyle = "rgba(12, 11, 26, 0.78)";
  context.fillRect(0, 0, 512, 128);
  context.strokeStyle = "#ffcf35";
  context.lineWidth = 8;
  context.strokeRect(8, 8, 496, 112);
  context.fillStyle = "#fff7d1";
  context.font = "bold 44px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 64);
  texture.update();

  const label = BABYLON.MeshBuilder.CreatePlane(name, { width: 4.2, height: 1.05 }, scene);
  label.position = position;
  label.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
  label.isPickable = false;
  const material = new BABYLON.StandardMaterial(`${name}_material`, scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.backFaceCulling = false;
  label.material = material;
  return label;
}

function applyImpulseToBody(aggregate: BABYLON.PhysicsAggregate, impulse: BABYLON.Vector3) {
  aggregate.body.applyImpulse(impulse, aggregate.transformNode.getAbsolutePosition());
}

function makeCollidable(mesh: BABYLON.AbstractMesh) {
  mesh.checkCollisions = true;
  return mesh;
}

function meshExtras(mesh: BABYLON.AbstractMesh): MeshExtras {
  const metadata = (mesh.metadata ?? {}) as MeshExtras;
  const gltf = (metadata.gltf ?? {}) as MeshExtras;
  const extras = (gltf.extras ?? metadata.extras ?? {}) as MeshExtras;
  return { ...metadata, ...extras };
}

function getString(extras: MeshExtras, key: string): string | undefined {
  const value = extras[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getInteractionId(extras: MeshExtras): string | undefined {
  const interactionId = extras.interactionId;
  if (typeof interactionId === "string" && interactionId.trim()) return interactionId;
  if (interactionId && typeof interactionId === "object") {
    const id = (interactionId as MeshExtras).id;
    if (typeof id === "string" && id.trim()) return id;
  }

  return getString(extras, "interactiveId");
}

function getNumber(extras: MeshExtras, key: string): number | undefined {
  const value = extras[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function getBoolean(extras: MeshExtras, key: string): boolean {
  const value = extras[key];
  return value === true || value === "true" || value === 1 || value === "1";
}

function getPhysicsShape(mesh: BABYLON.AbstractMesh, shape?: string) {
  void mesh;
  switch (shape?.toLowerCase()) {
    case "sphere":
      return BABYLON.PhysicsShapeType.SPHERE;
    case "cylinder":
      return BABYLON.PhysicsShapeType.CYLINDER;
    case "mesh":
      return BABYLON.PhysicsShapeType.MESH;
    case "box":
    default:
      return BABYLON.PhysicsShapeType.BOX;
  }
}

function hasPhysicsBody(mesh: BABYLON.AbstractMesh) {
  return Boolean((mesh as BABYLON.AbstractMesh & { physicsBody?: unknown }).physicsBody);
}

export class PlaygroundInteractable extends UsableObject {
  mesh: BABYLON.AbstractMesh;
  label: BABYLON.AbstractMesh;
  originalLabel?: BABYLON.AbstractMesh;
  id: string;
  objectId: string;
  private action: PlaygroundAction;
  private publish?: PlaygroundInteractionPublisher;

  constructor(id: string, objectId: string, mesh: BABYLON.AbstractMesh, label: BABYLON.AbstractMesh, originalLabel: BABYLON.AbstractMesh | undefined, distance: number, action: PlaygroundAction, publish?: PlaygroundInteractionPublisher) {
    super();
    this.id = id;
    this.objectId = objectId;
    this.mesh = mesh;
    this.label = label;
    this.originalLabel = originalLabel;
    this.InteractDistance = distance;
    this.action = action;
    this.publish = publish;
  }

  public interact(scene: BABYLON.Scene, mainPlayer: PlayerCharacter) {
    this.run(scene, mainPlayer, true);
  }

  public run(scene: BABYLON.Scene, player?: PlayerCharacter, broadcast = false) {
    this.action.run(scene, player, this);
    if (broadcast) this.publish?.(this.id, this.objectId, this.getState());
  }

  public getState() {
    return this.action.getState();
  }

  public applyState(state: unknown) {
    this.action.applyState(state, this);
  }
}

export class Playground implements PlaygroundActionContext {
  private objects: PlaygroundInteractable[] = [];
  public dynamicBodies: BABYLON.PhysicsAggregate[] = [];
  public fanBodies: BABYLON.PhysicsAggregate[] = [];
  private launchCount = 0;
  private discoEnabled = true;
  private merrySpeed = 0.9;
  private lowGravityUntil = 0;
  public addShadowCaster: ShadowCaster;
  public discoLights: BABYLON.PointLight[] = [];
  private fanRotor?: BABYLON.AbstractMesh;
  private merry?: BABYLON.AbstractMesh;
  private publish?: PlaygroundInteractionPublisher;
  private teleportDestinations: BABYLON.AbstractMesh[] = [];
  private registeredObjects = new Set<string>();

  constructor(addShadowCaster: ShadowCaster, publish?: PlaygroundInteractionPublisher) {
    this.addShadowCaster = addShadowCaster;
    this.publish = publish;
  }

  public init(scene: BABYLON.Scene) {
    this.objects = [];
    this.dynamicBodies = [];
    this.fanBodies = [];
    this.discoLights = [];
    this.teleportDestinations = [];
    this.registeredObjects.clear();

    for (const mesh of scene.meshes) {
      this.bindImportedMesh(mesh);
    }

    for (const mesh of scene.meshes) {
      const extras = meshExtras(mesh);
      const interactionId = getInteractionId(extras);
      if (interactionId) {
        this.addImportedObject(interactionId, mesh, extras);
      }
    }

    for (const node of scene.transformNodes) {
      const extras = meshExtras(node as BABYLON.AbstractMesh);
      const interactionId = getInteractionId(extras);
      if (!interactionId) continue;

      const mesh = node.getChildMeshes(false).find((child) => child.getTotalVertices() > 0);
      if (mesh) this.addImportedObject(interactionId, mesh, extras);
    }
  }

  public interact(actionId: string, player?: PlayerCharacter, objectId?: string, objectState?: unknown) {
    const object = this.findObject(actionId, objectId);
    if (!object) return;

    object.run(object.mesh.getScene(), player, false);
    if (objectState !== undefined) object.applyState(objectState);
  }

  public applyObjectStates(states: Record<string, unknown> = {}) {
    for (const object of this.objects) {
      if (object.objectId in states) object.applyState(states[object.objectId]);
    }
  }

  public beforeRender(scene: BABYLON.Scene, mainPlayer?: PlayerCharacter) {
    const delta = scene.getEngine().getDeltaTime() / 1000;
    const time = performance.now() * 0.001;

    if (this.fanRotor) this.fanRotor.rotation.z += delta * 16;
    if (this.merry) this.merry.rotation.y += delta * this.merrySpeed;

    if (this.discoEnabled) {
      this.discoLights.forEach((light, index) => {
        light.diffuse = BABYLON.Color3.FromHSV((time * 100 + index * 90) % 360, 0.9, 1);
        light.intensity = 11 + Math.sin(time * 5 + index) * 4;
      });
    }

    for (const body of this.fanBodies) {
      const pos = body.transformNode.getAbsolutePosition();
      if (pos.x > 16 && pos.x < 30 && pos.z > -22 && pos.z < -10 && pos.y < 5) {
        applyImpulseToBody(body, new BABYLON.Vector3(0.28, 0.08, 0.03));
      }
    }

    if (this.lowGravityUntil && Date.now() > this.lowGravityUntil) {
      scene.getPhysicsEngine()?.setGravity(new BABYLON.Vector3(0, -9.8, 0));
      this.lowGravityUntil = 0;
    }

    if (!mainPlayer) return;

    let closest: PlaygroundInteractable | undefined;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const object of this.objects) {
      const distance = BABYLON.Vector3.Distance(object.mesh.getAbsolutePosition(), mainPlayer.character.getAbsolutePosition());
      const canInteract = distance < object.InteractDistance;
      object.label.setEnabled(canInteract);
      object.originalLabel?.setEnabled(!canInteract);
      if (canInteract && distance < closestDistance) {
        closest = object;
        closestDistance = distance;
      }
    }

    if (closest) {
      mainPlayer.usableObject = closest;
    } else if (mainPlayer.usableObject instanceof PlaygroundInteractable) {
      mainPlayer.usableObject = null;
    }
  }

  private bindImportedMesh(mesh: BABYLON.AbstractMesh) {
    const extras = meshExtras(mesh);
    const role = getString(extras, "playgroundRole") ?? getString(extras, "role");
    const interactionId = getInteractionId(extras);

    if (role === "teleport-destination" || getBoolean(extras, "teleportDestination")) {
      this.teleportDestinations.push(mesh);
      mesh.isPickable = false;
    }

    if (role === "fan-rotor" || interactionId === "fan-blast") {
      this.fanRotor = mesh;
    }

    if (role === "merry" || interactionId === "spin-merry") {
      this.merry = mesh;
    }

    if (role === "disco-light" || getBoolean(extras, "discoLight")) {
      this.discoLights.push(this.createDiscoLight(mesh, this.discoLights.length));
    }

    if (getBoolean(extras, "dynamicBody") || getBoolean(extras, "fanAffected")) {
      const aggregate = this.addPhysics(mesh, extras, getNumber(extras, "mass") ?? 0.35);
      if (aggregate) this.dynamicBodies.push(aggregate);
      if (aggregate && getBoolean(extras, "fanAffected")) this.fanBodies.push(aggregate);
    }
  }

  private addImportedObject(id: string, mesh: BABYLON.AbstractMesh, extras: MeshExtras) {
    const registrationKey = `${id}:${mesh.uniqueId}`;
    if (this.registeredObjects.has(registrationKey)) return;

    const action = createPlaygroundAction(id, mesh, this);
    if (!action) {
      console.warn(`Unknown playground interactionId: ${id}`);
      return;
    }

    this.registeredObjects.add(registrationKey);

    makeCollidable(mesh);
    mesh.isPickable = false;
    this.addShadowCaster(mesh);

    const mass = getNumber(extras, "mass") ?? this.defaultMassForInteraction(id);
    const aggregate = this.addPhysics(mesh, extras, mass);
    if (aggregate && mass > 0) {
      this.dynamicBodies.push(aggregate);
      this.fanBodies.push(aggregate);
    }

    if (id === "spin-merry") this.merry = mesh;
    if (id === "fan-blast") this.fanRotor = mesh;

    const objectId = this.getObjectId(id, mesh, extras);

    const distance = getNumber(extras, "interactionDistance") ?? defaultInteractionDistances[id] ?? 3;
    const labelText = getString(extras, "interactionLabel") ?? defaultInteractionLabels[id] ?? id;
    const labelOffsetY = getNumber(extras, "interactionLabelOffsetY") ?? mesh.getBoundingInfo().boundingBox.extendSize.scale(2).y + 1.8;
    const label = createLabel(`${mesh.name}_interact_label`, labelText, mesh.getAbsolutePosition().add(new BABYLON.Vector3(0, labelOffsetY, 0)), mesh.getScene());
    label.setEnabled(false);

    const topLabelText = getString(extras, "topLabel");
    const topLabel = topLabelText
      ? createLabel(`${mesh.name}_top_label`, topLabelText, mesh.getAbsolutePosition().add(new BABYLON.Vector3(0, getNumber(extras, "topLabelOffsetY") ?? 1.55, 0)), mesh.getScene())
      : undefined;

    this.objects.push(new PlaygroundInteractable(id, objectId, mesh, label, topLabel, distance, action, this.publish));
  }

  private findObject(actionId: string, objectId?: string) {
    if (objectId) {
      const object = this.objects.find((candidate) => candidate.objectId === objectId);
      if (object) return object;
    }

    return this.objects.find((candidate) => candidate.id === actionId);
  }

  private getObjectId(id: string, mesh: BABYLON.AbstractMesh, extras: MeshExtras) {
    return getString(extras, "objectId")
      ?? getString(extras, "stateId")
      ?? `${id}:${mesh.name}`;
  }

  public createDiscoLight(mesh: BABYLON.AbstractMesh, index: number, color = neonColors[(index + 1) % neonColors.length]) {
    const light = new BABYLON.DirectionalLight(`disco_light_${index}_${mesh.name}`, BABYLON.Vector3.Zero(), mesh.getScene());
    light.position = new BABYLON.Vector3(28, 44, -24);
    light.setDirectionToTarget(new BABYLON.Vector3(0, 0, 0));

    light.diffuse = color;
    light.specular = color;
    light.intensity = 11;
    light.range = 36;
    return light;
  }

  private addPhysics(mesh: BABYLON.AbstractMesh, extras: MeshExtras, mass: number) {
    if (hasPhysicsBody(mesh)) return undefined;

    return new BABYLON.PhysicsAggregate(
      mesh,
      getPhysicsShape(mesh, getString(extras, "physicsShape")),
      {
        mass,
        friction: getNumber(extras, "friction") ?? undefined,
        restitution: getNumber(extras, "restitution") ?? undefined,
      },
    );
  }

  public ensureDynamicBody(mesh: BABYLON.AbstractMesh, mass: number, shape: BABYLON.PhysicsShapeType) {
    const existing = this.dynamicBodies.find((body) => body.transformNode === mesh);
    if (existing) return existing;

    const aggregate = new BABYLON.PhysicsAggregate(mesh, shape, { mass });
    this.dynamicBodies.push(aggregate);
    this.fanBodies.push(aggregate);
    return aggregate;
  }

  private defaultMassForInteraction(id: string) {
    if (id === "bowl") return 1.4;
    return 0;
  }

  public pickTeleportDestination() {
    if (this.teleportDestinations.length > 0) {
      const destination = this.teleportDestinations[Math.floor(Math.random() * this.teleportDestinations.length)];
      return destination.getAbsolutePosition().clone();
    }

    const destinations = [
      new BABYLON.Vector3(28, 3, 34),
      new BABYLON.Vector3(-28, 4, -20),
      new BABYLON.Vector3(20, 4, 8),
      new BABYLON.Vector3(0, 5, 0),
    ];
    return destinations[Math.floor(Math.random() * destinations.length)].clone();
  }

  public createMaterial(name: string, scene: BABYLON.Scene, color: BABYLON.Color3, emissive = false) {
    return createMaterial(name, scene, color, emissive);
  }

  public randomColor() {
    return randomColor();
  }

  public setMeshColor(mesh: BABYLON.AbstractMesh, color: BABYLON.Color3) {
    setMeshColor(mesh, color);
  }

  public applyImpulseToBody(aggregate: BABYLON.PhysicsAggregate, impulse: BABYLON.Vector3) {
    applyImpulseToBody(aggregate, impulse);
  }

  public makeCollidable(mesh: BABYLON.AbstractMesh) {
    return makeCollidable(mesh);
  }

  public nextLaunchCount() {
    this.launchCount += 1;
    return this.launchCount;
  }

  public toggleDisco() {
    this.discoEnabled = !this.discoEnabled;
    return this.discoEnabled;
  }

  public setDiscoEnabled(enabled: boolean) {
    this.discoEnabled = enabled;
  }

  public isDiscoEnabled() {
    return this.discoEnabled;
  }

  public enableDisco() {
    this.discoEnabled = true;
  }

  public toggleMerrySpeed() {
    this.merrySpeed = this.merrySpeed > 5 ? 0.9 : this.merrySpeed + 1.15;
  }

  public setMerrySpeed(speed: number) {
    this.merrySpeed = speed;
  }

  public getMerrySpeed() {
    return this.merrySpeed;
  }

  public setLowGravityUntil(value: number) {
    this.lowGravityUntil = value;
  }

  public burstConfetti(scene: BABYLON.Scene, position: BABYLON.Vector3, count: number) {
    const emitter = BABYLON.MeshBuilder.CreateSphere(`confetti_emitter_${Date.now()}`, { diameter: 0.08, segments: 4 }, scene);
    emitter.position = position;
    emitter.isVisible = false;
    const particles = new BABYLON.ParticleSystem(`confetti_${Date.now()}`, count, scene);
    const texture = new BABYLON.DynamicTexture(`confetti_texture_${Date.now()}`, { width: 16, height: 16 }, scene);
    const context = texture.getContext() as CanvasRenderingContext2D;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 16, 16);
    texture.update();
    particles.particleTexture = texture;
    particles.emitter = emitter;
    particles.minEmitBox = new BABYLON.Vector3(-0.4, 0, -0.4);
    particles.maxEmitBox = new BABYLON.Vector3(0.4, 0.15, 0.4);
    particles.color1 = new BABYLON.Color4(1, 0.2, 0.15, 1);
    particles.color2 = new BABYLON.Color4(0.1, 0.8, 1, 1);
    particles.colorDead = new BABYLON.Color4(1, 1, 0.2, 0);
    particles.minSize = 0.12;
    particles.maxSize = 0.36;
    particles.minLifeTime = 0.45;
    particles.maxLifeTime = 1.25;
    particles.emitRate = count * 8;
    particles.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    particles.gravity = new BABYLON.Vector3(0, -5.5, 0);
    particles.direction1 = new BABYLON.Vector3(-4, 5, -4);
    particles.direction2 = new BABYLON.Vector3(4, 8, 4);
    particles.minAngularSpeed = -10;
    particles.maxAngularSpeed = 10;
    particles.targetStopDuration = 0.18;
    particles.disposeOnStop = true;
    particles.start();
    setTimeout(() => emitter.dispose(), 1800);
  }
}
