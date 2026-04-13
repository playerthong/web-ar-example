/**
 * Web AR — Three.js (core) + AR.js (tracking)
 * Zero build tools, pure CDN delivery.
 */

// ===== Model Configs =====
const modelConfigs = [
  { name: '🦊 Fox (chạy)',        src: 'models/fox.glb',       scale: 0.02, animated: true  },
  { name: '🚶 CesiumMan (đi bộ)', src: 'models/cesiumman.glb', scale: 0.5,  animated: true  },
  { name: '🧠 BrainStem (robot)', src: 'models/brainstem.glb', scale: 0.3,  animated: true  },
];

// ===== State =====
let currentModel    = 0;
let animationPaused = false;
let markerFound     = false;
let ctaShown        = false;
let loopCount       = 0;
let toastTimer      = null;
let scriptsLoaded   = false;
let rafId           = null;
let prevMarkerState = false;
let fallbackQrDone  = false;
let qrGenerated     = false;

// Three.js handles
let renderer, scene, camera, clock;
let arSource, arContext;
let markerRoot, torusRing;
let loadedModels = [];  // [{ mesh: Object3D, mixer: AnimationMixer|null }]

const LOOP_TARGET = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.ANIMATION_LOOP_COUNT) || 3;

// ===== DOM =====
const splashScreen   = document.getElementById('splash-screen');
const arHud          = document.getElementById('ar-hud');
const arContainer    = document.getElementById('ar-scene-container');
const hudStatus      = document.getElementById('hud-status');
const hudInstruction = document.getElementById('hud-instruction');
const screenshotFlash= document.getElementById('screenshot-flash');
const toastEl        = document.getElementById('toast');
const markerModal    = document.getElementById('marker-modal');

// ===== Script Loader =====
const loadScript = src => new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = src; s.onload = resolve; s.onerror = reject;
  document.head.appendChild(s);
});

async function loadARLibraries() {
  if (scriptsLoaded) return;
  showToast('⏳ Đang tải thư viện AR...');
  // three@0.128.0: last version with examples/js/ global scripts
  // AR.js 3.3.3: compatible with three@0.128.0
  await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js');
  await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js');
  await loadScript('https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@3.3.3/three.js/build/ar.js');

  // AR.js 3.3.3 uses Object.assign() to mixin THREE.EventDispatcher onto its classes.
  // three@0.128.0 defines EventDispatcher as an ES6 class → prototype methods are
  // non-enumerable → Object.assign() silently skips them → dispatchEvent is missing.
  // Fix: copy methods directly from the prototype onto every affected AR.js class.
  const edMethods = ['addEventListener', 'removeEventListener', 'hasEventListener', 'dispatchEvent'];
  [THREEx.ArBaseControls, THREEx.ArToolkitContext, THREEx.ArToolkitSource].forEach(cls => {
    if (!cls) return;
    edMethods.forEach(m => {
      if (typeof cls.prototype[m] !== 'function') {
        cls.prototype[m] = THREE.EventDispatcher.prototype[m];
      }
    });
  });

  scriptsLoaded = true;
}

// ===== Three.js Init =====
function initThree() {
  scene  = new THREE.Scene();
  camera = new THREE.Camera();
  clock  = new THREE.Clock();

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  arContainer.appendChild(renderer.domElement);

  // Lights (added to scene, not markerRoot, so they always illuminate)
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(1, 2, 1);
  scene.add(dir);

  // Marker root — AR.js will update this group's world matrix
  markerRoot = new THREE.Group();
  scene.add(markerRoot);

  // Purple point light follows marker
  const pt = new THREE.PointLight(0x6C63FF, 0.4, 3);
  pt.position.set(0, 1.5, 0);
  markerRoot.add(pt);

  // DEBUG: bright red sphere — nếu cái này hiện = rendering OK, lỗi là GLTF
  const debugSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  );
  debugSphere.position.y = 0.3;
  markerRoot.add(debugSphere);

  // Platform
  const platGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.03, 32);
  const platMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, metalness: 0.8, roughness: 0.2 });
  markerRoot.add(new THREE.Mesh(platGeo, platMat));

  // Torus ring (animated in render loop)
  const torusGeo = new THREE.TorusGeometry(0.48, 0.01, 16, 100);
  const torusMat = new THREE.MeshStandardMaterial({ color: 0x6C63FF, emissive: 0x6C63FF, emissiveIntensity: 0.6, transparent: true, opacity: 0.7 });
  torusRing = new THREE.Mesh(torusGeo, torusMat);
  torusRing.rotation.x = Math.PI / 2;
  torusRing.position.y = 0.02;
  markerRoot.add(torusRing);
}

