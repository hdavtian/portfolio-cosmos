import RAPIER from "@dimforge/rapier3d-compat";

const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 5;

class PhysicsWorld {
  private world: RAPIER.World | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private accumulator = 0;

  public async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      await RAPIER.init();
      this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
      this.initialized = true;
    })();

    return this.initPromise;
  }

  public step(deltaSeconds: number): void {
    if (!this.initialized || !this.world) {
      return;
    }

    this.accumulator += Math.max(0, deltaSeconds);

    let substeps = 0;
    while (this.accumulator >= FIXED_DT && substeps < MAX_SUBSTEPS) {
      this.world.step();
      this.accumulator -= FIXED_DT;
      substeps += 1;
    }
  }

  public reset(): void {
    this.accumulator = 0;
  }

  public getWorld(): RAPIER.World | null {
    return this.world;
  }

  public isReady(): boolean {
    return this.initialized;
  }
}

export const physicsWorld = new PhysicsWorld();
