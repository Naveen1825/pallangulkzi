import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

window.__PALLANGUZHI_STARTED = true;

const MODEL_URL = "./pallakulzhi.glb";
const ICO_URL = "./icosahedron.glb";
const SEEDS_PER_PIT = 5;
const SEED_RADIUS = 0.048;
const PIT_CONTAINMENT_RADIUS = 0.21;
const PHYSICS_SUBSTEPS = 8;
const GRAVITY = 20.0;
const THENNAI_SURFACE_Y = 7.991;
const STORAGE_KEY = "pallanguzhi_camera_views_v1";

const FRIENDLY_NAMES = {
  box_1: "Pallanguzhi Board — Far Row",
  box_2: "Pallanguzhi Board — Near Row",
  "piller 1": "Veranda Pillar 1 (Carved Wood)",
  "piller 2": "Veranda Pillar 2 (Carved Wood)",
  "piller 3": "Veranda Pillar 3 (Carved Wood)",
  "piller 4": "Veranda Pillar 4 (Carved Wood)",
  roof: "Terracotta Tiled Roof",
  walls: "House Walls & Thinnai Veranda",
  scene: "Courtyard Ground",
};

// ============================================================================
// TWO GAME CAMERA ANGLES (Three.js Y-up coordinates)
//   pos    = where the camera sits [x, y, z]
//   target = where the camera looks [x, y, z]
// ============================================================================
const DEFAULT_CAMERA_VIEWS = {
  veranda: {
    pos: [-25.0, 16.0, 12.0],
    target: [-1.5, 11.5, -5.0],
  },
  board: {
    pos: [-6.6, 13.4, -13.0],
    target: [-1.82, 8.2, -15.2],
  },
};

function loadSavedCameraViews() {
  const views = {
    veranda: {
      pos: new THREE.Vector3(...DEFAULT_CAMERA_VIEWS.veranda.pos),
      target: new THREE.Vector3(...DEFAULT_CAMERA_VIEWS.veranda.target),
    },
    board: {
      pos: new THREE.Vector3(...DEFAULT_CAMERA_VIEWS.board.pos),
      target: new THREE.Vector3(...DEFAULT_CAMERA_VIEWS.board.target),
    },
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return views;
    const parsed = JSON.parse(raw);
    for (const key of ["veranda", "board"]) {
      if (parsed[key]?.pos?.length === 3 && parsed[key]?.target?.length === 3) {
        views[key].pos.set(...parsed[key].pos);
        views[key].target.set(...parsed[key].target);
      }
    }
  } catch {
    // Ignore storage errors
  }
  return views;
}

const CAMERA_VIEWS = loadSavedCameraViews();

// ============================================================================
// 14 PALLANGUZHI PITS IN COUNTER-CLOCKWISE RING ORDER (indices 0..13)
//   0..6  -> box_2 (Near Row, Player 1): left-to-right (x: -3.98 -> +0.34)
//   7..13 -> box_1 (Far Row,  CPU / P2): right-to-left (x: +0.34 -> -3.98)
// ============================================================================
const HOLE_RIM_Y = 8.438;
const HOLE_HOVER_RADIUS = 0.31;
const BOARD_HOLES = [
  // Player 1 row (box_2, near)
  { idx: 0, owner: 0, label: "Player 1 · Pit 1", x: -3.9821, z: -14.6965 },
  { idx: 1, owner: 0, label: "Player 1 · Pit 2", x: -3.2606, z: -14.697 },
  { idx: 2, owner: 0, label: "Player 1 · Pit 3", x: -2.545, z: -14.6963 },
  { idx: 3, owner: 0, label: "Player 1 · Pit 4", x: -1.8224, z: -14.6953 },
  { idx: 4, owner: 0, label: "Player 1 · Pit 5", x: -1.1034, z: -14.6969 },
  { idx: 5, owner: 0, label: "Player 1 · Pit 6", x: -0.3807, z: -14.6957 },
  { idx: 6, owner: 0, label: "Player 1 · Pit 7", x: 0.3418, z: -14.6973 },
  // Player 2 / CPU row (box_1, far)
  { idx: 7, owner: 1, label: "Far Row · Pit 7", x: 0.3393, z: -15.7041 },
  { idx: 8, owner: 1, label: "Far Row · Pit 6", x: -0.3805, z: -15.705 },
  { idx: 9, owner: 1, label: "Far Row · Pit 5", x: -1.1031, z: -15.7062 },
  { idx: 10, owner: 1, label: "Far Row · Pit 4", x: -1.821, z: -15.703 },
  { idx: 11, owner: 1, label: "Far Row · Pit 3", x: -2.5431, z: -15.7062 },
  { idx: 12, owner: 1, label: "Far Row · Pit 2", x: -3.2603, z: -15.7036 },
  { idx: 13, owner: 1, label: "Far Row · Pit 1", x: -3.9821, z: -15.7045 },
];

const CAPTURE_ZONES = [
  { x: -1.82, z: -13.75, y: THENNAI_SURFACE_Y }, // Player 1 tray (near thinnai)
  { x: -1.82, z: -16.65, y: THENNAI_SURFACE_Y }, // Player 2 / CPU tray (far thinnai)
];

const LIGHTING_MOODS = {
  golden: {
    bg: 0xd9b38c,
    fog: 0xd9b38c,
    sunColor: 0xffcf8b,
    sunIntensity: 3.1,
    sunPos: new THREE.Vector3(-55, 42, 32),
    hemiSky: 0xffe4c4,
    hemiGround: 0x4d3423,
    hemiIntensity: 1.15,
    boardFill: 1.6,
    exposure: 1.12,
  },
  noon: {
    bg: 0xbcd8ee,
    fog: 0xbcd8ee,
    sunColor: 0xfff8ec,
    sunIntensity: 3.4,
    sunPos: new THREE.Vector3(-35, 75, 25),
    hemiSky: 0xdff0ff,
    hemiGround: 0x5c4632,
    hemiIntensity: 1.35,
    boardFill: 1.1,
    exposure: 1.08,
  },
  evening: {
    bg: 0x1c2135,
    fog: 0x1c2135,
    sunColor: 0x6f88c9,
    sunIntensity: 1.1,
    sunPos: new THREE.Vector3(-50, 45, -35),
    hemiSky: 0x425280,
    hemiGround: 0x221710,
    hemiIntensity: 0.75,
    boardFill: 4.5,
    exposure: 1.25,
  },
};

// DOM Elements
const container = document.getElementById("canvas-container");
const loaderOverlay = document.getElementById("loader");
const loaderStatus = document.getElementById("loader-status");
const progressFill = document.getElementById("progress-fill");
const progressPct = document.getElementById("progress-pct");
const errorBanner = document.getElementById("error-banner");
const errorMessage = document.getElementById("error-message");
const fileInput = document.getElementById("file-input");

const menuOverlay = document.getElementById("menu-overlay");
const playHudTop = document.getElementById("play-hud-top");
const playHudBottom = document.getElementById("play-hud-bottom");
const selectionPill = document.getElementById("selection-pill");
const selectionLabel = document.getElementById("selection-label");
const infoPanel = document.getElementById("info-panel");
const camTuner = document.getElementById("cam-tuner");
const camReadout = document.getElementById("cam-readout");
const tunerStatus = document.getElementById("tuner-status");