// ===== AR.js Init =====
function initARjs() {
  return new Promise((resolve, reject) => {
    arSource = new THREEx.ArToolkitSource({ sourceType: 'webcam' });

    arSource.init(
      () => { onARSourceReady(); resolve(); },
      err  => { showARFallback('Camera không thể truy cập: ' + (err?.message || err)); reject(err); }
    );

    arContext = new THREEx.ArToolkitContext({
      cameraParametersUrl: 'https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@3.3.3/data/data/camera_para.dat',
      detectionMode: 'mono',
    });

    arContext.init(() => {
      camera.projectionMatrix.copy(arContext.getProjectionMatrix());
    });

    new THREEx.ArMarkerControls(arContext, markerRoot, {
      type       : 'pattern',
      patternUrl : 'https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@3.3.3/data/data/patt.hiro',
    });
  });
}

function onARSourceReady() {
  arSource.onResizeElement();
  arSource.copyElementSizeTo(renderer.domElement);
  if (arContext.arController) {
    arSource.copyElementSizeTo(arContext.arController.canvas);
  }
  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  arSource.onResizeElement();
  arSource.copyElementSizeTo(renderer.domElement);
  if (arContext.arController) {
    arSource.copyElementSizeTo(arContext.arController.canvas);
  }
}

// ===== Load Models =====
async function loadModels() {
  showToast('⏳ Đang tải models...');
  const loader = new THREE.GLTFLoader();

  const tasks = modelConfigs.map((cfg, i) => new Promise(resolve => {
    loader.load(cfg.src, gltf => {
      console.log(`✅ Loaded: ${cfg.src}`, gltf);
      const mesh = gltf.scene;
      mesh.scale.setScalar(cfg.scale);
      mesh.visible = (i === 0);
      markerRoot.add(mesh);

      let mixer = null;
      if (cfg.animated && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(mesh);
        gltf.animations.forEach(clip => {
          mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
        });
        const firstClipName = gltf.animations[0].name;
        mixer.addEventListener('loop', e => {
          if (e.action.getClip().name !== firstClipName) return;
          onAnimationLoop(i);
        });
      }

      loadedModels[i] = { mesh, mixer };
      if (i === 0) showToast('✅ Model fox loaded');
      resolve();
    }, xhr => {
      if (xhr.lengthComputable) {
        const pct = Math.round(xhr.loaded / xhr.total * 100);
        console.log(`📦 ${cfg.name}: ${pct}%`);
      }
    }, err => {
      console.error(`❌ Failed: ${cfg.src}`, err);
      showToast(`❌ Lỗi load: ${cfg.name}`);
      loadedModels[i] = null;
      resolve();
    });
  }));

  await Promise.all(tasks);
  showToast('📷 Camera đã bật — Hướng vào Hiro Marker');
}

// ===== Render Loop =====
function startRenderLoop() {
  const tick = () => {
    rafId = requestAnimationFrame(tick);
    if (!arSource.ready) return;

    arContext.update(arSource.domElement);

    // Detect marker state change
    const visible = markerRoot.visible;
    if (visible !== prevMarkerState) {
      visible ? onMarkerFound() : onMarkerLost();
      prevMarkerState = visible;
    }

    // getDelta() called exactly once per frame
    const delta = clock.getDelta();

    if (!animationPaused) {
      // Animate torus ring (~1 rotation per 4s)
      if (torusRing) torusRing.rotation.z += delta * (Math.PI / 2);
      // Update animation mixers
      loadedModels.forEach(m => m?.mixer?.update(delta));
    }

    renderer.render(scene, camera);
  };
  tick();
}

