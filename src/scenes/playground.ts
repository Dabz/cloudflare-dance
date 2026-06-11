import * as BABYLON from "@babylonjs/core";
import type { PlayerCharacter } from "./player";
import { UsableObject } from "./object";

type ShadowCaster = (mesh?: BABYLON.AbstractMesh | null) => void;
type PlaygroundAction = (scene: BABYLON.Scene, player: PlayerCharacter, object: PlaygroundInteractable) => void;

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
  if (emissive) material.emissiveColor = color.scale(0.7);
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

export class PlaygroundInteractable extends UsableObject {
  mesh: BABYLON.AbstractMesh;
  label: BABYLON.AbstractMesh;
  private action: PlaygroundAction;

  constructor(mesh: BABYLON.AbstractMesh, label: BABYLON.AbstractMesh, distance: number, action: PlaygroundAction) {
    super();
    this.mesh = mesh;
    this.label = label;
    this.InteractDistance = distance;
    this.action = action;
  }

  public interact(scene: BABYLON.Scene, mainPlayer: PlayerCharacter) {
    this.action(scene, mainPlayer, this);
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

  constructor(addShadowCaster: ShadowCaster) {
    this.addShadowCaster = addShadowCaster;
  }

  public init(scene: BABYLON.Scene) {
    const mats = {
      red: createMaterial("playground_red", scene, new BABYLON.Color3(1, 0.1, 0.14), true),
      blue: createMaterial("playground_blue", scene, new BABYLON.Color3(0.05, 0.58, 1), true),
      yellow: createMaterial("playground_yellow", scene, new BABYLON.Color3(1, 0.86, 0.08), true),
      green: createMaterial("playground_green", scene, new BABYLON.Color3(0.2, 1, 0.34), true),
      purple: createMaterial("playground_purple", scene, new BABYLON.Color3(0.72, 0.22, 1), true),
      orange: createMaterial("playground_orange", scene, new BABYLON.Color3(1, 0.45, 0.05), true),
      dark: createMaterial("playground_dark", scene, new BABYLON.Color3(0.06, 0.05, 0.12)),
      white: createMaterial("playground_white", scene, new BABYLON.Color3(0.93, 0.96, 1)),
    };

    this.createBallPit(scene, mats);
    this.createBowlingAlley(scene, mats);
    this.createBlockStacks(scene, mats);
    this.createRampGarden(scene, mats);
    this.createInteractiveStations(scene, mats);
    this.createSillyDecor(scene, mats);
  }

  public beforeRender(scene: BABYLON.Scene, mainPlayer?: PlayerCharacter) {
    const delta = scene.getEngine().getDeltaTime() / 1000;
    const time = performance.now() * 0.001;

    if (this.fanRotor) this.fanRotor.rotation.z += delta * 16;
    if (this.merry) this.merry.rotation.y += delta * this.merrySpeed;

    if (this.discoEnabled) {
      this.discoLights.forEach((light, index) => {
        light.diffuse = BABYLON.Color3.FromHSV((time * 100 + index * 90) % 360, 0.9, 1);
        light.intensity = 1.2 + Math.sin(time * 5 + index) * 0.35;
      });
    }

    for (const body of this.fanBodies) {
      const pos = body.transformNode.getAbsolutePosition();
      if (pos.x > 3 && pos.x < 16 && pos.z > -9 && pos.z < 1 && pos.y < 5) {
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
      object.label.setEnabled(distance < object.InteractDistance + 2);
      if (distance < object.InteractDistance && distance < closestDistance) {
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

  private createBallPit(scene: BABYLON.Scene, mats: Record<string, BABYLON.StandardMaterial>) {
    const pit = BABYLON.MeshBuilder.CreateBox("ball_pit_box", { width: 7, height: 0.45, depth: 4.8 }, scene);
    pit.position = new BABYLON.Vector3(-16, 0.35, -10.4);
    pit.material = mats.purple;
    new BABYLON.PhysicsAggregate(pit, BABYLON.PhysicsShapeType.BOX, { mass: 0 });
    this.addShadowCaster(pit);

    for (let index = 0; index < 36; index++) {
      const ball = BABYLON.MeshBuilder.CreateSphere(`goofy_ball_${index}`, { diameter: 0.55, segments: 16 }, scene);
      ball.position = new BABYLON.Vector3(-10.9 + (index % 9) * 0.72, 1.1 + Math.floor(index / 18) * 0.6, -6.8 + (Math.floor(index / 9) % 2) * 1.7);
      ball.material = createMaterial(`goofy_ball_${index}_mat`, scene, randomColor(), true);
      const aggregate = new BABYLON.PhysicsAggregate(ball, BABYLON.PhysicsShapeType.SPHERE, { mass: 0.22, restitution: 0.82, friction: 0.3 });
      this.dynamicBodies.push(aggregate);
      this.fanBodies.push(aggregate);
      this.addShadowCaster(ball);
    }

    const button = this.createButton("ball_pit_button", "BALL CHAOS", new BABYLON.Vector3(-4.2, 0.8, -5.4), mats.red, scene);
    this.addObject(button, "Explode balls", 2.8, (_scene) => {
      for (const body of this.dynamicBodies) {
        const pos = body.transformNode.getAbsolutePosition();
        if (BABYLON.Vector3.Distance(pos, new BABYLON.Vector3(-8, 1, -5.4)) < 7) {
          const impulse = new BABYLON.Vector3((Math.random() - 0.5) * 4, 4 + Math.random() * 4, (Math.random() - 0.5) * 4);
          applyImpulseToBody(body, impulse);
        }
      }
      this.burstConfetti(_scene, button.position.add(new BABYLON.Vector3(0, 1, 0)), 120);
    });
  }

  private createBowlingAlley(scene: BABYLON.Scene, mats: Record<string, BABYLON.StandardMaterial>) {
    const lane = BABYLON.MeshBuilder.CreateBox("bowling_lane", { width: 3.5, height: 0.2, depth: 12 }, scene);
    lane.position = new BABYLON.Vector3(20, 0.25, 16);
    lane.material = mats.dark;
    new BABYLON.PhysicsAggregate(lane, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 0.12 });

    const ball = BABYLON.MeshBuilder.CreateSphere("bowling_boulder", { diameter: 1.1, segments: 24 }, scene);
    ball.position = new BABYLON.Vector3(20, 1.1, 26);
    ball.material = mats.orange;
    const ballBody = new BABYLON.PhysicsAggregate(ball, BABYLON.PhysicsShapeType.SPHERE, { mass: 1.4, restitution: 0.55, friction: 0.35 });
    this.dynamicBodies.push(ballBody);
    this.fanBodies.push(ballBody);

    for (let index = 0; index < 10; index++) {
      const row = Math.floor((Math.sqrt(8 * index + 1) - 1) / 2);
      const col = index - (row * (row + 1)) / 2;
      const pin = BABYLON.MeshBuilder.CreateCylinder(`bowling_pin_${index}`, { height: 1.35, diameterTop: 0.25, diameterBottom: 0.48, tessellation: 16 }, scene);
      pin.position = new BABYLON.Vector3(9.3 + col * 0.48 - row * 0.24, 0.95, 2.8 + row * 0.55);
      pin.material = index % 2 ? mats.white : mats.yellow;
      const aggregate = new BABYLON.PhysicsAggregate(pin, BABYLON.PhysicsShapeType.CYLINDER, { mass: 0.35, restitution: 0.45 });
      this.dynamicBodies.push(aggregate);
      this.fanBodies.push(aggregate);
      this.addShadowCaster(pin);
    }

    this.addShadowCaster(lane);
    this.addShadowCaster(ball);
    this.addObject(ball, "Bowl it", 3.2, () => {
      ballBody.body.setLinearVelocity(BABYLON.Vector3.Zero());
      applyImpulseToBody(ballBody, new BABYLON.Vector3(0, 0.4, -15));
    });
  }

  private createBlockStacks(scene: BABYLON.Scene, mats: Record<string, BABYLON.StandardMaterial>) {
    for (let tower = 0; tower < 3; tower++) {
      for (let level = 0; level < 7; level++) {
        const block = BABYLON.MeshBuilder.CreateBox(`wobble_block_${tower}_${level}`, { width: 1.2, height: 0.42, depth: 0.7 }, scene);
        block.position = new BABYLON.Vector3(-26 + tower * 5.2, 0.65 + level * 0.45, 13 + (level % 2) * 0.1);
        block.rotation.y = level % 2 ? Math.PI / 2 : 0;
        block.material = [mats.red, mats.blue, mats.green, mats.yellow, mats.purple][(tower + level) % 5];
        const aggregate = new BABYLON.PhysicsAggregate(block, BABYLON.PhysicsShapeType.BOX, { mass: 0.38, restitution: 0.28, friction: 0.7 });
        this.dynamicBodies.push(aggregate);
        this.fanBodies.push(aggregate);
        this.addShadowCaster(block);
      }
    }
  }

  private createRampGarden(scene: BABYLON.Scene, mats: Record<string, BABYLON.StandardMaterial>) {
    const rampPositions = [
      new BABYLON.Vector3(-2, 0.75, 9),
      new BABYLON.Vector3(2.5, 1.2, 9.6),
      new BABYLON.Vector3(5.8, 0.8, -8.6),
      new BABYLON.Vector3(-14, 0.9, -1.5),
    ];
    rampPositions.forEach((position, index) => {
      const ramp = BABYLON.MeshBuilder.CreateBox(`skate_ramp_${index}`, { width: 4.6, height: 0.35, depth: 2.1 }, scene);
      ramp.position = position;
      ramp.rotation.x = index % 2 ? -0.35 : 0.35;
      ramp.rotation.y = index * 0.7;
      ramp.material = [mats.blue, mats.orange, mats.green, mats.purple][index];
      new BABYLON.PhysicsAggregate(ramp, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 0.2, restitution: 0.1 });
      this.addShadowCaster(ramp);
    });
  }

  private createInteractiveStations(scene: BABYLON.Scene, mats: Record<string, BABYLON.StandardMaterial>) {
    this.createLightSwitches(scene, mats);
    this.createLauncher(scene, mats);
    this.createTrampoline(scene, mats);
    this.createFan(scene, mats);
    this.createGravityButton(scene, mats);
    this.createPaintCannon(scene, mats);
    this.createMerryGoRound(scene, mats);
    this.createTeleporter(scene, mats);
    this.createJukebox(scene, mats);
    this.createHammer(scene, mats);
  }

  private createLightSwitches(scene: BABYLON.Scene, mats: Record<string, BABYLON.StandardMaterial>) {
    const lightNames = ["MINT", "PINK", "GOLD"];
    lightNames.forEach((name, index) => {
      const orb = BABYLON.MeshBuilder.CreateSphere(`disco_orb_${index}`, { diameter: 0.65, segments: 18 }, scene);
      orb.position = new BABYLON.Vector3(-4 + index * 4, 4.4, -4.5);
      orb.material = createMaterial(`disco_orb_${index}_mat`, scene, neonColors[index + 1], true);
      const light = new BABYLON.PointLight(`disco_light_${index}`, orb.position.clone(), scene);
      light.diffuse = neonColors[index + 1];
      light.intensity = 1.15;
      light.range = 13;
      this.discoLights.push(light);
      this.addShadowCaster(orb);

      const button = this.createButton(`light_switch_${index}`, `${name} LIGHT`, new BABYLON.Vector3(-2 + index * 2, 0.85, -1.4), [mats.green, mats.purple, mats.yellow][index], scene);
      this.addObject(button, `Toggle ${name}`, 2.4, () => {
        light.setEnabled(!light.isEnabled());
        setMeshColor(button, light.isEnabled() ? neonColors[index + 1] : new BABYLON.Color3(0.08, 0.08, 0.1));
      });
    });

    const discoButton = this.createButton("disco_master_switch", "DISCO", new BABYLON.Vector3(4.5, 0.85, -1.4), mats.orange, scene);
    this.addObject(discoButton, "Toggle disco", 2.6, (_scene) => {
      this.discoEnabled = !this.discoEnabled;
      this.discoLights.forEach((light) => light.setEnabled(this.discoEnabled));
      this.burstConfetti(_scene, discoButton.position.add(new BABYLON.Vector3(0, 1, 0)), 90);
    });
  }

  private createLauncher(scene: BABYLON.Scene, mats: Record<string, BABYLON.StandardMaterial>) {
    const base = BABYLON.MeshBuilder.CreateCylinder("ball_launcher_base", { height: 0.7, diameter: 1.2, tessellation: 20 }, scene);
    base.position = new BABYLON.Vector3(0, 0.75, 12.4);
    base.material = mats.red;
    const barrel = BABYLON.MeshBuilder.CreateCylinder("ball_launcher_barrel", { height: 2.4, diameter: 0.5, tessellation: 18 }, scene);
    barrel.position = new BABYLON.Vector3(0, 1.75, 10.7);
    barrel.rotation.x = Math.PI / 2.25;
    barrel.material = mats.dark;
    this.addShadowCaster(base);
    this.addShadowCaster(barrel);
    this.addObject(base, "Launch balls", 3, (_scene, player) => {
      this.launchCount += 1;
      const ball = BABYLON.MeshBuilder.CreateSphere(`launched_goof_${this.launchCount}`, { diameter: 0.62, segments: 18 }, _scene);
      ball.position = player.character.getAbsolutePosition().add(new BABYLON.Vector3(0, 1.2, 0));
      ball.material = createMaterial(`launched_goof_${this.launchCount}_mat`, _scene, randomColor(), true);
      const aggregate = new BABYLON.PhysicsAggregate(ball, BABYLON.PhysicsShapeType.SPHERE, { mass: 0.36, restitution: 0.9, friction: 0.22 });
      const direction = new BABYLON.Vector3(Math.sin(player.rotationY), 0.16, Math.cos(player.rotationY)).normalize();
      applyImpulseToBody(aggregate, direction.scale(13));
      this.dynamicBodies.push(aggregate);
      this.fanBodies.push(aggregate);
      this.addShadowCaster(ball);
    });
  }

  private createTrampoline(scene: BABYLON.Scene, mats: Record<string, BABYLON.StandardMaterial>) {
    const trampoline = BABYLON.MeshBuilder.CreateCylinder("trampoline", { height: 0.35, diameter: 3.2, tessellation: 32 }, scene);
    trampoline.position = new BABYLON.Vector3(-10.5, 0.55, 6.2);
    trampoline.material = mats.blue;
    new BABYLON.PhysicsAggregate(trampoline, BABYLON.PhysicsShapeType.CYLINDER, { mass: 0, restitution: 1.2, friction: 0.25 });
    this.addShadowCaster(trampoline);
    this.addObject(trampoline, "Super bounce", 3, (_scene, player) => {
      player.characterController.setVelocity(new BABYLON.Vector3(0, 16, 0));
      this.burstConfetti(_scene, trampoline.position.add(new BABYLON.Vector3(0, 1, 0)), 70);
    });
  }

  private createFan(scene: BABYLON.Scene, mats: Record<string, BABYLON.StandardMaterial>) {
    const stand = BABYLON.MeshBuilder.CreateCylinder("wind_machine_stand", { height: 2.2, diameter: 0.28 }, scene);
    stand.position = new BABYLON.Vector3(8, 1.35, -10.6);
    stand.material = mats.dark;
    const rotor = BABYLON.MeshBuilder.CreateTorus("wind_machine_rotor", { diameter: 2.2, thickness: 0.12, tessellation: 28 }, scene);
    rotor.position = new BABYLON.Vector3(8, 2.65, -10.6);
    rotor.rotation.y = Math.PI / 2;
    rotor.material = mats.yellow;
    this.fanRotor = rotor;
    this.addShadowCaster(stand);
    this.addShadowCaster(rotor);
    this.addObject(rotor, "Fan blast", 3.8, (_scene, player) => {
      const direction = new BABYLON.Vector3(1, 0.35, 0.05);
      player.characterController.setVelocity(direction.scale(12));
      for (const body of this.fanBodies) applyImpulseToBody(body, direction.scale(1.5));
    });
  }

  private createGravityButton(scene: BABYLON.Scene, mats: Record<string, BABYLON.StandardMaterial>) {
    const button = this.createButton("gravity_button", "LOW G", new BABYLON.Vector3(7.3, 0.85, -3.2), mats.purple, scene);
    this.addObject(button, "Moon gravity", 2.8, (_scene) => {
      _scene.getPhysicsEngine()?.setGravity(new BABYLON.Vector3(0, -2.2, 0));
      this.lowGravityUntil = Date.now() + 9000;
      this.dynamicBodies.forEach((body) => applyImpulseToBody(body, new BABYLON.Vector3(0, 2.5, 0)));
      this.burstConfetti(_scene, button.position.add(new BABYLON.Vector3(0, 1, 0)), 100);
    });
  }

  private createPaintCannon(scene: BABYLON.Scene, mats: Record<string, BABYLON.StandardMaterial>) {
    const button = this.createButton("paint_cannon", "PAINT", new BABYLON.Vector3(-1.7, 0.85, 2.9), mats.green, scene);
    this.addObject(button, "Repaint toys", 2.8, (_scene) => {
      this.dynamicBodies.forEach((body) => setMeshColor(body.transformNode as BABYLON.AbstractMesh, randomColor()));
      this.burstConfetti(_scene, button.position.add(new BABYLON.Vector3(0, 1, 0)), 150);
    });
  }

  private createMerryGoRound(scene: BABYLON.Scene, mats: Record<string, BABYLON.StandardMaterial>) {
    const merry = BABYLON.MeshBuilder.CreateCylinder("merry_go_round", { height: 0.45, diameter: 3.6, tessellation: 36 }, scene);
    merry.position = new BABYLON.Vector3(10.7, 0.62, 8.4);
    merry.material = mats.orange;
    new BABYLON.PhysicsAggregate(merry, BABYLON.PhysicsShapeType.CYLINDER, { mass: 0, friction: 0.05 });
    this.merry = merry;
    this.addShadowCaster(merry);
    this.addObject(merry, "Spin faster", 3, () => {
      this.merrySpeed = this.merrySpeed > 5 ? 0.9 : this.merrySpeed + 1.15;
    });
  }

  private createTeleporter(scene: BABYLON.Scene, mats: Record<string, BABYLON.StandardMaterial>) {
    const portal = BABYLON.MeshBuilder.CreateTorus("portal_donut", { diameter: 2.2, thickness: 0.18, tessellation: 40 }, scene);
    portal.position = new BABYLON.Vector3(-24.5, 1.55, -16.3);
    portal.rotation.x = Math.PI / 2;
    portal.material = mats.blue;
    const light = new BABYLON.PointLight("portal_light", portal.position.clone(), scene);
    light.diffuse = new BABYLON.Color3(0.2, 0.8, 1);
    light.intensity = 1.1;
    light.range = 8;
    this.addShadowCaster(portal);
    this.addObject(portal, "Teleport", 3.2, (_scene, player) => {
      const destinations = [
        new BABYLON.Vector3(10, 3, 13),
        new BABYLON.Vector3(-7, 4, -4),
        new BABYLON.Vector3(5.7, 4, 4.4),
        new BABYLON.Vector3(0, 5, 0),
      ];
      player.updatePosition(destinations[Math.floor(Math.random() * destinations.length)].clone());
      this.burstConfetti(_scene, player.character.getAbsolutePosition(), 90);
    });
  }

  private createJukebox(scene: BABYLON.Scene, mats: Record<string, BABYLON.StandardMaterial>) {
    const box = BABYLON.MeshBuilder.CreateBox("jukebox", { width: 1.4, height: 2.2, depth: 0.7 }, scene);
    box.position = new BABYLON.Vector3(24.5, 1.35, -8.5);
    box.material = mats.red;
    const halo = BABYLON.MeshBuilder.CreateTorus("jukebox_halo", { diameter: 1.3, thickness: 0.08, tessellation: 24 }, scene);
    halo.position = new BABYLON.Vector3(24.5, 2.4, -8.1);
    halo.material = mats.yellow;
    this.addShadowCaster(box);
    this.addShadowCaster(halo);
    this.addObject(box, "Dance party", 3, (_scene, player) => {
      player.dance();
      this.discoEnabled = true;
      this.discoLights.forEach((light) => light.setEnabled(true));
      this.burstConfetti(_scene, box.position.add(new BABYLON.Vector3(0, 1.2, 0)), 160);
    });
  }

  private createHammer(scene: BABYLON.Scene, mats: Record<string, BABYLON.StandardMaterial>) {
    const hammer = BABYLON.MeshBuilder.CreateBox("foam_hammer", { width: 1.2, height: 0.8, depth: 1.2 }, scene);
    hammer.position = new BABYLON.Vector3(-10.6, 1.3, 16.8);
    hammer.material = mats.yellow;
    const handle = BABYLON.MeshBuilder.CreateCylinder("foam_hammer_handle", { height: 1.8, diameter: 0.22, tessellation: 16 }, scene);
    handle.position = new BABYLON.Vector3(-10.6, 0.75, 16.8);
    handle.material = mats.dark;
    this.addShadowCaster(hammer);
    this.addShadowCaster(handle);
    this.addObject(hammer, "Bonk nearby toys", 3.2, (_scene, player) => {
      const origin = player.character.getAbsolutePosition();
      for (const body of this.dynamicBodies) {
        const pos = body.transformNode.getAbsolutePosition();
        const delta = pos.subtract(origin);
        if (delta.length() < 6) applyImpulseToBody(body, delta.normalize().scale(7).add(new BABYLON.Vector3(0, 3.5, 0)));
      }
      this.burstConfetti(_scene, origin.add(new BABYLON.Vector3(0, 1, 0)), 80);
    });
  }

  private createSillyDecor(scene: BABYLON.Scene, mats: Record<string, BABYLON.StandardMaterial>) {
    for (let index = 0; index < 14; index++) {
      const cone = BABYLON.MeshBuilder.CreateCylinder(`party_hat_${index}`, { height: 1.1, diameterTop: 0, diameterBottom: 0.7, tessellation: 18 }, scene);
      cone.position = new BABYLON.Vector3(-30 + index * 2.25, 0.8, -22 + (index % 3) * 0.7);
      cone.material = [mats.red, mats.blue, mats.yellow, mats.green, mats.purple, mats.orange][index % 6];
      new BABYLON.PhysicsAggregate(cone, BABYLON.PhysicsShapeType.CYLINDER, { mass: 0.12, restitution: 0.7 });
      this.addShadowCaster(cone);
    }

    const duckBody = BABYLON.MeshBuilder.CreateSphere("rubber_duck_body", { diameterX: 2.2, diameterY: 1.3, diameterZ: 1.35, segments: 24 }, scene);
    duckBody.position = new BABYLON.Vector3(28, 1.1, 10.8);
    duckBody.material = mats.yellow;
    const duckHead = BABYLON.MeshBuilder.CreateSphere("rubber_duck_head", { diameter: 0.9, segments: 20 }, scene);
    duckHead.position = new BABYLON.Vector3(28.85, 1.85, 10.8);
    duckHead.material = mats.yellow;
    const beak = BABYLON.MeshBuilder.CreateBox("rubber_duck_beak", { width: 0.65, height: 0.22, depth: 0.35 }, scene);
    beak.position = new BABYLON.Vector3(30.45, 1.85, 10.8);
    beak.material = mats.orange;
    this.addShadowCaster(duckBody);
    this.addShadowCaster(duckHead);
    this.addShadowCaster(beak);
  }

  private createButton(name: string, text: string, position: BABYLON.Vector3, material: BABYLON.StandardMaterial, scene: BABYLON.Scene) {
    const button = BABYLON.MeshBuilder.CreateCylinder(name, { height: 0.42, diameter: 1.18, tessellation: 24 }, scene);
    button.position = position;
    button.material = material;
    new BABYLON.PhysicsAggregate(button, BABYLON.PhysicsShapeType.CYLINDER, { mass: 0 });
    this.addShadowCaster(button);
    createLabel(`${name}_top_label`, text, position.add(new BABYLON.Vector3(0, 1.55, 0)), scene);
    return button;
  }

  private addObject(mesh: BABYLON.AbstractMesh, labelText: string, distance: number, action: PlaygroundAction) {
    const label = createLabel(`${mesh.name}_interact_label`, labelText, mesh.getAbsolutePosition().add(new BABYLON.Vector3(0, 1.8, 0)), mesh.getScene());
    label.setEnabled(false);
    this.objects.push(new PlaygroundInteractable(mesh, label, distance, action));
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