const pitBadgesContainer = document.getElementById("pit-badges");
const p1Card = document.getElementById("p1-card");
const p2Card = document.getElementById("p2-card");
const p1ScoreEl = document.getElementById("p1-score");
const p2ScoreEl = document.getElementById("p2-score");
const p2NameEl = document.getElementById("p2-name");
const turnStatusEl = document.getElementById("turn-status");
const gameoverModal = document.getElementById("gameover-modal");
const gameoverTitle = document.getElementById("gameover-title");
const gameoverSummary = document.getElementById("gameover-summary");

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = LIGHTING_MOODS.golden.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Scene & Camera (starts in Thinnai Veranda Menu View)
const scene = new THREE.Scene();
scene.background = new THREE.Color(LIGHTING_MOODS.golden.bg);
scene.fog = new THREE.FogExp2(LIGHTING_MOODS.golden.fog, 0.0022);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.65;

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.2, 600);
camera.position.copy(CAMERA_VIEWS.veranda.pos);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(CAMERA_VIEWS.veranda.target);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.0;
controls.maxDistance = 190.0;
controls.maxPolarAngle = Math.PI * 0.495;
controls.update();

// Lights
const hemiLight = new THREE.HemisphereLight(
  LIGHTING_MOODS.golden.hemiSky,
  LIGHTING_MOODS.golden.hemiGround,
  LIGHTING_MOODS.golden.hemiIntensity
);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(
  LIGHTING_MOODS.golden.sunColor,
  LIGHTING_MOODS.golden.sunIntensity
);
sunLight.position.copy(LIGHTING_MOODS.golden.sunPos);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 5;
sunLight.shadow.camera.far = 180;
sunLight.shadow.camera.left = -55;
sunLight.shadow.camera.right = 55;
sunLight.shadow.camera.top = 55;
sunLight.shadow.camera.bottom = -55;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

const boardFillLight = new THREE.PointLight(0xffbe73, LIGHTING_MOODS.golden.boardFill, 32, 1.4);
boardFillLight.position.set(-4.5, 13.0, -14.5);
scene.add(boardFillLight);

// White circle highlight shown when hovering a Pallanguzhi hole in Play mode
const holeHighlightGroup = new THREE.Group();
holeHighlightGroup.visible = false;

const holeRingMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.96,
  depthWrite: false,
});
const holeRingMesh = new THREE.Mesh(new THREE.RingGeometry(0.255, 0.308, 48), holeRingMat);
holeRingMesh.rotation.x = -Math.PI / 2;

const holeGlowMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.14,
  depthWrite: false,
});
const holeGlowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.255, 48), holeGlowMat);
holeGlowDisc.rotation.x = -Math.PI / 2;

holeHighlightGroup.add(holeRingMesh, holeGlowDisc);
scene.add(holeHighlightGroup);

// Container for icosahedron seeds
const seedsGroup = new THREE.Group();
scene.add(seedsGroup);

// ============================================================================
// ARTICULATED 3D HAND FOR PICKUP & SOW ANIMATION
// ============================================================================
function createArticulatedHand() {
  const root = new THREE.Group();
  root.visible = false;

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd1946b,
    roughness: 0.56,
    metalness: 0.02,
  });
  const cuffMat = new THREE.MeshStandardMaterial({
    color: 0xb8764f,
    roughness: 0.65,
    metalness: 0.02,
  });

  // Pivot oriented so +Y is up, fingers extend along -Z (toward the board pits), wrist extends along +Z
  const wristPivot = new THREE.Group();
  root.add(wristPivot);

  // Forearm / wrist
  const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.48, 8, 14), cuffMat);
  forearm.rotation.x = Math.PI / 2;
  forearm.position.set(0, 0.04, 0.48);
  forearm.castShadow = true;
  wristPivot.add(forearm);

  // Sculpted palm
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.34), skinMat);
  palm.position.set(0, 0, 0.06);
  palm.castShadow = true;
  wristPivot.add(palm);

  // Smooth palm edge rounding
  const palmPad = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 12), skinMat);
  palmPad.scale.set(1.05, 0.36, 1.05);
  palmPad.position.set(0, -0.01, 0.05);
  palmPad.castShadow = true;
  wristPivot.add(palmPad);

  // Anchor inside the cupped palm where picked-up icosahedra sit
  const palmAnchor = new THREE.Group();
  palmAnchor.position.set(0, -0.11, -0.06);
  wristPivot.add(palmAnchor);

  const fingers = [];
  const fingerSpecs = [
    { name: "index", x: -0.115, z: -0.11, len: [0.13, 0.10, 0.08], r: 0.032 },
    { name: "middle", x: -0.038, z: -0.12, len: [0.145, 0.11, 0.085], r: 0.033 },
    { name: "ring", x: 0.038, z: -0.115, len: [0.135, 0.10, 0.08], r: 0.031 },
    { name: "pinky", x: 0.112, z: -0.095, len: [0.105, 0.08, 0.065], r: 0.027 },
  ];

  for (const spec of fingerSpecs) {
    const knuckle = new THREE.Group();
    knuckle.position.set(spec.x, 0.01, spec.z);
    wristPivot.add(knuckle);

    const seg1 = new THREE.Mesh(new THREE.CapsuleGeometry(spec.r, spec.len[0], 6, 10), skinMat);
    seg1.rotation.x = Math.PI / 2;
    seg1.position.z = -spec.len[0] * 0.55;
    seg1.castShadow = true;
    knuckle.add(seg1);

    const midJoint = new THREE.Group();
    midJoint.position.z = -spec.len[0] * 1.1;
    knuckle.add(midJoint);

    const seg2 = new THREE.Mesh(new THREE.CapsuleGeometry(spec.r * 0.9, spec.len[1], 6, 10), skinMat);
    seg2.rotation.x = Math.PI / 2;
    seg2.position.z = -spec.len[1] * 0.55;
    seg2.castShadow = true;
    midJoint.add(seg2);

    const tipJoint = new THREE.Group();
    tipJoint.position.z = -spec.len[1] * 1.1;
    midJoint.add(tipJoint);

    const seg3 = new THREE.Mesh(new THREE.CapsuleGeometry(spec.r * 0.82, spec.len[2], 6, 10), skinMat);
    seg3.rotation.x = Math.PI / 2;
    seg3.position.z = -spec.len[2] * 0.55;
    seg3.castShadow = true;
    tipJoint.add(seg3);

    fingers.push({ knuckle, midJoint, tipJoint });
  }

  // Opposable thumb on the left (-X) side
  const thumbBase = new THREE.Group();
  thumbBase.position.set(-0.16, -0.01, 0.06);
  thumbBase.rotation.y = 0.65;
  wristPivot.add(thumbBase);

  const thumbSeg1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.11, 6, 10), skinMat);
  thumbSeg1.rotation.x = Math.PI / 2;
  thumbSeg1.position.z = -0.065;
  thumbSeg1.castShadow = true;
  thumbBase.add(thumbSeg1);

  const thumbTip = new THREE.Group();
  thumbTip.position.z = -0.13;
  thumbBase.add(thumbTip);

  const thumbSeg2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.031, 0.09, 6, 10), skinMat);
  thumbSeg2.rotation.x = Math.PI / 2;
  thumbSeg2.position.z = -0.055;
  thumbSeg2.castShadow = true;
  thumbTip.add(thumbSeg2);

  function setPose(curl, tiltX) {
    // Curl 0 = open flat, 1 = cupped/closed
    const c = THREE.MathUtils.clamp(curl, 0, 1);
    wristPivot.rotation.x = tiltX;
    fingers.forEach((f, idx) => {
      const spread = (idx - 1.5) * 0.06 * (1 - c);
      f.knuckle.rotation.y = -spread;
      f.knuckle.rotation.x = -c * 0.95;
      f.midJoint.rotation.x = -c * 1.05;
      f.tipJoint.rotation.x = -c * 0.75;
    });
    thumbBase.rotation.x = -c * 0.55;
    thumbBase.rotation.z = -c * 0.45;
    thumbTip.rotation.x = -c * 0.75;
  }

  return { root, wristPivot, palmAnchor, setPose };
}

