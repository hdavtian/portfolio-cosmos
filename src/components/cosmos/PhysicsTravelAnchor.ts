import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { SteeringController } from "./SteeringController";

const ANCHOR_RADIUS = 0.5;

export class PhysicsTravelAnchor {
  private body: RAPIER.RigidBody | null = null;
  private initialized = false;
  private readonly object = new THREE.Object3D();
  private readonly steering = new SteeringController();
  private readonly linvel = { x: 0, y: 0, z: 0 };
  private readonly velocityScratch = new THREE.Vector3();

  public init(
    world: RAPIER.World,
    scene: THREE.Scene,
    initialPosition: THREE.Vector3,
  ): void {
    if (this.initialized) {
      return;
    }

    const bodyDesc =
      RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(
        initialPosition.x,
        initialPosition.y,
        initialPosition.z,
      );
    this.body = world.createRigidBody(bodyDesc);

    const colliderDesc =
      RAPIER.ColliderDesc.ball(ANCHOR_RADIUS).setSensor(true);
    world.createCollider(colliderDesc, this.body);

    this.object.name = "physics-travel-anchor";
    this.object.position.copy(initialPosition);
    scene.add(this.object);

    this.initialized = true;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public setTarget(position: THREE.Vector3): void {
    this.steering.setTargetPosition(position);
  }

  public preStep(deltaSeconds: number): void {
    if (!this.body || !this.initialized) {
      return;
    }

    const bodyPos = this.body.translation();
    this.steering.setVehiclePositionFromComponents(
      bodyPos.x,
      bodyPos.y,
      bodyPos.z,
    );

    this.steering.update(deltaSeconds);

    const velocity = this.steering.copyVehicleVelocity(this.velocityScratch);
    if (!velocity) {
      return;
    }

    this.linvel.x = velocity.x;
    this.linvel.y = velocity.y;
    this.linvel.z = velocity.z;

    this.body.setLinvel(this.linvel, true);
  }

  public postStep(): void {
    if (!this.body || !this.initialized) {
      return;
    }

    const bodyPos = this.body.translation();
    this.object.position.set(bodyPos.x, bodyPos.y, bodyPos.z);
  }

  public getObject(): THREE.Object3D {
    return this.object;
  }
}
