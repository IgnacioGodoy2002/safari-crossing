import * as THREE from 'three';
import { SoundManager } from './SoundManager';

// ─── Types ────────────────────────────────────────────────────────────────────

type Direction = 'forward' | 'backward' | 'left' | 'right';

interface LaneVehicle extends THREE.Group {
  position: THREE.Vector3;
}

interface LaneData {
  index: number;
  type: 'field' | 'forest' | 'car' | 'truck' | 'rail' | 'river';
  mesh: THREE.Group;
  direction?: boolean;
  speed?: number;
  occupiedPositions?: Set<number>;
  threes?: THREE.Group[];
  vechicles?: LaneVehicle[];
  // rail-specific
  trainTimer?: number;
  trainInterval?: number;
  signalMats?: THREE.MeshBasicMaterial[];
  // river-specific
  logs?: LaneVehicle[];
  logLength?: number;
  // collectible coins
  coins?: THREE.Group[];
}

interface Position { lane: number; column: number; }

export interface GameOptions {
  counterEl: HTMLElement;
  onGameOver: (score: number) => void;
  onScoreChange?: (score: number) => void;
}

// ─── Game ─────────────────────────────────────────────────────────────────────

export class Game {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private dirLight!: THREE.DirectionalLight;
  private chicken!: THREE.Group;

  private lanes: LaneData[] = [];
  private currentLane = 0;
  private currentColumn = 0;
  private moves: Direction[] = [];
  private previousTimestamp: number | null = null;
  private startMoving = false;
  private stepStartTimestamp: number | null = null;
  private rafId: number | null = null;
  private dead = false;
  private dying        = false;
  private dyingStartTs = 0;
  private dyingScore   = 0;

  private legFL!: THREE.Group;
  private legFR!: THREE.Group;
  private legBL!: THREE.Group;
  private legBR!: THREE.Group;

  private blinkGroupL!: THREE.Group;
  private blinkGroupR!: THREE.Group;
  private blinkTimer = 0;
  private blinkOpen = true;
  private blinkProgress = 0;

  private tailGroup!: THREE.Group;
  private stepStartX = 0;
  private stepStartY = 0;
  private bonusScore = 0;

  private readonly opts: GameOptions;

  // constants
  private readonly distance = 500;
  private readonly zoom = 2;
  private readonly chickenSize = 15;
  private readonly positionWidth = 42;
  private readonly columns = 17;
  private readonly stepTime = 200;
  private readonly laneTypes = ['car', 'truck', 'forest', 'car', 'forest', 'rail', 'river', 'river'] as const;
  private readonly laneSpeeds = [2, 2.5, 3];
  // Desierto Andino palette: turquoise, hot pink, turmeric yellow
  private readonly vehicleColors = [0x2ecbcb, 0xe8406a, 0xe8b020, 0x30cc30, 0xff6600];
  private readonly treeHeights = [20, 45, 60];

  private readonly initialCameraPositionX: number;
  private readonly initialCameraPositionY: number;
  private readonly initialDirLightPositionX = -100;
  private readonly initialDirLightPositionY = -100;

  // textures (created once)
  private readonly carFrontTexture: THREE.CanvasTexture;
  private readonly carBackTexture: THREE.CanvasTexture;
  private readonly carRightSideTexture: THREE.CanvasTexture;
  private readonly carLeftSideTexture: THREE.CanvasTexture;
  private readonly truckFrontTexture: THREE.CanvasTexture;
  private readonly truckRightSideTexture: THREE.CanvasTexture;
  private readonly truckLeftSideTexture: THREE.CanvasTexture;