// ===== Start AR =====
async function startAR() {
  const btn = document.getElementById('btn-start-ar');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⏳</span> Đang khởi tạo...';

  try {
    await loadARLibraries();

    splashScreen.classList.add('hidden');
    setTimeout(async () => {
      splashScreen.style.display = 'none';
      arContainer.style.display = 'block';
      arHud.style.display = 'flex';

      initThree();

      try {
        await initARjs();
        await loadModels();
        startRenderLoop();
      } catch {
        // showARFallback already called inside initARjs
      }
    }, 600);
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">▶</span> Bắt đầu AR';
    showARFallback('Lỗi tải thư viện AR: ' + (e?.message || e));
  }
}

// ===== Exit AR =====
function exitAR() {
  // Stop render loop
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  window.removeEventListener('resize', onWindowResize);

  // Stop camera stream
  if (arSource?.domElement?.srcObject) {
    arSource.domElement.srcObject.getTracks().forEach(t => t.stop());
  }
  arSource?.domElement?.remove();

  // Dispose animation mixers
  loadedModels.forEach(m => m?.mixer?.stopAllAction());

  // Dispose Three.js resources
  if (scene) {
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        [].concat(obj.material).forEach(mat => {
          Object.values(mat).forEach(v => v?.isTexture && v.dispose());
          mat.dispose();
        });
      }
    });
  }
  if (renderer) { renderer.dispose(); renderer.domElement.remove(); }

  // Reset refs
  renderer = scene = camera = clock = null;
  arSource = arContext = null;
  markerRoot = torusRing = null;
  loadedModels = [];

  // Reset state
  currentModel = 0; animationPaused = false;
  markerFound  = false; ctaShown = false; loopCount = 0;
  prevMarkerState = false;

  // Reset UI
  arContainer.style.display = 'none';
  arHud.style.display = 'none';
  document.getElementById('ar-fallback').style.display = 'none';
  document.getElementById('cta-overlay').style.display = 'none';

  splashScreen.style.display = 'flex';
  splashScreen.offsetHeight; // force reflow
  splashScreen.classList.remove('hidden');

  const btn = document.getElementById('btn-start-ar');
  btn.disabled = false;
  btn.innerHTML = '<span class="btn-icon">▶</span> Bắt đầu AR';
}

// ===== AR Fallback =====
function showARFallback(reason) {
  const el = document.getElementById('ar-fallback');
  if (!el) return;

  const msgEl = document.getElementById('fallback-message-text');
  if (msgEl && reason) msgEl.textContent = reason;

  el.style.display = 'flex';
  arHud.style.display = 'none';

  if (!fallbackQrDone && typeof QRCode !== 'undefined' && typeof APP_CONFIG !== 'undefined' && APP_CONFIG.WEB_URL) {
    new QRCode(document.getElementById('fallback-qr-container'), {
      text: APP_CONFIG.WEB_URL, width: 140, height: 140,
      correctLevel: QRCode.CorrectLevel.L,
    });
    fallbackQrDone = true;
  }
}

function retryAR() {
  document.getElementById('ar-fallback').style.display = 'none';
  // Reset partial init state before retry
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (arSource?.domElement?.srcObject) {
    arSource.domElement.srcObject.getTracks().forEach(t => t.stop());
  }
  arSource?.domElement?.remove();
  if (renderer) { renderer.dispose(); renderer.domElement.remove(); }
  loadedModels = [];
  renderer = scene = camera = clock = arSource = arContext = markerRoot = torusRing = null;
  prevMarkerState = false;

  arHud.style.display = 'flex';
  initThree();
  initARjs().then(() => { loadModels(); startRenderLoop(); }).catch(() => {});
}

// ===== Marker Events =====
function onMarkerFound() {
  markerFound = true; loopCount = 0; ctaShown = false;
  updateHudStatus(true);
  showToast('✨ Marker detected — ' + modelConfigs[currentModel].name);
  document.getElementById('cta-overlay').style.display = 'none';
}

function onMarkerLost() {
  markerFound = false;
  updateHudStatus(false);
}

// ===== Animation Loop Counter =====
function onAnimationLoop(modelIndex) {
  if (modelIndex !== currentModel || ctaShown || !markerFound) return;
  loopCount++;
  if (loopCount < LOOP_TARGET) {
    showToast(`🔄 Vòng ${loopCount}/${LOOP_TARGET}`);
  } else {
    showToast('🎬 Animation hoàn tất!');
    setTimeout(showCTA, 1200);
  }
}

