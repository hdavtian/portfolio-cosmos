declare module "yuka" {
  export class Vector3 {
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
  }

  export class ArriveBehavior {
    constructor(target: Vector3, deceleration?: number, tolerance?: number);
  }

  export class Vehicle {
    position: Vector3;
    velocity: Vector3;
    maxSpeed: number;
    maxForce: number;
    steering: { add: (behavior: unknown) => void };
  }

  export class EntityManager {
    add(entity: unknown): void;
    update(deltaSeconds: number): void;
  }
}