const handRig = createArticulatedHand();
scene.add(handRig.root);

// Hand tween controller
let activeHandTween = null;
const handState = {
  pos: new THREE.Vector3(-1.82, 9.6, -13.6),
  yaw: 0,
  curl: 0.2,
  tiltX: -0.25,
};

function moveHandTo({ pos, yaw = handState.yaw, curl = handState.curl, tiltX = handState.tiltX, duration = 260, arcHeight = 0 }) {
  return new Promise((resolve) => {
    handRig.root.visible = true;
    activeHandTween = {
      startPos: handState.pos.clone(),
      endPos: pos.clone(),
      startYaw: handState.yaw,
      endYaw: yaw,
      startCurl: handState.curl,
      endCurl: curl,
      startTilt: handState.tiltX,
      endTilt: tiltX,
      arcHeight,
      elapsed: 0,
      duration: Math.max(1, duration) / 1000,
      resolve,
    };
  });
}

function stepHandTween(dt) {
  if (!activeHandTween) return;
  const tw = activeHandTween;
  tw.elapsed = Math.min(tw.duration, tw.elapsed + dt);
  const raw = tw.elapsed / tw.duration;
  const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;

  handState.pos.lerpVectors(tw.startPos, tw.endPos, t);
  if (tw.arcHeight > 0) {
    handState.pos.y += Math.sin(raw * Math.PI) * tw.arcHeight;
  }
  handState.yaw = THREE.MathUtils.lerp(tw.startYaw, tw.endYaw, t);
  handState.curl = THREE.MathUtils.lerp(tw.startCurl, tw.endCurl, t);
  handState.tiltX = THREE.MathUtils.lerp(tw.startTilt, tw.endTilt, t);

  handRig.root.position.copy(handState.pos);
  handRig.root.rotation.y = handState.yaw;
  handRig.setPose(handState.curl, handState.tiltX);

  if (tw.elapsed >= tw.duration) {
    const done = tw.resolve;
    activeHandTween = null;
    done();
  }
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// GAME STATE & PIT BADGES
// ============================================================================
let loadedRoot = null;
let icoTemplate = null;
let boardColliderGrid = null;
let activeSeeds = [];
let pitSeeds = Array.from({ length: 14 }, () => []);
let capturedSeeds = [[], []];
let scores = [0, 0];
let currentPlayer = 0; // 0 = Player 1 (near), 1 = CPU/Player 2 (far)
let vsCpu = true;
let isAnimatingMove = false;
let gameOver = false;
let gameEpoch = 0;
let pendingDrop = false;
let hoveredHole = null;
let showPitCounts = true;
let gameMode = "menu"; // "menu" | "playing"
let isolateBoard = false;
let wireframeMode = false;
let cameraAnim = null;

// Create 14 projected pit count badges
const pitBadgeEls = BOARD_HOLES.map(() => {
  const el = document.createElement("div");
  el.className = "pit-badge";
  el.textContent = "0";
  pitBadgesContainer.appendChild(el);
  return el;
});

function updateScoreAndTurnHUD(statusOverride = null) {
  p1ScoreEl.textContent = String(scores[0]);
  p2ScoreEl.textContent = String(scores[1]);
  p2NameEl.textContent = vsCpu ? "CPU" : "Player 2";
  p1Card.classList.toggle("active-turn", currentPlayer === 0 && !gameOver);
  p2Card.classList.toggle("active-turn", currentPlayer === 1 && !gameOver);

  if (statusOverride) {
    turnStatusEl.textContent = statusOverride;
  } else if (gameOver) {
    turnStatusEl.textContent = "Round complete!";
  } else if (currentPlayer === 0) {
    turnStatusEl.textContent = "Player 1's turn — click a pit on the near row";
  } else {
    turnStatusEl.textContent = vsCpu ? "CPU is thinking…" : "Player 2's turn — click a pit on the far row";
  }

  for (let i = 0; i < 14; i++) {
    const count = pitSeeds[i].length;
    const el = pitBadgeEls[i];
    el.textContent = String(count);
    el.classList.toggle("empty", count === 0);
    el.classList.toggle(
      "playable",
      !isAnimatingMove && !gameOver && BOARD_HOLES[i].owner === currentPlayer && count > 0 && !(vsCpu && currentPlayer === 1)
    );
  }
}

const _projVec = new THREE.Vector3();
function updatePitBadgePositions() {
  const visible = gameMode === "playing" && showPitCounts;
  pitBadgesContainer.classList.toggle("hidden", !visible);
  if (!visible) return;

  const w = window.innerWidth;
  const h = window.innerHeight;
  for (let i = 0; i < BOARD_HOLES.length; i++) {
    const hole = BOARD_HOLES[i];
    _projVec.set(hole.x, HOLE_RIM_Y + 0.14, hole.z).project(camera);
    const el = pitBadgeEls[i];
    if (_projVec.z > 1) {
      el.style.display = "none";
    } else {
      el.style.display = "inline-flex";
      el.style.left = `${(_projVec.x * 0.5 + 0.5) * w}px`;
      el.style.top = `${(-_projVec.y * 0.5 + 0.5) * h}px`;
    }
  }
}

function applyLightingMood(moodKey) {
  const m = LIGHTING_MOODS[moodKey];
  if (!m) return;
  scene.background.setHex(m.bg);
  scene.fog.color.setHex(m.fog);
  sunLight.color.setHex(m.sunColor);
  sunLight.intensity = m.sunIntensity;
  sunLight.position.copy(m.sunPos);
  hemiLight.color.setHex(m.hemiSky);
  hemiLight.groundColor.setHex(m.hemiGround);
  hemiLight.intensity = m.hemiIntensity;
  boardFillLight.intensity = m.boardFill;
  renderer.toneMappingExposure = m.exposure;

  document.querySelectorAll(".mood-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mood === moodKey);
  });
}

function setOpponentMode(mode) {
  vsCpu = mode === "cpu";
  document.querySelectorAll(".mode-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });
  updateScoreAndTurnHUD();
  if (gameMode === "playing" && !isAnimatingMove && !gameOver && vsCpu && currentPlayer === 1) {
    scheduleCpuTurn(gameEpoch);
  }
}

function animateCameraTo(viewKey) {
  const v = CAMERA_VIEWS[viewKey];
  if (!v) return;
  cameraAnim = {
    startPos: camera.position.clone(),
    endPos: v.pos.clone(),
    startTarget: controls.target.clone(),
    endTarget: v.target.clone(),
    progress: 0,
  };
}

function enterPlayingView() {
  gameMode = "playing";
  menuOverlay.classList.add("menu-hidden");
  playHudTop.classList.remove("hidden");
  playHudBottom.classList.remove("hidden");
  infoPanel.classList.add("hidden");
  animateCameraTo("board");
  startNewGame();
}

function enterMenuView() {
  gameEpoch++;
  activeHandTween = null;
  handRig.root.visible = false;
  isAnimatingMove = false;
  gameMode = "menu";
  if (isolateBoard) {
    setIsolateBoard(false);
  }
  clearHoleHover();
  clearSeeds();
  gameoverModal.classList.add("hidden");
  selectionPill.classList.add("hidden");
  playHudTop.classList.add("hidden");
  playHudBottom.classList.add("hidden");
  pitBadgesContainer.classList.add("hidden");
  menuOverlay.classList.remove("menu-hidden");
  animateCameraTo("veranda");
}

function isBoardMesh(obj) {
  let curr = obj;
  while (curr) {
    if (curr.name === "box_1" || curr.name === "box_2") return true;
    curr = curr.parent;
  }
  return false;
}

function setIsolateBoard(enabled) {
  isolateBoard = enabled;
  document.getElementById("btn-board-only").classList.toggle("active", isolateBoard);
  if (loadedRoot) {
    loadedRoot.traverse((child) => {
      if (child.isMesh) {
        child.visible = isolateBoard ? isBoardMesh(child) : true;
      }
    });
  }
}

function getFriendlyName(obj) {
  let curr = obj;
  while (curr) {
    if (FRIENDLY_NAMES[curr.name]) return FRIENDLY_NAMES[curr.name];
    curr = curr.parent;
  }
  return obj.name || "3D Object";
}

function setupLoadedScene(gltf) {
  if (loadedRoot) {
    scene.remove(loadedRoot);
  }
  loadedRoot = gltf.scene;

  loadedRoot.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = child.name !== "scene";
      child.receiveShadow = true;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        if (!mat) return;
        mat.side = THREE.DoubleSide;
        mat.wireframe = wireframeMode;
      });
    }
  });

  scene.add(loadedRoot);
  loadedRoot.updateMatrixWorld(true);
  boardColliderGrid = buildBoardColliderGrid(loadedRoot);
  loaderOverlay.classList.add("fade-out");
  errorBanner.classList.add("hidden");
}

