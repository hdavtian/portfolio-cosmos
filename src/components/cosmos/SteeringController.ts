import { ArriveBehavior, EntityManager, Vehicle, Vector3 } from "yuka";
import * as THREE from "three";

export class SteeringController {
  private readonly entityManager: EntityManager;
  private readonly vehicle: Vehicle;
  private readonly arriveBehavior: ArriveBehavior;
  private readonly target: Vector3;
  private readonly velocityCache = new THREE.Vector3();

  constructor() {
    this.entityManager = new EntityManager();
    this.vehicle = new Vehicle();
    this.vehicle.maxSpeed = 12;
    this.vehicle.maxForce = 6;

    this.target = new Vector3();
    this.arriveBehavior = new ArriveBehavior(this.target, 4, 15);
    this.vehicle.steering.add(this.arriveBehavior);

    this.entityManager.add(this.vehicle);
  }

  public update(deltaSeconds: number): void {
    this.entityManager.update(deltaSeconds);
  }

  public setTargetPosition(position: THREE.Vector3): void {
    this.target.set(position.x, position.y, position.z);
  }

  public setVehiclePosition(position: THREE.Vector3): void {
    this.vehicle.position.set(position.x, position.y, position.z);
  }

  public setVehiclePositionFromComponents(
    x: number,
    y: number,
    z: number,
  ): void {
    this.vehicle.position.set(x, y, z);
  }

  public getVehiclePosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.vehicle.position.x,
      this.vehicle.position.y,
      this.vehicle.position.z,
    );
  }

  public copyVehicleVelocity(
    out: THREE.Vector3 = this.velocityCache,
  ): THREE.Vector3 | undefined {
    if (!this.vehicle.velocity) {
      return undefined;
    }

    out.set(
      this.vehicle.velocity.x,
      this.vehicle.velocity.y,
      this.vehicle.velocity.z,
    );

    return out;
  }

  public getVehicle(): Vehicle {
    return this.vehicle;
  }

  public getTarget(): Vector3 {
    return this.target;
  }
}
