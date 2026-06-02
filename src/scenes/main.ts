/* eslint-disable @typescript-eslint/no-unused-vars */
import * as BABYLON from "@babylonjs/core";
import HavokPhysics from '@babylonjs/havok';
import havokWasmUrl from '../../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';
import earcut from 'earcut';

import "@babylonjs/loaders/glTF";
import type { Player } from "../../worker/model/player";
const fontData = await (await fetch("/font.json")).json();


export class MainScene {
  characterPosition: BABYLON.Vector3;
  otherPlayers: Player[] = [];

  _scene: BABYLON.Scene;
  _otherPlayersMesh: {[key: string]: BABYLON.Mesh} = {};
  
  public createScene(engine: BABYLON.Engine): BABYLON.Scene {
    if (this._scene) this._scene.dispose();
    this._scene = new BABYLON.Scene(engine);
    const camera = new BABYLON.FollowCamera("camera1", new BABYLON.Vector3(0, 10, -10), );
    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this._scene);

    camera.radius = 15;
    camera.heightOffset = 4;
    camera.rotationOffset = 180;
    camera.cameraAcceleration = 0.05;
    camera.maxCameraSpeed = 20;

    light.intensity = 0.7;
    HavokPhysics({ locateFile: () => havokWasmUrl }).then((havokInterface) => {
      const hk = new BABYLON.HavokPlugin(undefined, havokInterface);
      this._scene.enablePhysics(new BABYLON.Vector3(0, -9.8, 0), hk);
      BABYLON.ImportMeshAsync("/level.glb", this._scene).then(() => {
        const lightmap = new BABYLON.Texture("/lightmap.jpg");
        const lightmapped = ["level_primitive0", "level_primitive1", "level_primitive2"];
        lightmapped.forEach((meshName)=>{
          const mesh = this._scene.getMeshByName(meshName);
          new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.MESH);
          mesh.isPickable = false
          mesh.material.lightmapTexture = lightmap;
          mesh.material.useLightmapAsShadowmap = true;
          mesh.material.lightmapTexture.uAng = Math.PI;
          mesh.material.lightmapTexture.level = 1.6;
          mesh.material.lightmapTexture.coordinatesIndex = 1;  
          mesh.freezeWorldMatrix();
          mesh.doNotSyncBoundingInfo = true;
        });
        const cubes = ["Cube", "Cube.001", "Cube.002", "Cube.003", "Cube.004", "Cube.005"];
        cubes.forEach((meshName)=>{
          new BABYLON.PhysicsAggregate(this._scene.getMeshByName(meshName), BABYLON.PhysicsShapeType.BOX, {mass:0.1});
        });
        const planeMesh = this._scene.getMeshByName("Cube.006");
        planeMesh.scaling.set(0.03,3,1);
        const fixedMass = new BABYLON.PhysicsAggregate(this._scene.getMeshByName("Cube.007"), BABYLON.PhysicsShapeType.BOX, {mass:0});
        const plane = new BABYLON.PhysicsAggregate(planeMesh, BABYLON.PhysicsShapeType.BOX, {mass:0.1});

        const joint = new BABYLON.HingeConstraint(
          new BABYLON.Vector3(0.75, 0, 0),
          new BABYLON.Vector3(-0.25, 0, 0),
          new BABYLON.Vector3(0, 0, -1),
          new BABYLON.Vector3(0, 0, 1),
          this._scene);
          fixedMass.body.addConstraint(plane.body, joint);

          let state = "IN_AIR";
          const inAirSpeed = 8.0;
          const onGroundSpeed = 10.0;
          const jumpHeight = 1.5;
          let wantJump = 0;
          const inputDirection = new BABYLON.Vector3(0,0,0);
          const forwardLocalSpace = new BABYLON.Vector3(0, 0, 1);
          const characterOrientation = BABYLON.Quaternion.Identity();
          const characterGravity = new BABYLON.Vector3(0, -18, 0);

          const h = 1.8;
          const r = 0.6;
          const displayCapsule = BABYLON.MeshBuilder.CreateCapsule("CharacterDisplay", {height: h, radius: r}, this._scene);
          displayCapsule.material = new BABYLON.StandardMaterial("capsule", this._scene);
          displayCapsule.material.diffuseColor = new BABYLON.Color3(0.2,0.9,0.8);
          this.characterPosition = new BABYLON.Vector3(3., 0.3, -8.);
          const characterController = new BABYLON.PhysicsCharacterController(this.characterPosition, {capsuleHeight: h, capsuleRadius: r}, this._scene);
          camera.setTarget(this.characterPosition);

          const getNextState = function(supportInfo) {
            if (state == "IN_AIR") {
              if (supportInfo.supportedState == BABYLON.CharacterSupportedState.SUPPORTED) {
                return "ON_GROUND";
              }
              return "IN_AIR";
            } else if (state == "ON_GROUND") {
              if (supportInfo.supportedState != BABYLON.CharacterSupportedState.SUPPORTED) {
                return "IN_AIR";
              }

              if (wantJump > 0) {
                wantJump--;
                return "START_JUMP";
              }
              return "ON_GROUND";
            } else if (state == "START_JUMP") {
              return "IN_AIR";
            }
          }

          const getDesiredVelocity = function(deltaTime, supportInfo, characterOrientation, currentVelocity) {
            const nextState = getNextState(supportInfo);
            if (nextState != state) {
              state = nextState;
            }

            const upWorld = characterGravity.normalizeToNew();
            upWorld.scaleInPlace(-1.0);
            const forwardWorld = forwardLocalSpace.applyRotationQuaternion(characterOrientation);
            if (state == "IN_AIR") {
              const desiredVelocity = inputDirection.scale(inAirSpeed).applyRotationQuaternion(characterOrientation);
              const outputVelocity = characterController.calculateMovement(deltaTime, forwardWorld, upWorld, currentVelocity, BABYLON.Vector3.ZeroReadOnly, desiredVelocity, upWorld);
              outputVelocity.addInPlace(upWorld.scale(-outputVelocity.dot(upWorld)));
              outputVelocity.addInPlace(upWorld.scale(currentVelocity.dot(upWorld)));
              outputVelocity.addInPlace(characterGravity.scale(deltaTime));
              return outputVelocity;
            } else if (state == "ON_GROUND") {
              const desiredVelocity = inputDirection.scale(onGroundSpeed).applyRotationQuaternion(characterOrientation);

              let outputVelocity = characterController.calculateMovement(deltaTime, forwardWorld, supportInfo.averageSurfaceNormal, currentVelocity, supportInfo.averageSurfaceVelocity, desiredVelocity, upWorld);
              // Horizontal projection
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
            } else if (state == "START_JUMP") {
              const u = Math.sqrt(2 * characterGravity.length() * jumpHeight);
              const curRelVel = currentVelocity.dot(upWorld);
              return currentVelocity.add(upWorld.scale(u - curRelVel));
            }
            return BABYLON.Vector3.Zero();
          }

          // Display tick update: compute new camera position/target, update the capsule for the character display
          this._scene.onBeforeRenderObservable.add((_: BABYLON.Scene) => {
            displayCapsule.position.copyFrom(characterController.getPosition());
            this.characterPosition = characterController.getPosition();

            // camera following
            const cameraDirection = camera.getDirection(new BABYLON.Vector3(0,0,1));
            cameraDirection.y = 0;
            cameraDirection.normalize();
            camera.setTarget(BABYLON.Vector3.Lerp(camera.getTarget(), displayCapsule.position, 0.1));
            const dist = BABYLON.Vector3.Distance(camera.position, displayCapsule.position);
            const amount = (Math.min(dist - 6, 0) + Math.max(dist - 9, 0)) * 0.04;
            cameraDirection.scaleAndAddToRef(amount, camera.position);
            camera.position.y += (displayCapsule.position.y + 2 - camera.position.y) * 0.04;
          });

          // After physics update, compute and set new velocity, update the character controller state
          this._scene.onAfterPhysicsObservable.add((_) => {
            if (this._scene.deltaTime == undefined) return;
            const dt = this._scene.deltaTime / 1000.0;
            if (dt == 0) return;

            const down = new BABYLON.Vector3(0, -1, 0);
            const support = characterController.checkSupport(dt, down);

            BABYLON.Quaternion.FromEulerAnglesToRef(0,camera.rotation.y, 0, characterOrientation);
            const desiredLinearVelocity = getDesiredVelocity(dt, support, characterOrientation, characterController.getVelocity());
            characterController.setVelocity(desiredLinearVelocity);

            characterController.integrate(dt, support, characterGravity);
          });

          let isKeyDown = false;

          // Rotate camera
          // Add a slide vector to rotate arount the character
          let isMouseDown = false;
          let mouseDownY = 0;
          this._scene.onPointerObservable.add((pointerInfo) => {
            switch (pointerInfo.type) {
              case BABYLON.PointerEventTypes.POINTERDOWN:
                isMouseDown = true;
              mouseDownY = pointerInfo.event.y;
              break;

              case BABYLON.PointerEventTypes.POINTERUP:
                isMouseDown = false;
              if (!isKeyDown) {
                inputDirection.z = 0;
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
                      inputDirection.z = Math.sign(deltaY);
                    }
                  }
              }
              break;

              case BABYLON.PointerEventTypes.POINTERDOUBLETAP:
                ++wantJump;
              break;
            }
          });
          // Input to direction
          // from keys down/up, update the Vector3 inputDirection to match the intended direction. Jump with space
          this._scene.onKeyboardObservable.add((kbInfo) => {
            switch (kbInfo.type) {
              case BABYLON.KeyboardEventTypes.KEYDOWN:
                isKeyDown = true;
              if (kbInfo.event.key == 'w' || kbInfo.event.key == 'ArrowUp') {
                inputDirection.z = 1;
              } else if (kbInfo.event.key == 's' || kbInfo.event.key == 'ArrowDown') {
                inputDirection.z = -1;
              } else if (kbInfo.event.key == 'a' || kbInfo.event.key == 'ArrowLeft') {
                inputDirection.x = -1;
              } else if (kbInfo.event.key == 'd' || kbInfo.event.key == 'ArrowRight') {
                inputDirection.x = 1;
              } else if (kbInfo.event.key == ' ') {
                ++wantJump;
              }
              break;
              case BABYLON.KeyboardEventTypes.KEYUP:
                isKeyDown = false;
              if (kbInfo.event.key == 'w' || kbInfo.event.key == 's' || kbInfo.event.key == 'ArrowUp' || kbInfo.event.key == 'ArrowDown') {
                inputDirection.z = 0;    
              }
              if (kbInfo.event.key == 'a' || kbInfo.event.key == 'd' || kbInfo.event.key == 'ArrowLeft' || kbInfo.event.key == 'ArrowRight') {
                inputDirection.x = 0;
              } else if (kbInfo.event.key == ' ') {
                wantJump = 0;
              }
              break;
            }
          });
      });
    });

    return this._scene;
  }

  public dispose() {
    this._scene.dispose();
    this._scene.getEngine().dispose();
    this._scene = null;
  }

  public tick() {
    const otherPlayersMeshName = Object.keys(this._otherPlayersMesh)
    const nOtherPlayerName = []
    for (const otherPlayer of this.otherPlayers) {
      nOtherPlayerName.push(otherPlayer.ID);
      if (otherPlayersMeshName.indexOf(otherPlayer.ID) == -1) {
        const h = 1.8;
        const r = 0.6;
        const displayCapsule = BABYLON.MeshBuilder.CreateText(otherPlayer.ID, otherPlayer.ID, fontData, {  size: 1,  resolution: 1, depth: 1}, this._scene, earcut);
        this._otherPlayersMesh[otherPlayer.ID] = displayCapsule
        continue
      } 
      const capsule = this._otherPlayersMesh[otherPlayer.ID]
      capsule.position = new BABYLON.Vector3(otherPlayer.X, otherPlayer.Y, otherPlayer.Z);
    }

    for (const otherMeshPlayer of otherPlayersMeshName) {
      if (nOtherPlayerName.indexOf(otherMeshPlayer) == -1) {
        const mesh = this._otherPlayersMesh[otherMeshPlayer]
        mesh.dispose()
        delete this._otherPlayersMesh[otherMeshPlayer]
      }
    }
  }
}