// ============================================================================
// 3D MESH COLLIDER & SEED PHYSICS
// ============================================================================
function buildBoardColliderGrid(root) {
  const cellSize = 0.32;
  const cells = new Map();
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();

  function addTriangle(a, b, c) {
    const tri = {
      a: a.clone(),
      b: b.clone(),
      c: c.clone(),
      minX: Math.min(a.x, b.x, c.x),
      maxX: Math.max(a.x, b.x, c.x),
      minY: Math.min(a.y, b.y, c.y),
      maxY: Math.max(a.y, b.y, c.y),
      minZ: Math.min(a.z, b.z, c.z),
      maxZ: Math.max(a.z, b.z, c.z),
    };
    const gx0 = Math.floor((tri.minX - SEED_RADIUS) / cellSize);
    const gx1 = Math.floor((tri.maxX + SEED_RADIUS) / cellSize);
    const gz0 = Math.floor((tri.minZ - SEED_RADIUS) / cellSize);
    const gz1 = Math.floor((tri.maxZ + SEED_RADIUS) / cellSize);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const key = `${gx},${gz}`;
        let bucket = cells.get(key);
        if (!bucket) {
          bucket = [];
          cells.set(key, bucket);
        }
        bucket.push(tri);
      }
    }
  }

  root.traverse((child) => {
    if (!child.isMesh || !isBoardMesh(child)) return;
    const geom = child.geometry;
    const posAttr = geom.attributes.position;
    if (!posAttr) return;
    const idx = geom.index;
    const mw = child.matrixWorld;

    if (idx) {
      for (let i = 0; i < idx.count; i += 3) {
        vA.fromBufferAttribute(posAttr, idx.getX(i)).applyMatrix4(mw);
        vB.fromBufferAttribute(posAttr, idx.getX(i + 1)).applyMatrix4(mw);
        vC.fromBufferAttribute(posAttr, idx.getX(i + 2)).applyMatrix4(mw);
        addTriangle(vA, vB, vC);
      }
    } else {
      for (let i = 0; i < posAttr.count; i += 3) {
        vA.fromBufferAttribute(posAttr, i).applyMatrix4(mw);
        vB.fromBufferAttribute(posAttr, i + 1).applyMatrix4(mw);
        vC.fromBufferAttribute(posAttr, i + 2).applyMatrix4(mw);
        addTriangle(vA, vB, vC);
      }
    }
  });

  return { cellSize, cells };
}

const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _ap = new THREE.Vector3();
const _bp = new THREE.Vector3();
const _cp = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _vt = new THREE.Vector3();
const _spinAxis = new THREE.Vector3();

function closestPointOnTriangle(p, a, b, c, out) {
  _ab.subVectors(b, a);
  _ac.subVectors(c, a);
  _ap.subVectors(p, a);

  const d1 = _ab.dot(_ap);
  const d2 = _ac.dot(_ap);
  if (d1 <= 0 && d2 <= 0) return out.copy(a);

  _bp.subVectors(p, b);
  const d3 = _ab.dot(_bp);
  const d4 = _ac.dot(_bp);
  if (d3 >= 0 && d4 <= d3) return out.copy(b);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return out.copy(a).addScaledVector(_ab, v);
  }

  _cp.subVectors(p, c);
  const d5 = _ab.dot(_cp);
  const d6 = _ac.dot(_cp);
  if (d6 >= 0 && d5 <= d6) return out.copy(c);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return out.copy(a).addScaledVector(_ac, w);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return out.copy(b).addScaledVector(_ac.subVectors(c, b), w);
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return out.copy(a).addScaledVector(_ab, v).addScaledVector(_ac, w);
}

