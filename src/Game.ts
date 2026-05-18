import { sdk } from '@smoud/playable-sdk';
import * as THREE from 'three';

type Player = 'X' | 'O';
type CellValue = Player | null;
type Result = Player | 'DRAW';
type AnimationStep = (time: number) => boolean;

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock();
  private readonly root: HTMLDivElement;
  private readonly canvasContainer: HTMLDivElement;
  private readonly turnIndicator: HTMLDivElement;
  private readonly scoreP1: HTMLSpanElement;
  private readonly scoreCPU: HTMLSpanElement;
  private readonly statusMessage: HTMLDivElement;
  private readonly endScreen: HTMLDivElement;
  private readonly resultText: HTMLDivElement;
  private readonly boardGroup = new THREE.Group();
  private readonly cityGroup = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly baseCameraPos = new THREE.Vector3(0, 6, 6);
  private readonly cells: Array<THREE.Mesh<THREE.BoxGeometry, THREE.Material | THREE.Material[]>> = [];
  private readonly marks: THREE.Object3D[] = [];
  private readonly animations: AnimationStep[] = [];

  private readonly matBoard = new THREE.MeshLambertMaterial({
    color: 0x1a1a24,
    emissive: 0x050510,
  });
  private readonly matBoardHover = new THREE.MeshLambertMaterial({
    color: 0x2a2a3a,
    emissive: 0x1a0a2a,
  });
  private readonly matX = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  private readonly matO = new THREE.MeshBasicMaterial({ color: 0x00ffff });
  private readonly matGhost = new THREE.MeshBasicMaterial({
    color: 0xff00ff,
    transparent: true,
    opacity: 0.2,
    wireframe: true,
  });

  private board: CellValue[] = Array(9).fill(null);
  private turn: Player = 'X';
  private isGameOver = false;
  private p1Score = 0;
  private cpuScore = 0;
  private hoveredIndex = -1;
  private ghostMark: THREE.Group;
  private particlesMesh: THREE.Points;
  private screenShake = 0;
  private isPaused = false;
  private pendingCpuAt = 0;
  private pendingEndScreenAt = 0;
  private autoEndAt = 0;
  private finishSent = false;
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    const ui = this.createUI();
    this.root = ui.root;
    this.canvasContainer = ui.canvasContainer;
    this.turnIndicator = ui.turnIndicator;
    this.scoreP1 = ui.scoreP1;
    this.scoreCPU = ui.scoreCPU;
    this.statusMessage = ui.statusMessage;
    this.endScreen = ui.endScreen;
    this.resultText = ui.resultText;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvasContainer.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    this.camera.position.copy(this.baseCameraPos);
    this.camera.lookAt(0, 0, 0);

    this.scene.background = new THREE.Color(0x0a0a0f);
    this.scene.fog = new THREE.FogExp2(0x0a0a0f, 0.04);
    this.scene.add(this.boardGroup);
    this.scene.add(this.cityGroup);

    this.createLights();
    this.createBoard();
    this.createCity();

    this.ghostMark = this.createXMesh(this.matGhost);
    this.ghostMark.visible = false;
    this.scene.add(this.ghostMark);

    this.particlesMesh = this.createWindowLights();
    this.scene.add(this.particlesMesh);

    this.bindInput();
    this.resize(width, height);
    this.updateUI();
    this.autoEndAt = performance.now() + 15000;

    this.animate();
    sdk.start();
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.root.style.width = `${width}px`;
    this.root.style.height = `${height}px`;

    const aspect = width / Math.max(height, 1);
    const internalWidth = 426;
    this.renderer.setSize(internalWidth, internalWidth / aspect, false);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    this.isPaused = false;
    this.clock.getDelta();
  }

  public volume(value: number): void {
    console.log(`Volume changed to: ${value}`);
  }

  public finish(): void {
    this.showEndScreen();
  }

  private createUI(): {
    root: HTMLDivElement;
    canvasContainer: HTMLDivElement;
    turnIndicator: HTMLDivElement;
    scoreP1: HTMLSpanElement;
    scoreCPU: HTMLSpanElement;
    statusMessage: HTMLDivElement;
    endScreen: HTMLDivElement;
    resultText: HTMLDivElement;
  } {
    const root = document.createElement('div');
    root.id = 'playable-root';

    const crt = document.createElement('div');
    crt.className = 'crt-overlay';
    root.appendChild(crt);

    const noise = document.createElement('div');
    noise.className = 'noise';
    root.appendChild(noise);

    const canvasContainer = document.createElement('div');
    canvasContainer.id = 'canvas-container';
    root.appendChild(canvasContainer);

    const p1 = this.createHudPanel('top-left', 'PLAYER 1');
    const p1Value = document.createElement('div');
    p1Value.className = 'hud-value magenta-glow';
    p1Value.append('[ X ] : ');
    const scoreP1 = document.createElement('span');
    scoreP1.textContent = '0';
    p1Value.appendChild(scoreP1);
    p1.appendChild(p1Value);
    root.appendChild(p1);

    const turn = this.createHudPanel('top-center', 'TURN');
    const turnIndicator = document.createElement('div');
    turnIndicator.id = 'turn-indicator';
    turnIndicator.className = 'hud-value';
    turn.appendChild(turnIndicator);
    root.appendChild(turn);

    const cpu = this.createHudPanel('top-right', 'CPU');
    const cpuValue = document.createElement('div');
    cpuValue.className = 'hud-value cyan-glow';
    const scoreCPU = document.createElement('span');
    scoreCPU.textContent = '0';
    cpuValue.appendChild(scoreCPU);
    cpuValue.append(' : [ O ]');
    cpu.appendChild(cpuValue);
    root.appendChild(cpu);

    const status = this.createHudPanel('bottom-center', 'SYS_MSG');
    const statusMessage = document.createElement('div');
    statusMessage.className = 'hud-value hud-status';
    statusMessage.textContent = 'AWAITING INPUT...';
    status.appendChild(statusMessage);
    root.appendChild(status);

    const endScreen = document.createElement('div');
    endScreen.id = 'end-screen';

    const icon = document.createElement('div');
    icon.className = 'app-icon';
    icon.textContent = 'XO';
    endScreen.appendChild(icon);

    const resultText = document.createElement('div');
    resultText.id = 'result-text';
    resultText.className = 'magenta-glow';
    resultText.textContent = 'YOU WIN';
    endScreen.appendChild(resultText);

    const ctaContainer = document.createElement('div');
    ctaContainer.className = 'cta-container';

    const playAgain = document.createElement('button');
    playAgain.className = 'btn-play';
    playAgain.type = 'button';
    playAgain.textContent = 'PLAY AGAIN';
    playAgain.addEventListener('pointerdown', () => this.resetGame());
    ctaContainer.appendChild(playAgain);

    const install = document.createElement('button');
    install.className = 'btn-install';
    install.type = 'button';
    install.textContent = 'INSTALL NOW';
    install.addEventListener('pointerdown', () => this.handleInstallClick());
    ctaContainer.appendChild(install);

    endScreen.appendChild(ctaContainer);
    root.appendChild(endScreen);
    document.body.appendChild(root);

    return { root, canvasContainer, turnIndicator, scoreP1, scoreCPU, statusMessage, endScreen, resultText };
  }

  private createHudPanel(positionClass: string, title: string): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = `hud ${positionClass} hud-panel`;

    const label = document.createElement('div');
    label.className = 'hud-title';
    label.textContent = title;
    panel.appendChild(label);

    return panel;
  }

  private createLights(): void {
    const ambientLight = new THREE.AmbientLight(0x222233, 2);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x5555aa, 2);
    dirLight.position.set(5, 10, 5);
    this.scene.add(dirLight);

    const magentaLight = new THREE.PointLight(0xff00ff, 50, 15);
    magentaLight.position.set(-5, 2, 0);
    this.scene.add(magentaLight);

    const cyanLight = new THREE.PointLight(0x00ffff, 50, 15);
    cyanLight.position.set(5, 2, 0);
    this.scene.add(cyanLight);
  }

  private createBoard(): void {
    const cellSize = 1.4;
    const cellGap = 0.15;
    const offset = cellSize + cellGap;
    const cellGeo = new THREE.BoxGeometry(cellSize, 0.2, cellSize);

    for (let i = 0; i < 9; i += 1) {
      const x = (i % 3) - 1;
      const z = Math.floor(i / 3) - 1;
      const cell = new THREE.Mesh(cellGeo, this.matBoard);
      cell.position.set(x * offset, 0, z * offset);
      cell.userData = { index: i };

      const edges = new THREE.EdgesGeometry(cellGeo);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({
          color: 0x333344,
          transparent: true,
          opacity: 0.5,
        }),
      );
      cell.add(line);

      this.boardGroup.add(cell);
      this.cells.push(cell);
    }

    const basePlateGeo = new THREE.BoxGeometry(offset * 3 + 0.5, 0.5, offset * 3 + 0.5);
    const basePlateMat = new THREE.MeshLambertMaterial({
      color: 0x0a0a0f,
      emissive: 0x050505,
    });
    const basePlate = new THREE.Mesh(basePlateGeo, basePlateMat);
    basePlate.position.y = -0.4;
    this.boardGroup.add(basePlate);
  }

  private createCity(): void {
    const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
    const buildingMat = new THREE.MeshLambertMaterial({ color: 0x05050a });
    const cityCount = 150;
    const cityMesh = new THREE.InstancedMesh(buildingGeo, buildingMat, cityCount);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < cityCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 10 + Math.random() * 20;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const height = 2 + Math.random() * 15;

      dummy.position.set(x, height / 2 - 2, z);
      dummy.scale.set(1 + Math.random() * 2, height, 1 + Math.random() * 2);
      dummy.rotation.y = Math.random() * Math.PI;
      dummy.updateMatrix();
      cityMesh.setMatrixAt(i, dummy.matrix);
    }

    this.cityGroup.add(cityMesh);
  }

  private createWindowLights(): THREE.Points {
    const particlesGeo = new THREE.BufferGeometry();
    const particlesCount = 200;
    const posArray = new Float32Array(particlesCount * 3);
    const colorsArray = new Float32Array(particlesCount * 3);

    for (let i = 0; i < particlesCount * 3; i += 3) {
      posArray[i] = (Math.random() - 0.5) * 40;
      posArray[i + 1] = Math.random() * 10;
      posArray[i + 2] = (Math.random() - 0.5) * 40;

      if (Math.random() > 0.5) {
        colorsArray[i] = 1;
        colorsArray[i + 1] = 0;
        colorsArray[i + 2] = 1;
      } else {
        colorsArray[i] = 0;
        colorsArray[i + 1] = 1;
        colorsArray[i + 2] = 1;
      }
    }

    particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    particlesGeo.setAttribute('color', new THREE.BufferAttribute(colorsArray, 3));

    return new THREE.Points(
      particlesGeo,
      new THREE.PointsMaterial({
        size: 0.1,
        vertexColors: true,
      }),
    );
  }

  private createXMesh(material: THREE.Material): THREE.Group {
    const group = new THREE.Group();
    const barGeo = new THREE.BoxGeometry(1.2, 0.2, 0.3);
    const bar1 = new THREE.Mesh(barGeo, material);
    bar1.rotation.y = Math.PI / 4;
    const bar2 = new THREE.Mesh(barGeo, material);
    bar2.rotation.y = -Math.PI / 4;
    group.add(bar1);
    group.add(bar2);
    return group;
  }

  private createOMesh(material: THREE.Material): THREE.Mesh {
    const geo = new THREE.TorusGeometry(0.45, 0.15, 8, 12);
    const mesh = new THREE.Mesh(geo, material);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  private bindInput(): void {
    this.canvasContainer.addEventListener('pointermove', (event) => this.handlePointerMove(event));
    this.canvasContainer.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.canvasContainer.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.isGameOver || this.turn === 'O') {
      this.ghostMark.visible = false;
      this.resetHover();
      return;
    }

    this.updatePointer(event);
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.cells, false);

    this.resetHover();
    this.ghostMark.visible = false;

    if (intersects.length === 0) return;

    const object = intersects[0].object as THREE.Mesh<THREE.BoxGeometry, THREE.Material | THREE.Material[]>;
    const index = object.userData.index as number | undefined;

    if (index !== undefined && this.board[index] === null) {
      this.hoveredIndex = index;
      object.material = this.matBoardHover;

      const worldPos = new THREE.Vector3();
      object.getWorldPosition(worldPos);
      this.ghostMark.position.copy(worldPos);
      this.ghostMark.position.y += 0.5;
      this.ghostMark.visible = true;
    }
  }

  private resetHover(): void {
    if (this.hoveredIndex !== -1) {
      this.cells[this.hoveredIndex].material = this.matBoard;
      this.hoveredIndex = -1;
    }
  }

  private handlePointerDown(event: PointerEvent): void {
    if (this.isGameOver || this.turn === 'O') return;

    this.updatePointer(event);
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.cells, false);

    if (intersects.length === 0) return;

    const object = intersects[0].object as THREE.Mesh<THREE.BoxGeometry, THREE.Material | THREE.Material[]>;
    const index = object.userData.index as number | undefined;

    if (index !== undefined && this.board[index] === null) {
      this.autoEndAt = 0;
      this.placeMark(index, 'X');
    }
  }

  private animateScale(object: THREE.Object3D, targetScale: number, duration: number, elastic = false): void {
    const startTime = performance.now();
    const startScale = object.scale.x;

    this.animations.push((time: number) => {
      let progress = (time - startTime) / duration;
      if (progress >= 1) progress = 1;

      let ease = progress;
      if (elastic) {
        const c4 = (2 * Math.PI) / 3;
        ease = progress === 1 ? 1 : Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * c4) + 1;
      } else {
        ease = 1 - Math.pow(1 - progress, 3);
      }

      const scale = startScale + (targetScale - startScale) * ease;
      object.scale.set(scale, scale, scale);

      return progress < 1;
    });
  }

  private placeMark(index: number, player: Player): void {
    this.board[index] = player;
    this.ghostMark.visible = false;
    this.resetHover();

    const mesh = player === 'X' ? this.createXMesh(this.matX) : this.createOMesh(this.matO);
    const cell = this.cells[index];
    const worldPos = new THREE.Vector3();
    cell.getWorldPosition(worldPos);

    mesh.position.copy(worldPos);
    mesh.position.y += 0.3;
    mesh.scale.set(0, 0, 0);

    this.scene.add(mesh);
    this.marks.push(mesh);
    this.animateScale(mesh, 1, 600, true);
    this.screenShake = player === 'X' ? 0.2 : 0.14;

    if (this.checkWinResult()) return;

    this.turn = player === 'X' ? 'O' : 'X';
    this.updateUI();

    if (this.turn === 'O') {
      this.pendingCpuAt = performance.now() + 800 + Math.random() * 500;
    }
  }

  private cpuMove(): void {
    if (this.isGameOver) return;

    let move = this.findWinningMove('O');
    if (move === -1) move = this.findWinningMove('X');
    if (move === -1 && this.board[4] === null) move = 4;

    if (move === -1) {
      const corners = [0, 2, 6, 8].filter((index) => this.board[index] === null);
      if (corners.length > 0) move = corners[Math.floor(Math.random() * corners.length)];
    }

    if (move === -1) {
      const edges = [1, 3, 5, 7].filter((index) => this.board[index] === null);
      if (edges.length > 0) move = edges[Math.floor(Math.random() * edges.length)];
    }

    if (move !== -1) this.placeMark(move, 'O');
  }

  private findWinningMove(player: Player): number {
    for (let i = 0; i < WIN_LINES.length; i += 1) {
      const [a, b, c] = WIN_LINES[i];
      if (this.board[a] === player && this.board[b] === player && this.board[c] === null) return c;
      if (this.board[a] === player && this.board[c] === player && this.board[b] === null) return b;
      if (this.board[b] === player && this.board[c] === player && this.board[a] === null) return a;
    }
    return -1;
  }

  private checkWinResult(): boolean {
    let winner: Result | null = null;
    let winningLine: number[] | null = null;

    for (let i = 0; i < WIN_LINES.length; i += 1) {
      const [a, b, c] = WIN_LINES[i];
      if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
        winner = this.board[a] as Player;
        winningLine = WIN_LINES[i];
        break;
      }
    }

    if (winner) {
      this.endGame(winner, winningLine);
      return true;
    }

    if (!this.board.includes(null)) {
      this.endGame('DRAW', null);
      return true;
    }

    return false;
  }

  private endGame(result: Result, winningLine: number[] | null): void {
    this.isGameOver = true;
    this.pendingCpuAt = 0;
    this.ghostMark.visible = false;

    if (result === 'X') {
      this.p1Score += 1;
      this.scoreP1.textContent = String(this.p1Score);
      this.resultText.textContent = 'SYSTEM SECURED';
      this.resultText.className = 'magenta-glow';
    } else if (result === 'O') {
      this.cpuScore += 1;
      this.scoreCPU.textContent = String(this.cpuScore);
      this.resultText.textContent = 'SYSTEM BREACHED';
      this.resultText.className = 'cyan-glow';
    } else {
      this.resultText.textContent = 'STALEMATE';
      this.resultText.className = 'neutral-glow';
    }

    if (winningLine) {
      winningLine.forEach((index) => {
        this.cells[index].material = new THREE.MeshLambertMaterial({
          color: result === 'X' ? 0xff00ff : 0x00ffff,
          emissive: result === 'X' ? 0xaa00aa : 0x00aaaa,
        });
      });
      this.screenShake = 0.5;
    }

    this.statusMessage.textContent = 'OPENING DOWNLOAD PROTOCOL...';
    this.pendingEndScreenAt = performance.now() + 1200;
  }

  private resetGame(): void {
    this.endScreen.classList.remove('visible');
    this.board = Array(9).fill(null);
    this.isGameOver = false;
    this.turn = 'X';
    this.pendingCpuAt = 0;
    this.pendingEndScreenAt = 0;
    this.autoEndAt = performance.now() + 15000;
    this.finishSent = false;

    this.marks.forEach((mesh) => this.scene.remove(mesh));
    this.marks.length = 0;
    this.cells.forEach((cell) => {
      cell.material = this.matBoard;
    });

    this.updateUI();
    this.screenShake = 0.3;
  }

  private handleInstallClick(): void {
    this.resultText.textContent = 'LOADING PROTOCOL...';
    this.resultText.className = 'cyan-glow';
    try {
      sdk.install();
    } catch (error) {
      console.log('Install call failed', error);
    }
  }

  private showEndScreen(): void {
    this.endScreen.classList.add('visible');
    if (!this.finishSent) {
      this.finishSent = true;
      try {
        sdk.finish();
      } catch (error) {
        console.log('Finish call failed', error);
      }
    }
  }

  private updateUI(): void {
    if (this.turn === 'X') {
      this.turnIndicator.textContent = 'P1 [X]';
      this.turnIndicator.className = 'hud-value magenta-glow';
      this.statusMessage.textContent = 'AWAITING INPUT...';
    } else {
      this.turnIndicator.textContent = 'CPU [O]';
      this.turnIndicator.className = 'hud-value cyan-glow';
      this.statusMessage.textContent = 'CPU THINKING...';
    }
  }

  private updateTimers(time: number): void {
    if (this.pendingCpuAt > 0 && time >= this.pendingCpuAt) {
      this.pendingCpuAt = 0;
      this.cpuMove();
    }

    if (this.pendingEndScreenAt > 0 && time >= this.pendingEndScreenAt) {
      this.pendingEndScreenAt = 0;
      this.showEndScreen();
    }

    if (!this.isGameOver && this.autoEndAt > 0 && time >= this.autoEndAt) {
      this.resultText.textContent = 'TAKE THE GRID';
      this.resultText.className = 'magenta-glow';
      this.statusMessage.textContent = 'DOWNLOAD PROTOCOL READY...';
      this.isGameOver = true;
      this.showEndScreen();
    }
  }

  private update(time: number): void {
    this.updateTimers(time);

    for (let i = this.animations.length - 1; i >= 0; i -= 1) {
      const keepAlive = this.animations[i](time);
      if (!keepAlive) this.animations.splice(i, 1);
    }

    this.boardGroup.position.y = Math.sin(time * 0.002) * 0.1;
    this.boardGroup.rotation.x = Math.sin(time * 0.001) * 0.02;
    this.boardGroup.rotation.z = Math.cos(time * 0.0013) * 0.02;

    const camWobbleX = Math.sin(time * 0.0005) * 0.2;
    const camWobbleY = Math.cos(time * 0.0004) * 0.2;
    let shakeX = 0;
    let shakeY = 0;

    if (this.screenShake > 0) {
      shakeX = (Math.random() - 0.5) * this.screenShake;
      shakeY = (Math.random() - 0.5) * this.screenShake;
      this.screenShake *= 0.9;
      if (this.screenShake < 0.01) this.screenShake = 0;
    }

    this.camera.position.x = this.baseCameraPos.x + camWobbleX + shakeX;
    this.camera.position.y = this.baseCameraPos.y + camWobbleY + shakeY;
    this.camera.position.z = this.baseCameraPos.z + shakeX;
    this.camera.lookAt(0, 0, 0);

    if (this.ghostMark.visible) {
      this.ghostMark.scale.setScalar(1 + Math.sin(time * 0.01) * 0.05);
    }

    this.particlesMesh.rotation.y = time * 0.00005;
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate());
    if (!this.isPaused) {
      const time = performance.now();
      this.clock.getDelta();
      this.update(time);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
