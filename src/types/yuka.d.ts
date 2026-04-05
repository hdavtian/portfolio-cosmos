declare module "yuka" {
  export class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
    set(x: number, y: number, z: number): this;
    copy(v: Vector3): this;
    add(v: Vector3): this;
    sub(v: Vector3): this;
    multiplyScalar(s: number): this;
    distanceTo(v: Vector3): number;
    squaredDistanceTo(v: Vector3): number;
    length(): number;
    normalize(): this;
    clone(): Vector3;
  }

  export class SteeringBehavior {
    active: boolean;
    weight: number;
    calculate(vehicle: Vehicle, force: Vector3, delta: number): Vector3;
  }

  export class SteeringManager {
    behaviors: SteeringBehavior[];
    add(behavior: SteeringBehavior): this;
    remove(behavior: SteeringBehavior): this;
    clear(): this;
    calculate(delta: number, result: Vector3): Vector3;
  }

  export class ArriveBehavior extends SteeringBehavior {
    target: Vector3;
    deceleration: number;
    tolerance: number;
    constructor(target?: Vector3, deceleration?: number, tolerance?: number);
  }

  export class SeekBehavior extends SteeringBehavior {
    target: Vector3;
    constructor(target?: Vector3);
  }

  export class WanderBehavior extends SteeringBehavior {
    radius: number;
    distance: number;
    jitter: number;
    constructor(radius?: number, distance?: number, jitter?: number);
  }

  export class SeparationBehavior extends SteeringBehavior {
    constructor();
  }

  export class CohesionBehavior extends SteeringBehavior {
    constructor();
  }

  export class AlignmentBehavior extends SteeringBehavior {
    constructor();
  }

  export class FollowPathBehavior extends SteeringBehavior {
    path: Path;
    nextWaypointDistance: number;
    constructor(path?: Path, nextWaypointDistance?: number);
  }

  export class OnPathBehavior extends SteeringBehavior {
    path: Path;
    radius: number;
    predictionFactor: number;
    constructor(path?: Path, radius?: number, predictionFactor?: number);
  }

  export class Path {
    loop: boolean;
    constructor();
    add(waypoint: Vector3): this;
    clear(): this;
    current(): Vector3;
    advance(): this;
    finished(): boolean;
  }

  export class Vehicle {
    position: Vector3;
    velocity: Vector3;
    rotation: { x: number; y: number; z: number; w: number };
    forward: Vector3;
    up: Vector3;
    maxSpeed: number;
    maxForce: number;
    maxTurnRate: number;
    mass: number;
    boundingRadius: number;
    neighborhoodRadius: number;
    updateNeighborhood: boolean;
    updateOrientation: boolean;
    steering: SteeringManager;
    smoother: unknown | null;
    neighbors: Vehicle[];
    active: boolean;
    name: string;
    uuid: string;

    constructor();
    update(delta: number): this;
    setRenderComponent(
      renderComponent: unknown,
      callback: (entity: Vehicle, renderComponent: unknown) => void,
    ): this;
  }

  export class EntityManager {
    entities: Vehicle[];
    constructor();
    add(entity: Vehicle): this;
    remove(entity: Vehicle): this;
    update(delta: number): this;
    clear(): this;
  }
}