function stepSeedPhysics(dt) {
  if (activeSeeds.length === 0) return;

  const subDt = dt / PHYSICS_SUBSTEPS;
  const minDist = SEED_RADIUS * 2;
  const minDistSq = minDist * minDist;

  for (let step = 0; step < PHYSICS_SUBSTEPS; step++) {
    // 1. Gravity & integration for free seeds (skip seeds held in hand)
    for (const s of activeSeeds) {
      if (s.inHand) continue;
      if (s.delay > 0) {
        s.delay -= subDt;
        if (s.delay <= 0) {
          s.mesh.visible = true;
        }
        continue;
      }
      if (s.sleeping) continue;

      s.vel.y -= GRAVITY * subDt;
      s.vel.multiplyScalar(1 - 0.12 * subDt);
      s.mesh.position.addScaledVector(s.vel, subDt);

      const angSpeed = s.angVel.length();
      if (angSpeed > 0.001) {
        _spinAxis.copy(s.angVel).divideScalar(angSpeed);
        s.mesh.rotateOnWorldAxis(_spinAxis, angSpeed * subDt);
        s.angVel.multiplyScalar(1 - 1.5 * subDt);
      }
    }

    // 2. Seed-vs-Seed sphere collisions
    for (let i = 0; i < activeSeeds.length; i++) {
      const a = activeSeeds[i];
      if (a.inHand || a.delay > 0) continue;
      for (let j = i + 1; j < activeSeeds.length; j++) {
        const b = activeSeeds[j];
        if (b.inHand || b.delay > 0) continue;
        if (a.sleeping && b.sleeping) continue;

        _normal.subVectors(b.mesh.position, a.mesh.position);
        const dSq = _normal.lengthSq();
        if (dSq >= minDistSq || dSq < 1e-10) continue;

        const d = Math.sqrt(dSq);
        _normal.divideScalar(d);
        const overlap = (minDist - d) * 0.5;

        a.mesh.position.addScaledVector(_normal, -overlap);
        b.mesh.position.addScaledVector(_normal, overlap);
        a.sleeping = false;
        b.sleeping = false;

        _vt.subVectors(b.vel, a.vel);
        const relVn = _vt.dot(_normal);
        if (relVn < 0) {
          const jImp = -(1 + 0.3) * relVn * 0.5;
          a.vel.addScaledVector(_normal, -jImp);
          b.vel.addScaledVector(_normal, jImp);

          _vt.addScaledVector(_normal, -relVn);
          a.vel.addScaledVector(_vt, 0.14);
          b.vel.addScaledVector(_vt, -0.14);
          a.angVel.addScaledVector(_spinAxis.crossVectors(_normal, _vt), 0.35 / SEED_RADIUS);
          b.angVel.addScaledVector(_spinAxis, -0.35 / SEED_RADIUS);
        }
      }
    }

    // 3. Seed-vs-Board mesh (for seeds in pits) or Seed-vs-Thinnai floor (for captured seeds)
    for (const s of activeSeeds) {
      if (s.inHand || s.delay > 0 || s.sleeping) continue;
      const pos = s.mesh.position;

      if (s.captured) {
        const floorY = THENNAI_SURFACE_Y + SEED_RADIUS;
        if (pos.y <= floorY) {
          pos.y = floorY;
          if (s.vel.y < 0) {
            s.vel.y = Math.abs(s.vel.y) > 0.6 ? -s.vel.y * 0.22 : 0;
          }
          s.vel.x *= 0.85;
          s.vel.z *= 0.85;
          s.angVel.multiplyScalar(0.8);
        }
      } else if (boardColliderGrid) {
        const { cellSize, cells } = boardColliderGrid;
        const gx = Math.floor(pos.x / cellSize);
        const gz = Math.floor(pos.z / cellSize);

        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const tris = cells.get(`${gx + dx},${gz + dz}`);
            if (!tris) continue;

            for (const tri of tris) {
              if (
                pos.x + SEED_RADIUS < tri.minX ||
                pos.x - SEED_RADIUS > tri.maxX ||
                pos.y + SEED_RADIUS < tri.minY ||
                pos.y - SEED_RADIUS > tri.maxY ||
                pos.z + SEED_RADIUS < tri.minZ ||
                pos.z - SEED_RADIUS > tri.maxZ
              ) {
                continue;
              }

              closestPointOnTriangle(pos, tri.a, tri.b, tri.c, _closest);
              _normal.subVectors(pos, _closest);
              const distSq = _normal.lengthSq();
              if (distSq >= SEED_RADIUS * SEED_RADIUS || distSq < 1e-12) continue;

              const dist = Math.sqrt(distSq);
              _normal.divideScalar(dist);
              pos.addScaledVector(_normal, SEED_RADIUS - dist);

              const vn = s.vel.dot(_normal);
              if (vn < 0) {
                const restitution = Math.abs(vn) > 0.7 ? 0.2 : 0.0;
                s.vel.addScaledVector(_normal, -(1 + restitution) * vn);
                _vt.copy(s.vel).addScaledVector(_normal, -s.vel.dot(_normal));
                s.vel.addScaledVector(_vt, -0.26);
                s.angVel.crossVectors(_normal, _vt).divideScalar(SEED_RADIUS);
              }
            }
          }
        }

        if (s.pit) {
          const dx = pos.x - s.pit.x;
          const dz = pos.z - s.pit.z;
          const rSq = dx * dx + dz * dz;
          if (rSq > PIT_CONTAINMENT_RADIUS * PIT_CONTAINMENT_RADIUS) {
            const r = Math.sqrt(rSq);
            const nx = dx / r;
            const nz = dz / r;
            pos.x = s.pit.x + nx * PIT_CONTAINMENT_RADIUS;
            pos.z = s.pit.z + nz * PIT_CONTAINMENT_RADIUS;
            const vr = s.vel.x * nx + s.vel.z * nz;
            if (vr > 0) {
              s.vel.x -= 1.25 * vr * nx;
              s.vel.z -= 1.25 * vr * nz;
            }
          }
        }

        if (pos.y < 8.18 + SEED_RADIUS) {
          pos.y = 8.18 + SEED_RADIUS;
          if (s.vel.y < 0) s.vel.y *= -0.15;
        }
      }

      if (s.vel.lengthSq() < 0.0025 && s.angVel.lengthSq() < 0.04) {
        s.sleepTimer += subDt;
        if (s.sleepTimer > 0.35) {
          s.vel.set(0, 0, 0);
          s.angVel.set(0, 0, 0);
          s.sleeping = true;
        }
      } else {
        s.sleepTimer = 0;
      }
    }
  }
}

function showError(htmlMessage) {
  loaderOverlay.classList.add("fade-out");
  errorMessage.innerHTML = htmlMessage;
  errorBanner.classList.remove("hidden");
}

const gltfLoader = new GLTFLoader();

function loadIcosahedronTemplate() {
  gltfLoader.load(
    ICO_URL,
    (gltf) => {
      icoTemplate = gltf.scene;
      icoTemplate.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      if (pendingDrop && gameMode === "playing") {
        pendingDrop = false;
        startNewGame();
      }
    },
    undefined,
    (err) => {
      console.warn("Could not load icosahedron.glb, using fallback geometry:", err);
      const fallback = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.052, 0),
        new THREE.MeshStandardMaterial({ color: 0xf2e0b8, roughness: 0.25, metalness: 0.08 })
      );
      fallback.castShadow = true;
      fallback.receiveShadow = true;
      icoTemplate = fallback;
      if (pendingDrop && gameMode === "playing") {
        pendingDrop = false;
        startNewGame();
      }
    }
  );
}

function clearSeeds() {
  pendingDrop = false;
  activeSeeds = [];
  pitSeeds = Array.from({ length: 14 }, () => []);
  capturedSeeds = [[], []];
  while (seedsGroup.children.length > 0) {
    seedsGroup.remove(seedsGroup.children[0]);
  }
  while (handRig.palmAnchor.children.length > 0) {
    handRig.palmAnchor.remove(handRig.palmAnchor.children[0]);
  }
}

function startNewGame() {
  if (!icoTemplate) {
    pendingDrop = true;
    return;
  }

  gameEpoch++;
  const epoch = gameEpoch;
  activeHandTween = null;
  handRig.root.visible = false;
  clearSeeds();
  scores = [0, 0];
  currentPlayer = 0;
  gameOver = false;
  isAnimatingMove = true;
  gameoverModal.classList.add("hidden");

  BOARD_HOLES.forEach((hole, holeIdx) => {
    const baseAngle = Math.random() * Math.PI * 2;
    for (let i = 0; i < SEEDS_PER_PIT; i++) {
      const seed = icoTemplate.clone(true);
      const angle = baseAngle + (i / SEEDS_PER_PIT) * Math.PI * 2 + (Math.random() - 0.5) * 0.85;
      const r = 0.04 + Math.random() * 0.1;
      const startX = hole.x + Math.cos(angle) * r;
      const startZ = hole.z + Math.sin(angle) * r;
      const startY = 8.82 + i * 0.14 + Math.random() * 0.08;

      seed.position.set(startX, startY, startZ);
      seed.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      seed.visible = false;
      seedsGroup.add(seed);

      const seedObj = {
        mesh: seed,
        pit: hole,
        inHand: false,
        captured: false,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.25, -0.35, (Math.random() - 0.5) * 0.25),
        angVel: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8),
        delay: 0.15 + holeIdx * 0.025 + i * 0.055,
        sleepTimer: 0,
        sleeping: false,
      };
      activeSeeds.push(seedObj);
      pitSeeds[holeIdx].push(seedObj);
    }
  });

  updateScoreAndTurnHUD("Dropping seeds into the pits…");

  setTimeout(() => {
    if (epoch !== gameEpoch || gameMode !== "playing") return;
    isAnimatingMove = false;
    updateScoreAndTurnHUD();
  }, 1350);
}