// ===== Change Model =====
function changeModel() {
  if (loadedModels[currentModel]?.mesh) loadedModels[currentModel].mesh.visible = false;
  currentModel = (currentModel + 1) % modelConfigs.length;
  if (loadedModels[currentModel]?.mesh) loadedModels[currentModel].mesh.visible = true;

  loopCount = 0; ctaShown = false;
  document.getElementById('cta-overlay').style.display = 'none';
  showToast('Model: ' + modelConfigs[currentModel].name);
  if (markerFound) hudInstruction.textContent = 'Đang hiển thị: ' + modelConfigs[currentModel].name;
}

// ===== Toggle Animation =====
function toggleAnimation() {
  animationPaused = !animationPaused;
  // timeScale=0 freezes without breaking mixer state
  loadedModels.forEach(m => {
    if (m?.mixer) m.mixer.timeScale = animationPaused ? 0 : 1;
  });
  showToast(animationPaused ? '⏸ Animation tạm dừng' : '▶ Animation đã bật');
}

// ===== Screenshot =====
function takeScreenshot() {
  screenshotFlash.classList.add('flash');
  setTimeout(() => screenshotFlash.classList.remove('flash'), 200);
  setTimeout(() => {
    try {
      renderer.render(scene, camera); // ensure latest frame in buffer
      const link = document.createElement('a');
      link.download = 'ar-' + Date.now() + '.png';
      link.href = renderer.domElement.toDataURL('image/png');
      link.click();
      showToast('📸 Đã lưu ảnh!');
    } catch { showToast('⚠️ Không thể chụp — camera bảo mật'); }
  }, 300);
}

// ===== HUD =====
function updateHudStatus(found) {
  if (found) {
    hudStatus.innerHTML = '<span class="status-dot active"></span> Marker detected!';
    hudInstruction.textContent = 'Đang hiển thị: ' + modelConfigs[currentModel].name;
    hudInstruction.classList.add('found');
  } else {
    hudStatus.innerHTML = '<span class="status-dot"></span> Đang tìm marker...';
    hudInstruction.textContent = 'Hướng camera vào Hiro Marker để xem 3D';
    hudInstruction.classList.remove('found');
  }
}

// ===== Marker Modal =====
function toggleMarkerModal() {
  const isHidden = markerModal.style.display === 'none' || !markerModal.style.display;
  markerModal.style.display = isHidden ? 'flex' : 'none';
  if (isHidden && !qrGenerated && typeof QRCode !== 'undefined' && typeof APP_CONFIG !== 'undefined' && APP_CONFIG.WEB_URL) {
    new QRCode(document.getElementById('qr-code-container'), {
      text: APP_CONFIG.WEB_URL, width: 120, height: 120,
      correctLevel: QRCode.CorrectLevel.L,
    });
    qrGenerated = true;
  }
}

// ===== CTA =====
function showCTA() {
  if (ctaShown) return;
  ctaShown = true;
  if (typeof APP_CONFIG !== 'undefined') {
    const t  = document.getElementById('cta-title-text');
    const m  = document.getElementById('cta-message-text');
    const b  = document.getElementById('cta-button');
    const bt = document.getElementById('cta-button-text');
    if (t && APP_CONFIG.CTA_TITLE) t.innerHTML = APP_CONFIG.CTA_TITLE.replace(
      /(đặc biệt|special|khuyến mãi)/gi, '<span class="gradient-text">$1</span>'
    );
    if (m  && APP_CONFIG.CTA_MESSAGE)     m.textContent  = APP_CONFIG.CTA_MESSAGE;
    if (b  && APP_CONFIG.CTA_LINK)        b.href         = APP_CONFIG.CTA_LINK;
    if (bt && APP_CONFIG.CTA_BUTTON_TEXT) bt.textContent = APP_CONFIG.CTA_BUTTON_TEXT;
  }
  document.getElementById('cta-overlay').style.display = 'flex';
}

function dismissCTA() {
  document.getElementById('cta-overlay').style.display = 'none';
}

// ===== Toast =====
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  console.log('🚀 Web AR — Three.js + AR.js ready');
  console.log('Models:', modelConfigs.map(m => m.name).join(', '));

  const params = new URLSearchParams(window.location.search);
  if (params.get('autoscan') === 'true') startAR();
});
