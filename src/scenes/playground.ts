import * as BABYLON from "@babylonjs/core";
import type { PlayerCharacter } from "./player";
import { UsableObject } from "./object";

type ShadowCaster = (mesh?: BABYLON.AbstractMesh | null) => void;
type PlaygroundAction = (scene: BABYLON.Scene, player: PlayerCharacter | undefined, object: PlaygroundInteractable) => void;
type PlaygroundInteractionPublisher = (actionId: string) => void;
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
};

const defaultInteractionDistances: Record<string, number> = {
  "ball-chaos": 2.8,
  bowl: 3.2,
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
  teleport: 3.2,
  "dance-party": 3,
  "bonk-toys": 3.2,
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
  private action: PlaygroundAction;
  private publish?: PlaygroundInteractionPublisher;

  constructor(id: string, mesh: BABYLON.AbstractMesh, label: BABYLON.AbstractMesh, originalLabel: BABYLON.AbstractMesh | undefined, distance: number, action: PlaygroundAction, publish?: PlaygroundInteractionPublisher) {
    super();
    this.id = id;
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
    this.action(scene, player, this);
    if (broadcast) this.publish?.(this.id);
  }
}

export class Playground {
  private objects: PlaygroundInteractable[] = [];
  private dynamicBodies: BABYLON.PhysicsAggregate[] = [];
  private fanBodies: BABYLON.PhysicsAggregate[] = [];
  private launchCount = 0;
  private discoEnabled = true;
  private merrySpeed = 0.9;
  private lowGravityUntil = 0;
  private addShadowCaster: ShadowCaster;
  private discoLights: BABYLON.PointLight[] = [];
  private fanRotor?: BABYLON.AbstractMesh;
  private merry?: BABYLON.AbstractMesh;
  private publish?: PlaygroundInteractionPublisher;
  private teleportDestinations: BABYLON.AbstractMesh[] = [];

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

    for (const mesh of scene.meshes) {
      this.bindImportedMesh(mesh);
    }