// ============================================================================
// PICKUP & SOW TURN ANIMATION WITH 3D HAND
// ============================================================================
function attachSeedsToHand(seeds) {
  seeds.forEach((s, idx) => {
    s.inHand = true;
    s.sleeping = false;
    s.delay = 0;
    s.mesh.visible = true;
    seedsGroup.remove(s.mesh);
    handRig.palmAnchor.add(s.mesh);
    const ring = idx === 0 ? 0 : 0.058;
    const ang = (idx / Math.max(1, seeds.length)) * Math.PI * 2;
    const layer = Math.floor(idx / 6) * 0.045;
    s.mesh.position.set(Math.cos(ang) * ring, layer, Math.sin(ang) * ring);
  });
}

function releaseSeedFromHand(seed, targetPit) {
  const worldPos = new THREE.Vector3();
  seed.mesh.getWorldPosition(worldPos);
  handRig.palmAnchor.remove(seed.mesh);
  seedsGroup.add(seed.mesh);
  seed.mesh.position.copy(worldPos);
  seed.inHand = false;
  seed.captured = false;
  seed.pit = targetPit;
  seed.sleeping = false;
  seed.sleepTimer = 0;
  seed.vel.set((Math.random() - 0.5) * 0.16, -0.85, (Math.random() - 0.5) * 0.16);
  seed.angVel.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
}

async function pickupFromPit(pitIdx, yaw, epoch) {
  const hole = BOARD_HOLES[pitIdx];
  await moveHandTo({
    pos: new THREE.Vector3(hole.x, 9.04, hole.z),
    yaw,
    curl: 0.18,
    tiltX: -0.25,
    duration: 240,
    arcHeight: 0.18,
  });
  if (epoch !== gameEpoch) return null;

  await moveHandTo({
    pos: new THREE.Vector3(hole.x, 8.64, hole.z),
    yaw,
    curl: 0.9,
    tiltX: -0.45,
    duration: 180,
  });
  if (epoch !== gameEpoch) return null;

  const picked = pitSeeds[pitIdx].splice(0);
  attachSeedsToHand(picked);
  updateScoreAndTurnHUD(`Picked up ${picked.length} seeds!`);

  await moveHandTo({
    pos: new THREE.Vector3(hole.x, 9.08, hole.z),
    yaw,
    curl: 0.72,
    tiltX: -0.2,
    duration: 150,
  });
  return picked;
}

async function depositCapturedSeeds(seeds, playerIdx, yaw, epoch) {
  const tray = CAPTURE_ZONES[playerIdx];
  const baseIdx = capturedSeeds[playerIdx].length;
  const cols = 6;
  const dropCenter = new THREE.Vector3(tray.x, 8.68, tray.z);

  await moveHandTo({
    pos: dropCenter,
    yaw,
    curl: 0.65,
    tiltX: -0.25,
    duration: 280,
    arcHeight: 0.25,
  });
  if (epoch !== gameEpoch) return;

  await moveHandTo({
    pos: new THREE.Vector3(tray.x, 8.42, tray.z),
    yaw,
    curl: 0.12,
    tiltX: -0.1,
    duration: 140,
  });
  if (epoch !== gameEpoch) return;

  seeds.forEach((s, i) => {
    const slot = baseIdx + i;
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const tx = tray.x + (col - 2.5) * 0.13 + (Math.random() - 0.5) * 0.02;
    const tz = tray.z + (row - 1.0) * 0.13 * (playerIdx === 0 ? 1 : -1) + (Math.random() - 0.5) * 0.02;

    handRig.palmAnchor.remove(s.mesh);
    seedsGroup.add(s.mesh);
    s.mesh.position.set(tx, 8.32 + Math.random() * 0.08, tz);
    s.inHand = false;
    s.captured = true;
    s.pit = null;
    s.sleeping = false;
    s.sleepTimer = 0;
    s.vel.set((Math.random() - 0.5) * 0.2, -0.6, (Math.random() - 0.5) * 0.2);
    capturedSeeds[playerIdx].push(s);
  });

  scores[playerIdx] += seeds.length;
  updateScoreAndTurnHUD(`${playerIdx === 0 ? "Player 1" : vsCpu ? "CPU" : "Player 2"} captured ${seeds.length} seeds!`);
}

async function executeMove(startPitIdx) {
  if (isAnimatingMove || gameOver || gameMode !== "playing") return;
  if (BOARD_HOLES[startPitIdx].owner !== currentPlayer) return;
  if (pitSeeds[startPitIdx].length === 0) return;

  isAnimatingMove = true;
  clearHoleHover();
  const epoch = gameEpoch;
  const player = currentPlayer;
  const yaw = player === 0 ? 0 : Math.PI;
  const playerName = player === 0 ? "Player 1" : vsCpu ? "CPU" : "Player 2";

  // Place hand cleanly at the player's side edge before sweeping in
  const entryZ = player === 0 ? -13.6 : -16.8;
  handState.pos.set(BOARD_HOLES[startPitIdx].x, 9.25, entryZ);
  handState.yaw = yaw;
  handState.curl = 0.2;
  handState.tiltX = -0.2;

  let currPit = startPitIdx;
  let hops = 0;

  while (hops < 25) {
    hops++;
    updateScoreAndTurnHUD(`${playerName} picking up from pit…`);
    const handSeeds = await pickupFromPit(currPit, yaw, epoch);
    if (!handSeeds || epoch !== gameEpoch) return;

    while (handSeeds.length > 0) {
      currPit = (currPit + 1) % 14;
      const hole = BOARD_HOLES[currPit];

      await moveHandTo({
        pos: new THREE.Vector3(hole.x, 9.02, hole.z),
        yaw,
        curl: 0.68,
        tiltX: -0.22,
        duration: 165,
        arcHeight: 0.08,
      });
      if (epoch !== gameEpoch) return;

      const seed = handSeeds.pop();
      releaseSeedFromHand(seed, hole);
      pitSeeds[currPit].push(seed);
      updateScoreAndTurnHUD(`${playerName} sowing (${handSeeds.length} left in hand)`);

      await moveHandTo({
        pos: new THREE.Vector3(hole.x, 9.05, hole.z),
        yaw,
        curl: 0.32,
        tiltX: -0.18,
        duration: 85,
      });
      if (epoch !== gameEpoch) return;
    }

    const nextPit = (currPit + 1) % 14;
    if (pitSeeds[nextPit].length > 0) {
      updateScoreAndTurnHUD(`${playerName} relays from next pit!`);
      await waitMs(110);
      if (epoch !== gameEpoch) return;
      currPit = nextPit;
    } else {
      const capturePit = (currPit + 2) % 14;
      if (pitSeeds[capturePit].length > 0) {
        updateScoreAndTurnHUD(`${playerName} captures pit!`);
        const captured = await pickupFromPit(capturePit, yaw, epoch);
        if (!captured || epoch !== gameEpoch) return;
        await depositCapturedSeeds(captured, player, yaw, epoch);
        if (epoch !== gameEpoch) return;
      } else {
        updateScoreAndTurnHUD(`${playerName} ended turn (empty pit).`);
      }
      break;
    }
  }

  // Park hand back out of the way
  await moveHandTo({
    pos: new THREE.Vector3(-1.82, 9.4, player === 0 ? -13.2 : -17.2),
    yaw,
    curl: 0.15,
    tiltX: -0.15,
    duration: 240,
  });
  if (epoch !== gameEpoch) return;
  handRig.root.visible = false;

  // Switch turn and check end-of-round
  currentPlayer = 1 - player;
  if (checkAndHandleGameOver()) {
    isAnimatingMove = false;
    return;
  }

  isAnimatingMove = false;
  updateScoreAndTurnHUD();

  if (vsCpu && currentPlayer === 1 && gameMode === "playing") {
    scheduleCpuTurn(epoch);
  }
}