  constructor(opts: GameOptions) {
    this.opts = opts;

    // ── Scene ──
    this.scene = new THREE.Scene();

    // ── Camera ──
    this.camera = new THREE.OrthographicCamera(
      window.innerWidth / -2, window.innerWidth / 2,
      window.innerHeight / 2, window.innerHeight / -2,
      0.1, 10000,
    );
    this.camera.rotation.x = 50 * Math.PI / 180;
    this.camera.rotation.y = 20 * Math.PI / 180;
    this.camera.rotation.z = 10 * Math.PI / 180;

    this.initialCameraPositionY = -Math.tan(this.camera.rotation.x) * this.distance;
    this.initialCameraPositionX = Math.tan(this.camera.rotation.y) *
      Math.sqrt(this.distance ** 2 + this.initialCameraPositionY ** 2);
    this.camera.position.set(this.initialCameraPositionX, this.initialCameraPositionY, this.distance);

    // ── Renderer ──
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.domElement.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;';
    document.body.insertBefore(this.renderer.domElement, document.body.firstChild);

    // ── Textures ──
    this.carFrontTexture      = this.makeTexture(40, 80, [{ x: 0,  y: 10, w: 30, h: 60 }]);
    this.carBackTexture       = this.makeTexture(40, 80, [{ x: 10, y: 10, w: 30, h: 60 }]);
    this.carRightSideTexture  = this.makeTexture(110, 40, [{ x: 10, y: 0,  w: 50, h: 30 }, { x: 70, y: 0,  w: 30, h: 30 }]);
    this.carLeftSideTexture   = this.makeTexture(110, 40, [{ x: 10, y: 10, w: 50, h: 30 }, { x: 70, y: 10, w: 30, h: 30 }]);
    this.truckFrontTexture    = this.makeTexture(30, 30, [{ x: 15, y: 0,  w: 10, h: 30 }]);
    this.truckRightSideTexture = this.makeTexture(25, 30, [{ x: 0,  y: 15, w: 10, h: 10 }]);
    this.truckLeftSideTexture  = this.makeTexture(25, 30, [{ x: 0,  y: 5,  w: 10, h: 10 }]);

    // ── Lights ──
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6);
    this.scene.add(hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    this.dirLight.position.set(this.initialDirLightPositionX, this.initialDirLightPositionY, 200);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    const d = 500;
    this.dirLight.shadow.camera.left   = -d;
    this.dirLight.shadow.camera.right  =  d;
    this.dirLight.shadow.camera.top    =  d;
    this.dirLight.shadow.camera.bottom = -d;
    this.scene.add(this.dirLight);

    const backLight = new THREE.DirectionalLight(0x000000, 0.4);
    backLight.position.set(200, 200, 50);
    backLight.castShadow = true;
    this.scene.add(backLight);

    // ── Character ──
    this.chicken = this.makeLlama();
    this.scene.add(this.chicken);
    this.dirLight.target = this.chicken;

    // ── Controls ──
    this.bindControls();

    this.initialise();
    this.startLoop();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  reset(): void {
    this.stopLoop();
    this.lanes.forEach(lane => this.scene.remove(lane.mesh));
    this.dead = false;
    this.chicken.rotation.z = 0;
    this.chicken.scale.setScalar(1);
    this.initialise();
    this.startLoop();
  }

  destroy(): void {
    this.stopLoop();
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }

  pause(): void {
    this.stopLoop();
  }

  resume(): void {
    if (!this.dead) this.startLoop();
  }

  move(direction: Direction): void {
    if (this.dead) return;

    // Derive the visual column from the actual chicken X so river drift doesn't
    // cause false tree-block detections when currentColumn has drifted.
    const { positionWidth, columns, zoom } = this;
    const boardWidth = positionWidth * columns;
    const visualCol = Math.max(0, Math.min(columns - 1,
      Math.floor((this.chicken.position.x + boardWidth * zoom / 2) / (positionWidth * zoom))
    ));

    const finalPositions = this.moves.reduce<Position>(
      (pos, m) => {
        if (m === 'forward')  return { lane: pos.lane + 1, column: pos.column };
        if (m === 'backward') return { lane: pos.lane - 1, column: pos.column };
        if (m === 'left')     return { lane: pos.lane,     column: pos.column - 1 };
        return { lane: pos.lane, column: pos.column + 1 };
      },
      { lane: this.currentLane, column: visualCol },
    );

    const isBlocked = (l: LaneData | undefined, col: number) =>
      (l?.type === 'forest' || l?.type === 'rail') && l.occupiedPositions?.has(col);

    if (direction === 'forward') {
      const nextLane = this.lanes[finalPositions.lane + 1];
      if (isBlocked(nextLane, finalPositions.column)) return;
      if (!this.stepStartTimestamp) this.startMoving = true;
      this.addLane();
    } else if (direction === 'backward') {
      if (finalPositions.lane === 0) return;
      const prevLane = this.lanes[finalPositions.lane - 1];
      if (isBlocked(prevLane, finalPositions.column)) return;
      if (!this.stepStartTimestamp) this.startMoving = true;
    } else if (direction === 'left') {
      if (finalPositions.column === 0) return;
      const curLane = this.lanes[finalPositions.lane];
      if (isBlocked(curLane, finalPositions.column - 1)) return;
      if (!this.stepStartTimestamp) this.startMoving = true;
    } else if (direction === 'right') {
      if (finalPositions.column === this.columns - 1) return;
      const curLane = this.lanes[finalPositions.lane];
      if (isBlocked(curLane, finalPositions.column + 1)) return;
      if (!this.stepStartTimestamp) this.startMoving = true;
    }
    this.moves.push(direction);
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private initialise(): void {
    this.lanes        = [];
    this.bonusScore   = 0;
    this.dying        = false;
    this.dyingStartTs = 0;
    this.generateLanes();
    this.currentLane = 0;
    this.currentColumn = Math.floor(this.columns / 2);
    this.previousTimestamp = null;
    this.startMoving = false;
    this.moves = [];
    this.stepStartTimestamp = null;
    this.stepStartX = 0;
    this.stepStartY = 0;
    this.chicken.position.set(0, 0, 3 * this.zoom);
    this.chicken.rotation.z = Math.PI / 2; // face forward
    if (this.legFL) {
      this.legFL.rotation.x = this.legFR.rotation.x = 0;
      this.legBL.rotation.x = this.legBR.rotation.x = 0;
    }
    if (this.blinkGroupL) {
      this.blinkGroupL.scale.z = 1;
      this.blinkGroupR.scale.z = 1;
      this.blinkOpen = true;
      this.blinkTimer = 0;
      this.blinkProgress = 0;
    }
    this.camera.position.set(this.initialCameraPositionX, this.initialCameraPositionY, this.distance);
    this.dirLight.position.set(this.initialDirLightPositionX, this.initialDirLightPositionY, 200);
    this.opts.counterEl.textContent = '0';
  }

  private startLoop(): void {
    const animate = (timestamp: number) => {
      this.rafId = requestAnimationFrame(animate);
      this.tick(timestamp);
    };
    this.rafId = requestAnimationFrame(animate);
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick(timestamp: number): void {
    if (!this.previousTimestamp) this.previousTimestamp = timestamp;
    const delta = timestamp - this.previousTimestamp;
    this.previousTimestamp = timestamp;

    const { zoom, positionWidth, columns } = this;
    const boardWidth = positionWidth * columns;

    this.updateBlink(delta);

    // Tail wag — gentle side-to-side oscillation
    if (this.tailGroup) {
      this.tailGroup.rotation.y = Math.sin(timestamp * 0.0025) * 0.35;
    }

    // Move vehicles (cars & trucks loop endlessly)
    this.lanes.forEach(lane => {
      if (lane.type !== 'car' && lane.type !== 'truck') return;
      const start = -boardWidth * zoom / 2 - positionWidth * 2 * zoom;
      const end   =  boardWidth * zoom / 2 + positionWidth * 2 * zoom;
      lane.vechicles?.forEach(v => {
        if (lane.direction) {
          v.position.x = v.position.x < start ? end : v.position.x - lane.speed! / 16 * delta;
        } else {
          v.position.x = v.position.x > end ? start : v.position.x + lane.speed! / 16 * delta;
        }
      });
    });

    // Move logs (river lanes loop endlessly)
    this.lanes.forEach(lane => {
      if (lane.type !== 'river') return;
      const start = -boardWidth * zoom / 2 - positionWidth * 3 * zoom;
      const end   =  boardWidth * zoom / 2 + positionWidth * 3 * zoom;
      lane.logs?.forEach(log => {
        if (lane.direction) {
          log.position.x = log.position.x < start ? end : log.position.x - lane.speed! / 16 * delta;
        } else {
          log.position.x = log.position.x > end ? start : log.position.x + lane.speed! / 16 * delta;
        }
      });
    });

    // Rail — timer-based train with warning signal
    const spawnEdge = boardWidth * zoom / 2 + 200 * zoom;
    this.lanes.forEach(lane => {
      if (lane.type !== 'rail') return;
      const train = lane.vechicles![0];
      const hidden = train.position.x < -5000;

      if (hidden) {
        lane.trainTimer! -= delta;
        // Flash signal during warning window (last 2 000 ms of countdown)
        if (lane.signalMats && lane.trainTimer! <= 2000 && lane.trainTimer! > 0) {
          const on = Math.floor(Date.now() / 280) % 2 === 0;
          lane.signalMats.forEach(m => { m.color.setHex(on ? 0xff1111 : 0x330000); });
        }
        // Spawn train when countdown reaches 0
        if (lane.trainTimer! <= 0) {
          train.position.x = lane.direction ? spawnEdge : -spawnEdge;
          if (lane.signalMats) lane.signalMats.forEach(m => { m.color.setHex(0xff1111); });
        }
      } else {
        // Move train across and reset when fully off-screen on exit side
        if (lane.direction) {
          train.position.x -= lane.speed! / 16 * delta;
          if (train.position.x < -spawnEdge) { this.resetTrain(lane); }
        } else {
          train.position.x += lane.speed! / 16 * delta;
          if (train.position.x > spawnEdge) { this.resetTrain(lane); }
        }
      }
    });

    // Rotate coins and collect on proximity
    if (!this.dead) {
      const chickenX = this.chicken.position.x;
      const chickenY = this.chicken.position.y;
      this.lanes.forEach(lane => {
        if (!lane.coins?.length) return;
        const laneY = lane.mesh.position.y;
        if (Math.abs(laneY - chickenY) > positionWidth * zoom * 0.85) {
          lane.coins.forEach(c => { c.rotation.z += delta * 0.004; });
          return;
        }
        lane.coins = lane.coins.filter(coin => {
          coin.rotation.z += delta * 0.004;
          if (Math.abs(coin.position.x - chickenX) < 14 * zoom) {
            lane.mesh.remove(coin);
            this.bonusScore++;
            this.opts.counterEl.textContent = String(this.currentLane + this.bonusScore);
            SoundManager.playCoin();
            return false;
          }
          return true;
        });
      });
    }

    if (this.startMoving) {
      this.stepStartTimestamp = timestamp;
      this.stepStartX = this.chicken.position.x;
      this.stepStartY = this.chicken.position.y;
      this.startMoving = false;
      if (this.moves[0]) this.updateFacing(this.moves[0]);
      SoundManager.playMove();
    }

    if (this.stepStartTimestamp !== null) {
      const moveDelta = timestamp - this.stepStartTimestamp;
      const moveDist  = Math.min(moveDelta / this.stepTime, 1) * positionWidth * zoom;
      const jumpDist  = Math.sin(Math.min(moveDelta / this.stepTime, 1) * Math.PI) * 8 * zoom;

      // Leg swing animation — diagonal pairs alternate
      const progress = Math.min(moveDelta / this.stepTime, 1);
      const swing = Math.sin(progress * Math.PI * 2) * 0.35;
      this.legFL.rotation.x =  swing;
      this.legBR.rotation.x =  swing;
      this.legFR.rotation.x = -swing;
      this.legBL.rotation.x = -swing;

      const dir = this.moves[0];
      if (dir === 'forward') {
        const posY = this.currentLane * positionWidth * zoom + moveDist;
        this.camera.position.y = this.initialCameraPositionY + posY;
        this.dirLight.position.y = this.initialDirLightPositionY + posY;
        this.chicken.position.y = posY;
        this.chicken.position.z = jumpDist + 3 * zoom;
      } else if (dir === 'backward') {
        const posY = this.currentLane * positionWidth * zoom - moveDist;
        this.camera.position.y = this.initialCameraPositionY + posY;
        this.dirLight.position.y = this.initialDirLightPositionY + posY;
        this.chicken.position.y = posY;
        this.chicken.position.z = jumpDist + 3 * zoom;
      } else if (dir === 'left') {
        const posX = this.stepStartX - moveDist;
        this.camera.position.x = this.initialCameraPositionX + posX;
        this.dirLight.position.x = this.initialDirLightPositionX + posX;
        this.chicken.position.x = posX;
        this.chicken.position.z = jumpDist + 3 * zoom;
      } else if (dir === 'right') {
        const posX = this.stepStartX + moveDist;
        this.camera.position.x = this.initialCameraPositionX + posX;
        this.dirLight.position.x = this.initialDirLightPositionX + posX;
        this.chicken.position.x = posX;
        this.chicken.position.z = jumpDist + 3 * zoom;
      }

      if (moveDelta > this.stepTime) {
        if (dir === 'forward') {
          this.currentLane++;
          this.opts.counterEl.textContent = String(this.currentLane + this.bonusScore);
          this.opts.onScoreChange?.(this.currentLane + this.bonusScore);
        } else if (dir === 'backward') {
          this.currentLane--;
          this.opts.counterEl.textContent = String(this.currentLane + this.bonusScore);
          this.opts.onScoreChange?.(this.currentLane + this.bonusScore);
        } else if (dir === 'left') {
          this.currentColumn--;
        } else if (dir === 'right') {
          this.currentColumn++;
        }
        this.moves.shift();
        this.stepStartTimestamp = this.moves.length === 0 ? null : timestamp;
        // Capture the true landing position so each queued step starts from the
        // correct place — without this, chained moves all animate from stepStartX=0.
        this.stepStartX = this.chicken.position.x;
        this.stepStartY = this.chicken.position.y;
        if (this.moves.length > 0) this.updateFacing(this.moves[0]);
        if (this.moves.length === 0) {
          this.legFL.rotation.x = this.legFR.rotation.x = 0;
          this.legBL.rotation.x = this.legBR.rotation.x = 0;
        }
      }
    }

    // Hit test — use visual Y position so mid-step collisions are detected
    // (currentLane only updates on step completion, leaving a gap where the player
    //  is visually inside a vehicle lane but the hit test checks the previous lane)
    const visualLaneIdx = Math.max(0, Math.min(this.lanes.length - 1,
      Math.round(this.chicken.position.y / (positionWidth * zoom))
    ));
    const lane = this.lanes[visualLaneIdx];
    if (!this.dead && (lane.type === 'car' || lane.type === 'truck' || lane.type === 'rail')) {
      const chickenMinX = this.chicken.position.x - this.chickenSize * zoom / 2;
      const chickenMaxX = this.chicken.position.x + this.chickenSize * zoom / 2;
      const vehicleLen = lane.type === 'car' ? 60 : lane.type === 'truck' ? 105 : 233;
      lane.vechicles?.forEach(v => {
        const carMinX = v.position.x - vehicleLen * zoom / 2;
        const carMaxX = v.position.x + vehicleLen * zoom / 2;
        if (chickenMaxX > carMinX && chickenMinX < carMaxX) {
          this.dead        = true;
          this.dying       = true;
          this.dyingStartTs = timestamp;
          this.dyingScore  = visualLaneIdx + this.bonusScore;
          SoundManager.playDeath();
        }
      });
    }

    // River — check if on a log, drift with it, die if in water
    if (!this.dead && lane?.type === 'river' && this.stepStartTimestamp === null) {
      const halfChicken = this.chickenSize * zoom * 0.4;
      const logHalfLen  = (lane.logLength ?? 60) * zoom / 2;
      const onALog = lane.logs?.some(log =>
        this.chicken.position.x + halfChicken > log.position.x - logHalfLen &&
        this.chicken.position.x - halfChicken < log.position.x + logHalfLen
      ) ?? false;

      if (!onALog) {
        this.dead        = true;
        this.dying       = true;
        this.dyingStartTs = timestamp;
        this.dyingScore  = visualLaneIdx + this.bonusScore;
        SoundManager.playDeath();
      } else {
        // Drift with log — same speed/direction formula as log movement
        const drift = (lane.direction ? -1 : 1) * lane.speed! / 16 * delta;
        this.chicken.position.x += drift;
        this.camera.position.x  += drift;
        this.dirLight.position.x += drift;
        // Die if carried off-screen edge
        if (Math.abs(this.chicken.position.x) > boardWidth * zoom / 2 + positionWidth * zoom) {
          this.dead        = true;
          this.dying       = true;
          this.dyingStartTs = timestamp;
          this.dyingScore  = visualLaneIdx + this.bonusScore;
          SoundManager.playDeath();
        }
      }
    }

    // Death animation
    if (this.dying) {
      const DURATION = 500;
      const p = Math.min((timestamp - this.dyingStartTs) / DURATION, 1);
      this.chicken.rotation.z = -p * Math.PI / 2;
      this.chicken.scale.setScalar(Math.max(1 - p * p, 0));
      if (p >= 1) {
        this.dying = false;
        this.opts.onGameOver(this.dyingScore);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  // ─── Lane / scene builders ────────────────────────────────────────────────

  private generateLanes(): void {
    for (const index of [-9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const lane = this.makeLane(index);
      lane.mesh.position.y = index * this.positionWidth * this.zoom;
      this.scene.add(lane.mesh);
      if (index >= 0) this.lanes.push(lane);
    }
  }

  private addLane(): void {
    const index = this.lanes.length;
    const lane = this.makeLane(index);
    lane.mesh.position.y = index * this.positionWidth * this.zoom;
    this.scene.add(lane.mesh);
    this.lanes.push(lane);
  }

  private makeLane(index: number): LaneData {
    const { zoom, positionWidth, columns } = this;
    const boardWidth = positionWidth * columns;

    if (index <= 0) {
      return { index, type: 'field', mesh: this.makeGrass() };
    }

    // Prevent rail/river from clustering too close together
    const recentTypes = this.lanes.slice(-3).map(l => l.type);
    const hasRecentRail   = recentTypes.includes('rail');
    const hasRecentRiver  = recentTypes.filter(t => t === 'river').length >= 2;
    const eligibleTypes = (hasRecentRail || hasRecentRiver)
      ? (['car', 'truck', 'forest', 'car', 'forest'] as const)
      : this.laneTypes;
    const type = eligibleTypes[Math.floor(Math.random() * eligibleTypes.length)];

    if (type === 'forest') {
      const mesh = this.makeGrass();
      const occupiedPositions = new Set<number>();
      const threes = [1, 2, 3].map(() => {
        const tree = this.makeTree();
        let pos: number;
        do { pos = Math.floor(Math.random() * columns); }
        while (occupiedPositions.has(pos));
        occupiedPositions.add(pos);
        tree.position.x = (pos * positionWidth + positionWidth / 2) * zoom - boardWidth * zoom / 2;
        mesh.add(tree);
        return tree;
      });
      // Coins — 0-2 per forest lane, only in free columns (separate set so player isn't blocked)
      const coins: THREE.Group[] = [];
      const coinCount = Math.random() < 0.6 ? Math.floor(Math.random() * 2) + 1 : 0;
      const usedCoinCols = new Set<number>();
      for (let i = 0; i < coinCount; i++) {
        let col: number; let tries = 0;
        do { col = Math.floor(Math.random() * columns); tries++; }
        while ((occupiedPositions.has(col) || usedCoinCols.has(col)) && tries < 20);
        if (occupiedPositions.has(col) || usedCoinCols.has(col)) continue;
        usedCoinCols.add(col);
        const coin = this.makeCoin();
        coin.position.x = (col * positionWidth + positionWidth / 2) * zoom - boardWidth * zoom / 2;
        mesh.add(coin);
        coins.push(coin);
      }
      return { index, type: 'forest', mesh, occupiedPositions, threes, coins };
    }

    if (type === 'car') {
      const mesh = this.makeRoad();
      const direction = Math.random() >= 0.5;
      const occupied = new Set<number>();
      const vechicles = [1, 2, 3].map(() => {
        const car = this.makeCar() as unknown as LaneVehicle;
        let pos: number;
        do { pos = Math.floor(Math.random() * columns / 2); }
        while (occupied.has(pos));
        occupied.add(pos);
        car.position.x = (pos * positionWidth * 2 + positionWidth / 2) * zoom - boardWidth * zoom / 2;
        if (!direction) car.rotation.z = Math.PI;
        mesh.add(car);
        return car;
      });
      const speed = this.laneSpeeds[Math.floor(Math.random() * this.laneSpeeds.length)];
      return { index, type: 'car', mesh, direction, speed, vechicles };
    }

    if (type === 'rail') {
      const mesh = this.makeRail();
      const direction = Math.random() >= 0.5;
      const trainInterval = 6000 + Math.random() * 3000;
      const train = this.makeTrain() as unknown as LaneVehicle;
      train.position.x = -10000; // hidden off-scene until timer fires
      if (!direction) train.rotation.z = Math.PI;
      mesh.add(train);
      // Pick a random column for the signal and block it from player movement
      const sigCol = Math.floor(Math.random() * columns);
      const sigX = (sigCol * positionWidth + positionWidth / 2) * zoom - boardWidth * zoom / 2;
      const { group: sig, mats: signalMats } = this.makeSignal();
      sig.position.x = sigX;
      mesh.add(sig);
      const occupiedPositions = new Set<number>([sigCol]);
      return { index, type: 'rail', mesh, direction, speed: 18, vechicles: [train], trainTimer: trainInterval, trainInterval, signalMats, occupiedPositions };
    }

    if (type === 'river') {
      const riverMesh = this.makeRiver();
      const riverDir = Math.random() >= 0.5;
      const logLen = ([50, 80, 110] as const)[Math.floor(Math.random() * 3)];
      const logCount = logLen <= 50 ? 6 : logLen <= 80 ? 5 : 3;
      const logSpacing = Math.floor(boardWidth / logCount);
      const riverLogs = Array.from({ length: logCount }, (_, i) => {
        const log = this.makeLog(logLen) as unknown as LaneVehicle;
        const startOffset = (Math.random() - 0.5) * logSpacing * 0.6;
        log.position.x = (i * logSpacing + logSpacing / 2 + startOffset) * zoom - boardWidth * zoom / 2;
        riverMesh.add(log);
        return log;
      });
      const riverSpeed = this.laneSpeeds[Math.floor(Math.random() * this.laneSpeeds.length)];
      return { index, type: 'river', mesh: riverMesh, direction: riverDir, speed: riverSpeed, logs: riverLogs, logLength: logLen };
    }

    // truck
    const mesh = this.makeRoad();
    const direction = Math.random() >= 0.5;
    const occupied = new Set<number>();
    const vechicles = [1, 2].map(() => {
      const truck = this.makeTruck() as unknown as LaneVehicle;
      let pos: number;
      do { pos = Math.floor(Math.random() * columns / 3); }
      while (occupied.has(pos));
      occupied.add(pos);
      truck.position.x = (pos * positionWidth * 3 + positionWidth / 2) * zoom - boardWidth * zoom / 2;
      if (!direction) truck.rotation.z = Math.PI;
      mesh.add(truck);
      return truck;
    });
    const speed = this.laneSpeeds[Math.floor(Math.random() * this.laneSpeeds.length)];
    return { index, type: 'truck', mesh, direction, speed, vechicles };
  }

  // ─── Mesh factories ───────────────────────────────────────────────────────

  private makeTexture(
    width: number, height: number,
    rects: { x: number; y: number; w: number; h: number }[],
  ): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    rects.forEach(r => ctx.fillRect(r.x, r.y, r.w, r.h));
    return new THREE.CanvasTexture(canvas);
  }

  private makeWheel(): THREE.Mesh {
    const { zoom } = this;
    const w = new THREE.Mesh(
      new THREE.BoxGeometry(12 * zoom, 33 * zoom, 12 * zoom),
      new THREE.MeshLambertMaterial({ color: 0x333333, flatShading: true }),
    );
    w.position.z = 6 * zoom;
    return w;
  }

  private makeCar(): THREE.Group {
    const { zoom, vehicleColors } = this;
    const car = new THREE.Group();
    const color = vehicleColors[Math.floor(Math.random() * vehicleColors.length)];

    const main = new THREE.Mesh(
      new THREE.BoxGeometry(60 * zoom, 30 * zoom, 15 * zoom),
      new THREE.MeshPhongMaterial({ color, flatShading: true }),
    );
    main.position.z = 12 * zoom;
    main.castShadow = main.receiveShadow = true;
    car.add(main);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(33 * zoom, 24 * zoom, 12 * zoom),
      [
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: this.carBackTexture }),
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: this.carFrontTexture }),
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: this.carRightSideTexture }),
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: this.carLeftSideTexture }),
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true }),
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true }),
      ],
    );
    cabin.position.set(6 * zoom, 0, 25.5 * zoom);
    cabin.castShadow = cabin.receiveShadow = true;
    car.add(cabin);

    const front = this.makeWheel(); front.position.x = -18 * zoom; car.add(front);
    const back  = this.makeWheel(); back.position.x  =  18 * zoom; car.add(back);
    return car;
  }

  private makeTruck(): THREE.Group {
    const { zoom, vehicleColors } = this;
    const truck = new THREE.Group();
    const color = vehicleColors[Math.floor(Math.random() * vehicleColors.length)];

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(100 * zoom, 25 * zoom, 5 * zoom),
      new THREE.MeshLambertMaterial({ color: 0xb4c6fc, flatShading: true }),
    );
    base.position.z = 10 * zoom;
    truck.add(base);

    const cargo = new THREE.Mesh(
      new THREE.BoxGeometry(75 * zoom, 35 * zoom, 40 * zoom),
      new THREE.MeshPhongMaterial({ color: 0xb4c6fc, flatShading: true }),
    );
    cargo.position.set(15 * zoom, 0, 30 * zoom);
    cargo.castShadow = cargo.receiveShadow = true;
    truck.add(cargo);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(25 * zoom, 30 * zoom, 30 * zoom),
      [
        new THREE.MeshPhongMaterial({ color, flatShading: true }),
        new THREE.MeshPhongMaterial({ color, flatShading: true, map: this.truckFrontTexture }),
        new THREE.MeshPhongMaterial({ color, flatShading: true, map: this.truckRightSideTexture }),
        new THREE.MeshPhongMaterial({ color, flatShading: true, map: this.truckLeftSideTexture }),
        new THREE.MeshPhongMaterial({ color, flatShading: true }),
        new THREE.MeshPhongMaterial({ color, flatShading: true }),
      ],
    );
    cabin.position.set(-40 * zoom, 0, 20 * zoom);
    cabin.castShadow = cabin.receiveShadow = true;
    truck.add(cabin);

    const fw = this.makeWheel(); fw.position.x = -38 * zoom; truck.add(fw);
    const mw = this.makeWheel(); mw.position.x = -10 * zoom; truck.add(mw);
    const bw = this.makeWheel(); bw.position.x =  30 * zoom; truck.add(bw);
    return truck;
  }

  private makeCoin(): THREE.Group {
    const { zoom } = this;
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(10 * zoom, 10 * zoom, 6 * zoom),
      new THREE.MeshPhongMaterial({ color: 0xf5c020, emissive: 0x604000, flatShading: true }),
    );
    const shine = new THREE.Mesh(
      new THREE.BoxGeometry(6 * zoom, 6 * zoom, 1.5 * zoom),
      new THREE.MeshPhongMaterial({ color: 0xffe870, emissive: 0x806000, flatShading: true }),
    );
    shine.position.z = 3.75 * zoom;
    g.add(base, shine);
    g.position.z = 3 * zoom;
    return g;
  }

  private makeTree(): THREE.Group {
    const { zoom } = this;
    const tree = new THREE.Group();
    const mat = (c: number) => new THREE.MeshPhongMaterial({ color: c, flatShading: true });

    // Palm trunk — tall, thin, dark brown
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(6*zoom, 6*zoom, 32*zoom), mat(0x5a3010));
    trunk.position.z = 16 * zoom;
    trunk.castShadow = trunk.receiveShadow = true;
    tree.add(trunk);

    // Central leaf cluster — wider to fill the column (column half = 21 units)
    const center = new THREE.Mesh(new THREE.BoxGeometry(20*zoom, 20*zoom, 12*zoom), mat(0x22aa22));
    center.position.z = 36 * zoom;
    center.castShadow = true;
    tree.add(center);

    // Fronds — capped at ±19 units reach so they stay inside their column (half=21)
    const frondH = mat(0x1a9618);
    const frondD = mat(0x148a10);
    // frond arm: center at ±12, half-size 7 → max reach 12+7=19 units ≤ 21 ✓
    const frondSide = new THREE.Mesh(new THREE.BoxGeometry(8*zoom, 14*zoom, 5*zoom), frondH);
    const frondFwd  = new THREE.Mesh(new THREE.BoxGeometry(14*zoom, 8*zoom, 5*zoom), frondH);
    frondSide.position.set(0,  12*zoom, 32*zoom); frondSide.castShadow = true; tree.add(frondSide);
    const frondSide2 = frondSide.clone(); frondSide2.material = frondH;
    frondSide2.position.set(0, -12*zoom, 32*zoom); tree.add(frondSide2);
    frondFwd.position.set( 12*zoom, 0, 32*zoom); frondFwd.castShadow = true; tree.add(frondFwd);
    const frondFwd2 = frondFwd.clone(); frondFwd2.material = frondH;
    frondFwd2.position.set(-12*zoom, 0, 32*zoom); tree.add(frondFwd2);

    // Corner fronds — center at ±9, half 5 → reach 14 units ✓
    const diag = new THREE.Mesh(new THREE.BoxGeometry(10*zoom, 10*zoom, 5*zoom), frondD);
    diag.position.set( 9*zoom,  9*zoom, 30*zoom); tree.add(diag);
    const d2 = diag.clone(); d2.material = frondD; d2.position.set(-9*zoom,  9*zoom, 30*zoom); tree.add(d2);
    const d3 = diag.clone(); d3.material = frondD; d3.position.set( 9*zoom, -9*zoom, 30*zoom); tree.add(d3);
    const d4 = diag.clone(); d4.material = frondD; d4.position.set(-9*zoom, -9*zoom, 30*zoom); tree.add(d4);

    return tree;
  }

  private makeLlama(): THREE.Group {
    const { zoom } = this;
    const giraffe = new THREE.Group();
    const mat = (c: number) => new THREE.MeshPhongMaterial({ color: c, flatShading: true });

    const yellow   = 0xf0b030; // golden yellow-orange
    const spots    = 0x7a3808; // dark reddish-brown patches
    const spotMat  = (sx: number, sy: number, sz: number) =>
      new THREE.MeshPhongMaterial({ color: spots, flatShading: true,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

    // polygonOffset spot helper — outer face sits exactly at body surface, no protrusion
    const addSpot = (x: number, y: number, z: number, sx: number, sy: number, sz: number): void => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(sx*zoom, sy*zoom, sz*zoom), spotMat(sx,sy,sz));
      s.position.set(x*zoom, y*zoom, z*zoom);
      giraffe.add(s);
    };

    // ── Body: 22×12×12, center z=17, bottom=11, top=23 ──────────────────────
    const body = new THREE.Mesh(new THREE.BoxGeometry(22*zoom, 12*zoom, 12*zoom), mat(yellow));
    body.position.z = 17*zoom;
    body.castShadow = body.receiveShadow = true;
    giraffe.add(body);

    // TOP (z=22.7)
    ([ [-10,  1, 8, 7], [  3,  3, 6, 5],
       [ -2, -5, 4, 4], [  8, -2, 5, 3], [-6,  5, 3, 4],
       [ 10,  2, 3, 3], [-11, -4, 2, 3], [  5,  6, 2, 2],
       [ 11, -4, 3, 2], [  0, -1, 2, 3],
    ] as [number,number,number,number][]).forEach(([x,y,sw,sd]) => addSpot(x, y, 22.7, sw, sd, 0.6));

    // SIDES (y=±6.2)
    ([ [-8, 17, 7, 5], [ 3, 20, 6, 4],
       [-1, 22, 4, 3], [ 9, 15, 3, 4],
       [-10,14, 4, 3], [11, 19, 2, 3],
       [-4, 14, 3, 2], [ 6, 22, 2, 2],
    ] as [number,number,number,number][]).forEach(([x,z,sw,sz]) => {
      addSpot(x,  5.7, z, sw, 0.6, sz);
      addSpot(x, -5.7, z, sw, 0.6, sz);
    });

    // BACK (x=−12.7)
    ([ [ 0, 20, 6, 4], [ 4, 14, 3, 3], [-4, 14, 3, 3],
       [ 2, 12, 2, 2], [-2, 11, 2, 2],
    ] as [number,number,number,number][]).forEach(([y,z,sd,sz]) => addSpot(-10.7, y, z, 0.6, sd, sz));

    // FRONT (x=+12.7)
    ([ [ 0, 20, 6, 4], [ 4, 15, 3, 3], [-4, 15, 3, 3],
       [ 0, 13, 2, 2], [ 3, 22, 2, 2], [-3, 22, 2, 2],
    ] as [number,number,number,number][]).forEach(([y,z,sd,sz]) => addSpot(10.7, y, z, 0.6, sd, sz));

    // ── Tail: pivot group at connection point (x=−13.5, z=20.5) for wagging animation
    this.tailGroup = new THREE.Group();
    this.tailGroup.position.set(-13.5*zoom, 0, 20.5*zoom);
    const tailRope = new THREE.Mesh(new THREE.BoxGeometry(2*zoom, 2*zoom, 9*zoom), mat(yellow));
    tailRope.position.set(0, 0, -4.5*zoom); // center offset from pivot
    const tailTuft = new THREE.Mesh(new THREE.BoxGeometry(3*zoom, 3.5*zoom, 4*zoom), mat(spots));
    tailTuft.position.set(0, 0, -11.5*zoom); // tuft offset from pivot
    this.tailGroup.add(tailRope, tailTuft);
    giraffe.add(this.tailGroup);

    // ── Neck: slimmer (4×4) and taller (32), bottom=23 top=55 ─────────────────
    const neck = new THREE.Mesh(new THREE.BoxGeometry(4*zoom, 4*zoom, 32*zoom), mat(yellow));
    neck.position.set(7*zoom, 0, 39*zoom);
    neck.castShadow = true;
    giraffe.add(neck);

    // Neck SIDES (Y outer face at ±2, center ±1.8, sy=0.4) — 6 alternating spots
    const nSide: [number,number,number,number][] = [[27,4,3,1],[33,3,3,-1],[38,3,4,1],[44,4,3,-1],[49,3,3,1],[53,4,3,-1]];
    nSide.forEach(([z,sw,sz,side]) => addSpot(7, side*1.8, z, sw, 0.4, sz));
    // Neck FRONT (X outer face at 9, center 8.8)
    const nFront: [number,number,number,number][] = [[0,27,3,4],[1,34,2,3],[-1,41,3,3],[0,48,3,3],[1,53,2,3]];
    nFront.forEach(([y,z,sy,sz]) => addSpot(8.8, y, z, 0.4, sy, sz));
    // Neck BACK (X outer face at 5, center 5.2)
    const nBack: [number,number,number,number][] = [[0,30,4,3],[-1,37,3,4],[1,44,3,3],[0,51,4,3],[-1,54,2,3]];
    nBack.forEach(([y,z,sy,sz]) => addSpot(5.2, y, z, 0.4, sy, sz));

    // ── Head: 9×8×7, center z=58.5, bottom=55, top=62 ────────────────────────
    const head = new THREE.Mesh(new THREE.BoxGeometry(9*zoom, 8*zoom, 7*zoom), mat(yellow));
    head.position.set(7*zoom, 0, 58.5*zoom);
    head.castShadow = true;
    giraffe.add(head);

    // Muzzle — slightly darker, protrudes +X
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(4*zoom, 5*zoom, 3*zoom), mat(0xd89020));
    muzzle.position.set(12.5*zoom, 0, 57*zoom);
    giraffe.add(muzzle);

    // Ears — behind the eyes (x=5 vs eye x=7), at eye height (z=58), sticking out to sides (y=±7)
    // Head x: 2.5–11.5, z: 55–62. Ears embedded in head at back half, flush with head face at y=±4
    const earOuter = 0x6e3d10; // dark chocolate brown
    const earInner = 0xff8850; // vivid warm pink
    const makeEar = (sign: number) => {
      const outer = new THREE.Mesh(new THREE.BoxGeometry(2.5*zoom, 2.5*zoom, 3*zoom), mat(earOuter));
      outer.position.set(5*zoom, sign * 5.5*zoom, 59*zoom);
      giraffe.add(outer);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(1*zoom, 1.5*zoom, 1.8*zoom), mat(earInner));
      inner.position.set(5.5*zoom, sign * 5.5*zoom, 59*zoom);
      giraffe.add(inner);
    };
    makeEar( 1);
    makeEar(-1);

    // Ossicones — center z=64 → z=61.5–66.5, base sits on head top (z=62)
    const ossiMesh = new THREE.Mesh(new THREE.BoxGeometry(2*zoom, 2*zoom, 5*zoom), mat(spots));
    const ossiL = ossiMesh.clone(); ossiL.position.set(6*zoom,  3*zoom, 64*zoom); giraffe.add(ossiL);
    const ossiR = ossiMesh.clone(); ossiR.position.set(6*zoom, -3*zoom, 64*zoom); giraffe.add(ossiR);

    // Eyes — on Y-side faces of head, center at z=58.5
    const makeEyeGroup = (ySign: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(7*zoom, ySign * 4.5*zoom, 58.5*zoom);
      const sclera = new THREE.Mesh(new THREE.BoxGeometry(4*zoom, 0.8*zoom, 4*zoom), mat(0xffffff));
      g.add(sclera);
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(1.8*zoom, 1.2*zoom, 1.8*zoom), mat(0x0a0808));
      pupil.position.set(1.5*zoom, ySign * 0.2*zoom, -0.8*zoom);
      g.add(pupil);
      return g;
    };
    this.blinkGroupL = makeEyeGroup( 1);
    this.blinkGroupR = makeEyeGroup(-1);
    giraffe.add(this.blinkGroupL, this.blinkGroupR);

    // ── Legs: slimmer (3.5×3.5), longer (18), wider stance ───────────────────
    // Pivot at z=18 → legs hang from z=18 down to z=0
    const spotMatLeg = new THREE.MeshPhongMaterial({
      color: spots, flatShading: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const makeLeg = (x: number, y: number): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 18*zoom);
      const legMesh = new THREE.Mesh(new THREE.BoxGeometry(3.5*zoom, 3.5*zoom, 18*zoom), mat(yellow));
      legMesh.position.z = -9*zoom;
      legMesh.castShadow = true;
      pivot.add(legMesh);
      // Irregular spots — different z-heights and sizes on each side
      ([ [ 0.7,  1, -3.0, 2.0], [-0.5,  1, -7.5, 1.5],
         [ 0.3,  1,-12.0, 2.2], [ 0.0,  1,-16.0, 1.5],
         [-0.5, -1, -4.5, 1.8], [ 0.6, -1, -9.0, 2.0],
         [-0.2, -1,-13.5, 1.5], [ 0.3, -1,-17.0, 1.6],
      ] as [number,number,number,number][]).forEach(([dx, side, sz, sd]) => {
        const s = new THREE.Mesh(new THREE.BoxGeometry(sd*zoom, 0.5*zoom, sd*zoom), spotMatLeg);
        s.position.set(dx*zoom, side * 1.55*zoom, sz*zoom);
        pivot.add(s);
      });
      return pivot;
    };
    this.legFL = makeLeg( 9*zoom,  5*zoom);
    this.legFR = makeLeg( 9*zoom, -5*zoom);
    this.legBL = makeLeg(-8*zoom,  5*zoom);
    this.legBR = makeLeg(-8*zoom, -5*zoom);
    giraffe.add(this.legFL, this.legFR, this.legBL, this.legBR);

    giraffe.rotation.z = Math.PI / 2;
    return giraffe;
  }

  private updateFacing(dir: Direction): void {
    const angles: Record<Direction, number> = {
      forward:  Math.PI / 2,
      backward: -Math.PI / 2,
      right:    0,
      left:     Math.PI,
    };
    this.chicken.rotation.z = angles[dir];
  }

  private updateBlink(dt: number): void {
    const INTERVAL = 3200; // ms between blinks
    const HALF_DUR = 80;   // ms for each half (close / open)
    if (this.blinkOpen) {
      this.blinkTimer += dt;
      if (this.blinkTimer >= INTERVAL) {
        this.blinkOpen = false;
        this.blinkTimer = 0;
        this.blinkProgress = 0;
      }
    } else {
      this.blinkProgress += dt;
      let s: number;
      if (this.blinkProgress < HALF_DUR) {
        s = 1 - this.blinkProgress / HALF_DUR;
      } else if (this.blinkProgress < HALF_DUR * 2) {
        s = (this.blinkProgress - HALF_DUR) / HALF_DUR;
      } else {
        s = 1;
        this.blinkOpen = true;
        this.blinkTimer = 0;
      }
      this.blinkGroupL.scale.z = Math.max(s, 0.05);
      this.blinkGroupR.scale.z = Math.max(s, 0.05);
    }
  }

  private makeRoad(): THREE.Group {
    const { zoom, positionWidth, columns } = this;
    const boardWidth = positionWidth * columns;
    const road = new THREE.Group();
    const section = (color: number) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(boardWidth * zoom, positionWidth * zoom),
        new THREE.MeshPhongMaterial({ color }),
      );
      return m;
    };
    // Asphalt road
    const mid = section(0x686868); mid.receiveShadow = true; road.add(mid);
    const left = section(0x585858); left.position.x = -boardWidth * zoom; road.add(left);
    const right = section(0x585858); right.position.x = boardWidth * zoom; road.add(right);

    // Center dashed line — white boxes above road surface
    const dashLen = 10;
    const dashGap = 12;
    const dashTotal = dashLen + dashGap;
    const dashCount = Math.ceil(boardWidth / dashTotal) + 1;
    const dashMat = new THREE.MeshPhongMaterial({ color: 0xeeeeee, flatShading: true });
    for (let i = 0; i < dashCount; i++) {
      const x = i * dashTotal * zoom - boardWidth * zoom / 2;
      const dash = new THREE.Mesh(new THREE.BoxGeometry(dashLen*zoom, 1.5*zoom, 0.4*zoom), dashMat);
      dash.position.set(x, 0, 0.3*zoom);
      road.add(dash);
    }
    return road;
  }

  private makeGrass(): THREE.Group {
    const { zoom, positionWidth, columns } = this;
    const boardWidth = positionWidth * columns;
    const grass = new THREE.Group();
    const section = (color: number) => new THREE.Mesh(
      new THREE.BoxGeometry(boardWidth * zoom, positionWidth * zoom, 3 * zoom),
      new THREE.MeshPhongMaterial({ color }),
    );
    // Jungle floor — vivid greens
    const mid = section(0x3aaa38); mid.receiveShadow = true; grass.add(mid);
    const left = section(0x2a8a28); left.position.x = -boardWidth * zoom; grass.add(left);
    const right = section(0x2a8a28); right.position.x = boardWidth * zoom; grass.add(right);
    grass.position.z = 1.5 * zoom;
    return grass;
  }

  private makeRiver(): THREE.Group {
    const { zoom, positionWidth, columns } = this;
    const boardWidth = positionWidth * columns;
    const river = new THREE.Group();

    // Water base — 3 panels (flat, at z=0)
    const waterMat = new THREE.MeshPhongMaterial({ color: 0x1a8fd8, flatShading: true });
    for (const dx of [-boardWidth * zoom, 0, boardWidth * zoom]) {
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(boardWidth * zoom, positionWidth * zoom), waterMat,
      );
      water.position.x = dx;
      water.receiveShadow = true;
      river.add(water);
    }

    return river;
  }

  private makeLog(length: number): THREE.Group {
    const { zoom } = this;
    const log = new THREE.Group();
    const barkMat = new THREE.MeshPhongMaterial({ color: 0x7a4520, flatShading: true });
    const woodMat = new THREE.MeshPhongMaterial({ color: 0xb06830, flatShading: true });
    const knotMat = new THREE.MeshPhongMaterial({ color: 0x5a3010, flatShading: true });

    // Main cylindrical body (voxel box)
    const body = new THREE.Mesh(new THREE.BoxGeometry(length * zoom, 14 * zoom, 10 * zoom), barkMat);
    body.position.z = 5 * zoom;
    body.castShadow = body.receiveShadow = true;
    log.add(body);

    // Light wood end caps
    const capGeo = new THREE.BoxGeometry(5 * zoom, 14 * zoom, 10 * zoom);
    const capL = new THREE.Mesh(capGeo, woodMat);
    capL.position.set((-length / 2 + 2.5) * zoom, 0, 5 * zoom);
    const capR = new THREE.Mesh(capGeo, woodMat);
    capR.position.set((length / 2 - 2.5) * zoom, 0, 5 * zoom);
    log.add(capL, capR);

    // Bark knots on top surface
    const knotPositions = [0.25, 0.7].map(t => (t - 0.5) * length);
    knotPositions.forEach(kx => {
      const knot = new THREE.Mesh(new THREE.BoxGeometry(7 * zoom, 7 * zoom, 2.5 * zoom), knotMat);
      knot.position.set(kx * zoom, (Math.random() - 0.5) * 4 * zoom, 10.5 * zoom);
      log.add(knot);
    });

    return log;
  }

  private resetTrain(lane: LaneData): void {
    lane.vechicles![0].position.x = -10000;
    lane.trainTimer = lane.trainInterval!;
    if (lane.signalMats) lane.signalMats.forEach(m => { m.color.setHex(0x330000); });
  }

  private makeRail(): THREE.Group {
    const { zoom, positionWidth, columns } = this;
    const boardWidth = positionWidth * columns;
    const totalW = boardWidth * 3 * zoom; // all 3 base panels combined
    const rail = new THREE.Group();

    // Gravel base — 3 panels
    const baseMat = new THREE.MeshPhongMaterial({ color: 0x706050, flatShading: true });
    for (const dx of [-boardWidth * zoom, 0, boardWidth * zoom]) {
      const base = new THREE.Mesh(
        new THREE.PlaneGeometry(boardWidth * zoom, positionWidth * zoom), baseMat,
      );
      base.position.x = dx;
      base.receiveShadow = true;
      rail.add(base);
    }

    // Railroad sleepers — span all 3 panels
    const tieSpacing = 12;
    const tieCount = Math.ceil(boardWidth * 3 / tieSpacing) + 2;
    const tieMat = new THREE.MeshPhongMaterial({ color: 0x4a3020, flatShading: true });
    for (let i = 0; i < tieCount; i++) {
      const x = i * tieSpacing * zoom - totalW / 2;
      const tie = new THREE.Mesh(new THREE.BoxGeometry(6*zoom, positionWidth * zoom, 3*zoom), tieMat);
      tie.position.set(x, 0, 1.5*zoom);
      rail.add(tie);
    }

    // Steel rails — span all 3 panels plus margin
    const railLen = totalW + 40 * zoom;
    const rMat = new THREE.MeshPhongMaterial({ color: 0x909090, flatShading: true });
    const rl = new THREE.Mesh(new THREE.BoxGeometry(railLen, 3*zoom, 3*zoom), rMat);
    rl.position.set(0,  9*zoom, 3*zoom); rail.add(rl);
    const rr = rl.clone(); rr.position.set(0, -9*zoom, 3*zoom); rail.add(rr);

    return rail;
  }

  private makeTrain(): THREE.Group {
    // High-speed train — silver body, navy stripe, yellow accent (≈233*zoom span)
    const { zoom } = this;
    const g = new THREE.Group();
    const ph = (c: number) => new THREE.MeshPhongMaterial({ color: c, flatShading: true });
    const pho = (c: number) => new THREE.MeshPhongMaterial({ color: c, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

    const silver = 0xe4e4e4;
    const navy   = 0x1a2e72;
    const accent = 0xf0c030;
    const glass  = 0x90c8f0;
    const roofC  = 0x606060;
    const dark   = 0x1a1a1a;

    // Underframe
    const frame = new THREE.Mesh(new THREE.BoxGeometry(240*zoom, 26*zoom, 4*zoom), ph(dark));
    frame.position.set(-5*zoom, 0, 3*zoom);
    g.add(frame);

    // ── Locomotive — aerodynamic nose ──────────────────────────────
    // Lower nose wedge
    const noseL = new THREE.Mesh(new THREE.BoxGeometry(18*zoom, 22*zoom, 18*zoom), ph(navy));
    noseL.position.set(-98*zoom, 0, 11*zoom);
    noseL.castShadow = true;
    g.add(noseL);
    // Upper nose (smaller, stepped)
    const noseU = new THREE.Mesh(new THREE.BoxGeometry(14*zoom, 18*zoom, 12*zoom), ph(navy));
    noseU.position.set(-100*zoom, 0, 28*zoom);
    g.add(noseU);
    // Windshield
    const fws = new THREE.Mesh(new THREE.BoxGeometry(5*zoom, 14*zoom, 12*zoom), ph(glass));
    fws.position.set(-92*zoom, 0, 28*zoom);
    g.add(fws);
    // Headlights
    [-1, 1].forEach(s => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(5*zoom, 5*zoom, 4*zoom), ph(0xffffaa));
      hl.position.set(-90*zoom, s*8*zoom, 12*zoom);
      g.add(hl);
    });
    // Main loco body
    const loco = new THREE.Mesh(new THREE.BoxGeometry(38*zoom, 26*zoom, 30*zoom), ph(silver));
    loco.position.set(-68*zoom, 0, 19*zoom);
    loco.castShadow = true;
    g.add(loco);
    // Loco roof
    const locoRoof = new THREE.Mesh(new THREE.BoxGeometry(56*zoom, 24*zoom, 5*zoom), ph(roofC));
    locoRoof.position.set(-78*zoom, 0, 36*zoom);
    g.add(locoRoof);
    // Pantograph on loco roof
    const pantoBase = new THREE.Mesh(new THREE.BoxGeometry(8*zoom, 18*zoom, 2*zoom), ph(dark));
    pantoBase.position.set(-70*zoom, 0, 41*zoom);
    g.add(pantoBase);
    const pantoArm = new THREE.Mesh(new THREE.BoxGeometry(2*zoom, 20*zoom, 2*zoom), ph(dark));
    pantoArm.position.set(-70*zoom, 0, 44*zoom);
    g.add(pantoArm);
    // Navy + accent stripe on loco sides
    [-1, 1].forEach(s => {
      const ns = new THREE.Mesh(new THREE.BoxGeometry(56*zoom, 2*zoom, 11*zoom), pho(navy));
      ns.position.set(-78*zoom, s*14*zoom, 23*zoom);
      g.add(ns);
      const as = new THREE.Mesh(new THREE.BoxGeometry(56*zoom, 2*zoom, 2*zoom), pho(accent));
      as.position.set(-78*zoom, s*14*zoom, 16*zoom);
      g.add(as);
    });

    // ── Passenger car factory ───────────────────────────────────────
    const makeCar = (cx: number) => {
      const car = new THREE.Mesh(new THREE.BoxGeometry(68*zoom, 26*zoom, 30*zoom), ph(silver));
      car.position.set(cx*zoom, 0, 19*zoom);
      car.castShadow = true;
      g.add(car);
      // Roof
      const cr = new THREE.Mesh(new THREE.BoxGeometry(68*zoom, 24*zoom, 5*zoom), ph(roofC));
      cr.position.set(cx*zoom, 0, 36*zoom);
      g.add(cr);
      // Navy stripe + yellow accent
      [-1, 1].forEach(s => {
        const ns = new THREE.Mesh(new THREE.BoxGeometry(62*zoom, 2*zoom, 11*zoom), pho(navy));
        ns.position.set(cx*zoom, s*14*zoom, 23*zoom);
        g.add(ns);
        const as = new THREE.Mesh(new THREE.BoxGeometry(62*zoom, 2*zoom, 2*zoom), pho(accent));
        as.position.set(cx*zoom, s*14*zoom, 16*zoom);
        g.add(as);
        // Individual windows (5 per side)
        [-24, -12, 0, 12, 24].forEach(dx => {
          const w = new THREE.Mesh(new THREE.BoxGeometry(8*zoom, 2*zoom, 7*zoom), pho(glass));
          w.position.set((cx+dx)*zoom, s*14*zoom, 27*zoom);
          g.add(w);
        });
        // Door marker at each end
        [-28, 28].forEach(dx => {
          const d = new THREE.Mesh(new THREE.BoxGeometry(4*zoom, 2*zoom, 11*zoom), pho(0x888888));
          d.position.set((cx+dx)*zoom, s*14*zoom, 23*zoom);
          g.add(d);
        });
      });
    };
    makeCar(16);
    makeCar(92);

    // ── Couplers ────────────────────────────────────────────────────
    const cMat = ph(0x444444);
    [-47, 51, 127].forEach(x => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(8*zoom, 8*zoom, 8*zoom), cMat);
      c.position.set(x*zoom, 0, 10*zoom);
      g.add(c);
    });

    // ── Bogies (wheel trucks) ────────────────────────────────────────
    const wMat = ph(dark);
    [-88, -62, -18, 8, 52, 78].forEach(x => {
      const bogie = new THREE.Mesh(new THREE.BoxGeometry(16*zoom, 28*zoom, 5*zoom), wMat);
      bogie.position.set(x*zoom, 0, 4*zoom);
      g.add(bogie);
      [-1, 1].forEach(s => {
        const w = new THREE.Mesh(new THREE.BoxGeometry(5*zoom, 30*zoom, 8*zoom), wMat);
        w.position.set((x + s*5)*zoom, 0, 5*zoom);
        g.add(w);
      });
    });

    return g;
    // Span: nose tip ≈ -107*zoom, car2 rear ≈ +126*zoom → ~233*zoom total
  }

  private makeSignal(): { group: THREE.Group; mats: THREE.MeshBasicMaterial[] } {
    const { zoom, positionWidth } = this;
    // Place posts inside the rail lane edge — keeps them out of adjacent forest lanes
    const sideY = positionWidth * zoom / 2 - 6*zoom;
    const group = new THREE.Group();
    const mats: THREE.MeshBasicMaterial[] = [];

    const makePost = (y: number) => {
      const p = new THREE.Group();
      // Position at a visible X along the board and just outside the lane in Y
      p.position.set(0, y, 0);

      // Red/white striped pole (alternating 6 sections)
      const stripeH = 6*zoom;
      [0xee2222, 0xffffff, 0xee2222, 0xffffff, 0xee2222, 0xffffff].forEach((color, i) => {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(3*zoom, 3*zoom, stripeH),
          new THREE.MeshPhongMaterial({ color, flatShading: true }),
        );
        stripe.position.z = (i + 0.5) * stripeH;
        p.add(stripe);
      });
      // pole top = 36*zoom

      // Black square sign on top of pole
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(18*zoom, 5*zoom, 14*zoom),
        new THREE.MeshPhongMaterial({ color: 0x111111, flatShading: true }),
      );
      sign.position.set(0, 0, 43*zoom);
      p.add(sign);

      // Two flashing red lights on the sign face
      [-5*zoom, 5*zoom].forEach(dy => {
        const lMat = new THREE.MeshBasicMaterial({ color: 0x330000 });
        const light = new THREE.Mesh(new THREE.BoxGeometry(5*zoom, 1.5*zoom, 5*zoom), lMat);
        light.position.set(0, dy, 43*zoom);
        p.add(light);
        mats.push(lMat);
      });

      return p;
    };

    group.add(makePost( sideY));
    group.add(makePost(-sideY));

    return { group, mats };
  }

  // ─── Controls ────────────────────────────────────────────────────────────

  private bindControls(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.code === 'ArrowUp'    || e.code === 'KeyW') this.move('forward');
      else if (e.code === 'ArrowDown'  || e.code === 'KeyS') this.move('backward');
      else if (e.code === 'ArrowLeft'  || e.code === 'KeyA') this.move('left');
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.move('right');
    });

    let touchStartX = 0, touchStartY = 0;
    document.addEventListener('touchstart', (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) { this.move('forward'); return; }
      if (Math.abs(dx) > Math.abs(dy)) this.move(dx > 0 ? 'right' : 'left');
      else this.move(dy < 0 ? 'forward' : 'backward');
    }, { passive: true });

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.left   = window.innerWidth  / -2;
      this.camera.right  = window.innerWidth  /  2;
      this.camera.top    = window.innerHeight /  2;
      this.camera.bottom = window.innerHeight / -2;
      this.camera.updateProjectionMatrix();
    });
  }
}