    for (const mesh of scene.meshes) {
      const extras = meshExtras(mesh);
      const interactionId = getString(extras, "interactionId");
      if (interactionId) {
        this.addImportedObject(interactionId, mesh, extras);
      }
    }
  }

  public interact(actionId: string, player?: PlayerCharacter) {
    const object = this.objects.find((candidate) => candidate.id === actionId);
    if (!object) return;

    object.run(object.mesh.getScene(), player, false);
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
    const interactionId = getString(extras, "interactionId");

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
    const action = this.createAction(id, mesh);
    if (!action) {
      console.warn(`Unknown playground interactionId: ${id}`);
      return;
    }

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

    const distance = getNumber(extras, "interactionDistance") ?? defaultInteractionDistances[id] ?? 3;
    const labelText = getString(extras, "interactionLabel") ?? defaultInteractionLabels[id] ?? id;
    const labelOffsetY = getNumber(extras, "interactionLabelOffsetY") ?? 1.8;
    const label = createLabel(`${mesh.name}_interact_label`, labelText, mesh.getAbsolutePosition().add(new BABYLON.Vector3(0, labelOffsetY, 0)), mesh.getScene());
    label.setEnabled(false);

    const topLabelText = getString(extras, "topLabel");
    const topLabel = topLabelText
      ? createLabel(`${mesh.name}_top_label`, topLabelText, mesh.getAbsolutePosition().add(new BABYLON.Vector3(0, getNumber(extras, "topLabelOffsetY") ?? 1.55, 0)), mesh.getScene())
      : undefined;

    this.objects.push(new PlaygroundInteractable(id, mesh, label, topLabel, distance, action, this.publish));
  }

  private createAction(id: string, mesh: BABYLON.AbstractMesh): PlaygroundAction | undefined {
    if (id.startsWith("toggle-light-")) return this.createLightToggleAction(id, mesh);

    switch (id) {
      case "ball-chaos":
        return (_scene, _player, object) => {
          const center = object.mesh.getAbsolutePosition();
          for (const body of this.dynamicBodies) {
            const pos = body.transformNode.getAbsolutePosition();
            if (BABYLON.Vector3.Distance(pos, center) < 8) {
              const impulse = new BABYLON.Vector3((Math.random() - 0.5) * 4, 4 + Math.random() * 4, (Math.random() - 0.5) * 4);
              applyImpulseToBody(body, impulse);
            }
          }
          this.burstConfetti(_scene, center.add(new BABYLON.Vector3(0, 1, 0)), 120);
        };
      case "bowl":
        return () => {
          const aggregate = this.ensureDynamicBody(mesh, 1.4, BABYLON.PhysicsShapeType.SPHERE);
          aggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
          const direction = mesh.getDirection(BABYLON.Axis.Z).normalize();
          applyImpulseToBody(aggregate, direction.scale(-15).add(new BABYLON.Vector3(0, 0.4, 0)));
        };
      case "toggle-disco":
        return (_scene, _player, object) => {
          this.discoEnabled = !this.discoEnabled;
          this.discoLights.forEach((light) => light.setEnabled(this.discoEnabled));
          this.burstConfetti(_scene, object.mesh.getAbsolutePosition().add(new BABYLON.Vector3(0, 1, 0)), 90);
        };
      case "launch-ball":
        return (_scene, _player, object) => {
          this.launchCount += 1;
          const ball = BABYLON.MeshBuilder.CreateSphere(`launched_goof_${this.launchCount}`, { diameter: 0.62, segments: 18 }, _scene);
          const direction = object.mesh.getDirection(BABYLON.Axis.Z).normalize();
          ball.position = object.mesh.getAbsolutePosition().add(direction.scale(1.2)).add(new BABYLON.Vector3(0, 0.2, 0));
          makeCollidable(ball);
          ball.material = createMaterial(`launched_goof_${this.launchCount}_mat`, _scene, randomColor(), true);
          const aggregate = new BABYLON.PhysicsAggregate(ball, BABYLON.PhysicsShapeType.SPHERE, { mass: 0.36, restitution: 0.9, friction: 0.22 });
          applyImpulseToBody(aggregate, direction.add(new BABYLON.Vector3(0, 0.16, 0)).normalize().scale(13));
          this.dynamicBodies.push(aggregate);
          this.fanBodies.push(aggregate);
          this.addShadowCaster(ball);
        };
      case "super-bounce":
        return (_scene, player, object) => {
          player?.characterController.setVelocity(new BABYLON.Vector3(0, 16, 0));
          this.burstConfetti(_scene, object.mesh.getAbsolutePosition().add(new BABYLON.Vector3(0, 1, 0)), 70);
        };
      case "fan-blast":
        return (_scene, player, object) => {
          const direction = object.mesh.getDirection(BABYLON.Axis.X).normalize().add(new BABYLON.Vector3(0, 0.35, 0));
          player?.characterController.setVelocity(direction.scale(12));
          for (const body of this.fanBodies) applyImpulseToBody(body, direction.scale(1.5));
        };
      case "moon-gravity":
        return (_scene, _player, object) => {
          _scene.getPhysicsEngine()?.setGravity(new BABYLON.Vector3(0, -2.2, 0));
          this.lowGravityUntil = Date.now() + 9000;
          this.dynamicBodies.forEach((body) => applyImpulseToBody(body, new BABYLON.Vector3(0, 2.5, 0)));
          this.burstConfetti(_scene, object.mesh.getAbsolutePosition().add(new BABYLON.Vector3(0, 1, 0)), 100);
        };
      case "paint-toys":
        return (_scene, _player, object) => {
          this.dynamicBodies.forEach((body) => setMeshColor(body.transformNode as BABYLON.AbstractMesh, randomColor()));
          this.burstConfetti(_scene, object.mesh.getAbsolutePosition().add(new BABYLON.Vector3(0, 1, 0)), 150);
        };
      case "spin-merry":
        return () => {
          this.merrySpeed = this.merrySpeed > 5 ? 0.9 : this.merrySpeed + 1.15;
        };
      case "teleport":
        return (_scene, player) => {
          if (!player) return;
          const destination = this.pickTeleportDestination();
          player.updatePosition(destination);
          this.burstConfetti(_scene, player.character.getAbsolutePosition(), 90);
        };
      case "dance-party":
        return (_scene, player, object) => {
          player?.dance();
          this.discoEnabled = true;
          this.discoLights.forEach((light) => light.setEnabled(true));
          this.burstConfetti(_scene, object.mesh.getAbsolutePosition().add(new BABYLON.Vector3(0, 1.2, 0)), 160);
        };
      case "bonk-toys":
        return (_scene, player, object) => {
          const origin = player?.character.getAbsolutePosition() ?? object.mesh.getAbsolutePosition();
          for (const body of this.dynamicBodies) {
            const pos = body.transformNode.getAbsolutePosition();
            const delta = pos.subtract(origin);
            if (delta.length() < 6) applyImpulseToBody(body, delta.normalize().scale(7).add(new BABYLON.Vector3(0, 3.5, 0)));
          }
          this.burstConfetti(_scene, origin.add(new BABYLON.Vector3(0, 1, 0)), 80);
        };
      default:
        return undefined;
    }
  }

  private createLightToggleAction(id: string, mesh: BABYLON.AbstractMesh): PlaygroundAction {
    const index = Number(id.replace("toggle-light-", "")) || 0;
    const color = neonColors[index + 1] ?? neonColors[index % neonColors.length];
    const light = this.createDiscoLight(mesh, index, color);
    this.discoLights.push(light);

    return () => {
      light.setEnabled(!light.isEnabled());
      setMeshColor(mesh, light.isEnabled() ? color : new BABYLON.Color3(0.04, 0.04, 0.06));
    };
  }

  private createDiscoLight(mesh: BABYLON.AbstractMesh, index: number, color = neonColors[(index + 1) % neonColors.length]) {
    const light = new BABYLON.PointLight(`disco_light_${index}_${mesh.name}`, mesh.getAbsolutePosition().add(new BABYLON.Vector3(0, 1.2, 0)), mesh.getScene());
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

  private ensureDynamicBody(mesh: BABYLON.AbstractMesh, mass: number, shape: BABYLON.PhysicsShapeType) {
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

  private pickTeleportDestination() {
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

  private burstConfetti(scene: BABYLON.Scene, position: BABYLON.Vector3, count: number) {
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