function simulateMoveGain(startIdx) {
  const counts = pitSeeds.map((arr) => arr.length);
  let curr = startIdx;
  let hops = 0;
  while (hops < 25) {
    hops++;
    let inHand = counts[curr];
    counts[curr] = 0;
    while (inHand > 0) {
      curr = (curr + 1) % 14;
      counts[curr]++;
      inHand--;
    }
    const next = (curr + 1) % 14;
    if (counts[next] > 0) {
      curr = next;
    } else {
      const cap = (curr + 2) % 14;
      return counts[cap] * 10 + hops;
    }
  }
  return 0;
}

function scheduleCpuTurn(epoch) {
  setTimeout(() => {
    if (epoch !== gameEpoch || gameMode !== "playing" || isAnimatingMove || gameOver || currentPlayer !== 1) {
      return;
    }
    const legal = BOARD_HOLES.filter((h) => h.owner === 1 && pitSeeds[h.idx].length > 0).map((h) => h.idx);
    if (legal.length === 0) {
      checkAndHandleGameOver();
      return;
    }
    let bestPit = legal[0];
    let bestScore = -1;
    for (const idx of legal) {
      const val = simulateMoveGain(idx) + Math.random() * 0.5;
      if (val > bestScore) {
        bestScore = val;
        bestPit = idx;
      }
    }
    executeMove(bestPit);
  }, 550);
}

function checkAndHandleGameOver() {
  const nextHasMove = BOARD_HOLES.some((h) => h.owner === currentPlayer && pitSeeds[h.idx].length > 0);
  if (nextHasMove) return false;

  // Remaining seeds on the board go to the other player
  const collector = 1 - currentPlayer;
  for (let i = 0; i < 14; i++) {
    if (pitSeeds[i].length > 0) {
      const rem = pitSeeds[i].splice(0);
      scores[collector] += rem.length;
      rem.forEach((s) => {
        s.mesh.visible = false;
        s.sleeping = true;
      });
    }
  }

  gameOver = true;
  updateScoreAndTurnHUD("Round complete!");

  const p2Label = vsCpu ? "CPU" : "Player 2";
  if (scores[0] > scores[1]) {
    gameoverTitle.textContent = "Player 1 Wins!";
  } else if (scores[1] > scores[0]) {
    gameoverTitle.textContent = `${p2Label} Wins!`;
  } else {
    gameoverTitle.textContent = "Draw Game!";
  }
  gameoverSummary.textContent = `Final Score — Player 1: ${scores[0]} · ${p2Label}: ${scores[1]}`;
  gameoverModal.classList.remove("hidden");
  return true;
}

// ============================================================================
// ASSET LOADING
// ============================================================================
loadIcosahedronTemplate();

function loadFromUrl(url) {
  loaderStatus.textContent = "Downloading 3D model…";
  gltfLoader.load(
    url,
    (gltf) => {
      try {
        progressFill.style.width = "100%";
        progressPct.textContent = "100%";
        loaderStatus.textContent = "Preparing 3D scene…";
        setupLoadedScene(gltf);
        window.__PALLANGUZHI_LOADED = true;
      } catch (err) {
        console.error("Scene setup error:", err);
        showError(`Model downloaded, but scene setup failed: <code>${err?.message || err}</code>`);
      }
    },
    (xhr) => {
      if (xhr.total > 0) {
        const pct = Math.min(100, Math.round((xhr.loaded / xhr.total) * 100));
        progressFill.style.width = `${pct}%`;
        progressPct.textContent = `${pct}%`;
      } else if (xhr.loaded > 0) {
        const mb = (xhr.loaded / (1024 * 1024)).toFixed(1);
        loaderStatus.textContent = `Downloaded ${mb} MB…`;
        progressPct.textContent = `${mb} MB`;
      }
    },
    (err) => {
      console.error("GLB load error:", err);
      const isFileProto = window.location.protocol === "file:";
      showError(
        isFileProto
          ? "Browsers block loading <code>pallakulzhi.glb</code> over <code>file://</code>. Run <code>start-website.bat</code> or <code>node server.mjs</code> and open <code>http://127.0.0.1:4173</code>."
          : `Failed to fetch <code>${MODEL_URL}</code> (${err?.message || "network error"}). You can still open the <code>.glb</code> file directly below.`
      );
    }
  );
}

loadFromUrl(MODEL_URL);

fileInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const blobUrl = URL.createObjectURL(file);
  errorBanner.classList.add("hidden");
  loaderOverlay.classList.remove("fade-out");
  loadFromUrl(blobUrl);
});

// ============================================================================
// RAYCASTER: HOLE HOVER HIGHLIGHT & CLICK-TO-PLAY
// ============================================================================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDownPos = { x: 0, y: 0 };

function clearHoleHover() {
  hoveredHole = null;
  holeHighlightGroup.visible = false;
  container.style.cursor = "";
}

function findHoleAtPoint(x, z) {
  let closest = null;
  let minDist = HOLE_HOVER_RADIUS;
  for (const hole of BOARD_HOLES) {
    const d = Math.hypot(x - hole.x, z - hole.z);
    if (d <= minDist) {
      minDist = d;
      closest = hole;
    }
  }
  return closest;
}

function getFirstHit(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(loadedRoot, true).filter((h) => h.object.visible);
  return hits.length > 0 ? hits[0] : null;
}

function isHolePlayable(hole) {
  return (
    !isAnimatingMove &&
    !gameOver &&
    hole.owner === currentPlayer &&
    pitSeeds[hole.idx].length > 0 &&
    !(vsCpu && currentPlayer === 1)
  );
}

renderer.domElement.addEventListener("pointermove", (e) => {
  if (gameMode !== "playing" || !loadedRoot) {
    if (hoveredHole) clearHoleHover();
    return;
  }
  if (e.buttons !== 0) return;

  const hit = getFirstHit(e);
  if (hit && isBoardMesh(hit.object)) {
    const hole = findHoleAtPoint(hit.point.x, hit.point.z);
    if (hole) {
      hoveredHole = hole;
      const playable = isHolePlayable(hole);
      holeHighlightGroup.position.set(hole.x, HOLE_RIM_Y, hole.z);
      holeHighlightGroup.visible = true;
      holeRingMat.opacity = playable ? 0.98 : 0.35;
      holeGlowMat.opacity = playable ? 0.18 : 0.04;
      container.style.cursor = playable ? "pointer" : "default";
      return;
    }
  }

  clearHoleHover();
});

renderer.domElement.addEventListener("pointerleave", clearHoleHover);

renderer.domElement.addEventListener("pointerdown", (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
  cameraAnim = null;
});

renderer.domElement.addEventListener("pointerup", (e) => {
  if (gameMode !== "playing" || !loadedRoot) return;
  const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
  if (dist > 5) return;

  const hit = getFirstHit(e);
  if (hit) {
    const hole = isBoardMesh(hit.object) ? findHoleAtPoint(hit.point.x, hit.point.z) : null;
    if (hole) {
      if (isHolePlayable(hole)) {
        selectionPill.classList.add("hidden");
        executeMove(hole.idx);
        return;
      }
      selectionLabel.textContent = `${hole.label} · ${pitSeeds[hole.idx].length} seeds`;
      selectionPill.classList.remove("hidden");
    } else {
      selectionLabel.textContent = getFriendlyName(hit.object);
      selectionPill.classList.remove("hidden");
    }
  } else {
    selectionPill.classList.add("hidden");
  }
});

// ============================================================================
// UI EVENT BINDINGS
// ============================================================================
document.getElementById("btn-play").addEventListener("click", enterPlayingView);
document.getElementById("btn-back-menu").addEventListener("click", enterMenuView);
document.getElementById("btn-new-game").addEventListener("click", startNewGame);
document.getElementById("btn-play-again").addEventListener("click", startNewGame);
document.getElementById("btn-gameover-menu").addEventListener("click", enterMenuView);
document.getElementById("btn-board-view").addEventListener("click", () => animateCameraTo("board"));

document.querySelectorAll(".mood-btn").forEach((btn) => {
  btn.addEventListener("click", () => applyLightingMood(btn.dataset.mood));
});

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => setOpponentMode(btn.dataset.mode));
});

const btnCounts = document.getElementById("btn-counts");
btnCounts.addEventListener("click", () => {
  showPitCounts = !showPitCounts;
  btnCounts.classList.toggle("active", showPitCounts);
});

const btnRotate = document.getElementById("btn-rotate");
btnRotate.addEventListener("click", () => {
  controls.autoRotate = !controls.autoRotate;
  controls.autoRotateSpeed = 1.2;
  btnRotate.classList.toggle("active", controls.autoRotate);
});

document.getElementById("btn-board-only").addEventListener("click", () => {
  setIsolateBoard(!isolateBoard);
  if (isolateBoard) animateCameraTo("board");
});

const btnWireframe = document.getElementById("btn-wireframe");
btnWireframe.addEventListener("click", () => {
  wireframeMode = !wireframeMode;
  btnWireframe.classList.toggle("active", wireframeMode);
  if (loadedRoot) {
    loadedRoot.traverse((child) => {
      if (child.isMesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => {
          if (m) m.wireframe = wireframeMode;
        });
      }
    });
  }
});

function toggleInfoPanel() {
  camTuner.classList.add("hidden");
  infoPanel.classList.toggle("hidden");
}

document.getElementById("btn-info").addEventListener("click", toggleInfoPanel);
document.getElementById("btn-menu-about").addEventListener("click", toggleInfoPanel);
document.getElementById("btn-close-info").addEventListener("click", () => {
  infoPanel.classList.add("hidden");
});

// Camera Angle Adjuster
function round2(n) {
  return Number(n.toFixed(2));
}

function formatCurrentPresetCode() {
  const p = [round2(camera.position.x), round2(camera.position.y), round2(camera.position.z)];
  const t = [round2(controls.target.x), round2(controls.target.y), round2(controls.target.z)];
  return `pos: [${p.join(", ")}],\ntarget: [${t.join(", ")}]`;
}

function updateCamReadout() {
  if (camTuner.classList.contains("hidden")) return;
  camReadout.textContent = formatCurrentPresetCode();
}

function toggleCamTuner() {
  infoPanel.classList.add("hidden");
  camTuner.classList.toggle("hidden");
  tunerStatus.textContent = "";
  updateCamReadout();
}

function saveCurrentAsPreset(key, label) {
  CAMERA_VIEWS[key].pos.copy(camera.position);
  CAMERA_VIEWS[key].target.copy(controls.target);
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        veranda: {
          pos: [round2(CAMERA_VIEWS.veranda.pos.x), round2(CAMERA_VIEWS.veranda.pos.y), round2(CAMERA_VIEWS.veranda.pos.z)],
          target: [round2(CAMERA_VIEWS.veranda.target.x), round2(CAMERA_VIEWS.veranda.target.y), round2(CAMERA_VIEWS.veranda.target.z)],
        },
        board: {
          pos: [round2(CAMERA_VIEWS.board.pos.x), round2(CAMERA_VIEWS.board.pos.y), round2(CAMERA_VIEWS.board.pos.z)],
          target: [round2(CAMERA_VIEWS.board.target.x), round2(CAMERA_VIEWS.board.target.y), round2(CAMERA_VIEWS.board.target.z)],
        },
      })
    );
  } catch {
    // Ignore storage errors
  }
  tunerStatus.textContent = `Saved current view as ${label}!`;
}

document.getElementById("btn-menu-tune").addEventListener("click", toggleCamTuner);
document.getElementById("btn-play-tune").addEventListener("click", toggleCamTuner);
document.getElementById("btn-close-tuner").addEventListener("click", () => {
  camTuner.classList.add("hidden");
});

document.getElementById("btn-save-veranda").addEventListener("click", () => {
  saveCurrentAsPreset("veranda", "Thinnai Veranda (Menu)");
});

document.getElementById("btn-save-board").addEventListener("click", () => {
  saveCurrentAsPreset("board", "Board (Play)");
});

document.getElementById("btn-copy-cam").addEventListener("click", async () => {
  const snippet = `// Paste inside DEFAULT_CAMERA_VIEWS in app.js\nveranda: {\n  pos: [${round2(CAMERA_VIEWS.veranda.pos.x)}, ${round2(CAMERA_VIEWS.veranda.pos.y)}, ${round2(CAMERA_VIEWS.veranda.pos.z)}],\n  target: [${round2(CAMERA_VIEWS.veranda.target.x)}, ${round2(CAMERA_VIEWS.veranda.target.y)}, ${round2(CAMERA_VIEWS.veranda.target.z)}],\n},\nboard: {\n  pos: [${round2(CAMERA_VIEWS.board.pos.x)}, ${round2(CAMERA_VIEWS.board.pos.y)}, ${round2(CAMERA_VIEWS.board.pos.z)}],\n  target: [${round2(CAMERA_VIEWS.board.target.x)}, ${round2(CAMERA_VIEWS.board.target.y)}, ${round2(CAMERA_VIEWS.board.target.z)}],\n}`;
  try {
    await navigator.clipboard.writeText(snippet);
    tunerStatus.textContent = "Copied both camera presets to clipboard!";
  } catch {
    camReadout.textContent = snippet;
    tunerStatus.textContent = "Clipboard blocked — copy from box above.";
  }
});

document.getElementById("btn-reset-cam").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  CAMERA_VIEWS.veranda.pos.set(...DEFAULT_CAMERA_VIEWS.veranda.pos);
  CAMERA_VIEWS.veranda.target.set(...DEFAULT_CAMERA_VIEWS.veranda.target);
  CAMERA_VIEWS.board.pos.set(...DEFAULT_CAMERA_VIEWS.board.pos);
  CAMERA_VIEWS.board.target.set(...DEFAULT_CAMERA_VIEWS.board.target);
  animateCameraTo(gameMode === "menu" ? "veranda" : "board");
  tunerStatus.textContent = "Reset both angles to defaults.";
});

window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "c" && !e.metaKey && !e.ctrlKey && !e.altKey) {
    toggleCamTuner();
  }
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================================
// MAIN RENDER LOOP
// ============================================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);

  if (cameraAnim) {
    cameraAnim.progress = Math.min(1, cameraAnim.progress + dt * 1.6);
    const t = 1 - Math.pow(1 - cameraAnim.progress, 3);
    camera.position.lerpVectors(cameraAnim.startPos, cameraAnim.endPos, t);
    controls.target.lerpVectors(cameraAnim.startTarget, cameraAnim.endTarget, t);
    if (cameraAnim.progress >= 1) {
      cameraAnim = null;
    }
  }

  controls.update();
  updateCamReadout();

  if (holeHighlightGroup.visible) {
    const pulse = 1 + Math.sin(clock.elapsedTime * 5.0) * 0.035;
    holeHighlightGroup.scale.set(pulse, 1, pulse);
  }

  stepHandTween(dt);
  stepSeedPhysics(dt);
  updatePitBadgePositions();

  renderer.render(scene, camera);
}

animate();
