/**
 * Web AR Demo — Application Logic
 * Loads animated GLB 3D models on AR markers.
 * A-Frame + AR.js + aframe-extras are loaded dynamically.
 */

// ===== State =====
let currentModel = 0;
const totalModels = 3;
const modelConfigs = [
  {
    name: '🦊 Fox (chạy)',
    src: 'models/fox.glb',
    scale: '0.02 0.02 0.02',
    position: '0 0 0',
    rotation: '0 0 0',
    animated: true,
    animClip: '*',  // play all animations
  },
  {
    name: '🚶 CesiumMan (đi bộ)',
    src: 'models/cesiumman.glb',
    scale: '0.5 0.5 0.5',
    position: '0 0 0',
    rotation: '0 0 0',
    animated: true,
    animClip: '*',
  },
  {
    name: '🧠 BrainStem (robot)',
    src: 'models/brainstem.glb',
    scale: '0.3 0.3 0.3',
    position: '0 0 0',
    rotation: '0 0 0',
    animated: true,
    animClip: '*',
  },
];

let animationPaused = false;
let markerFound = false;
let toastTimer = null;
let scriptsLoaded = false;
let ctaShown = false;
let loopCount = 0;

// Read config (from config.js, loaded before app.js)
const LOOP_TARGET = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.ANIMATION_LOOP_COUNT) || 3;

// ===== DOM References =====
const splashScreen = document.getElementById('splash-screen');
const markerModal = document.getElementById('marker-modal');
const arHud = document.getElementById('ar-hud');
const arSceneContainer = document.getElementById('ar-scene-container');
const hudStatus = document.getElementById('hud-status');
const hudInstruction = document.getElementById('hud-instruction');
const screenshotFlash = document.getElementById('screenshot-flash');
const toastEl = document.getElementById('toast');

// ===== Load Scripts Dynamically =====
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function loadARLibraries() {
  if (scriptsLoaded) return;
  showToast('⏳ Đang tải thư viện AR...');
  try {
    await loadScript('https://aframe.io/releases/1.4.2/aframe.min.js');
    // aframe-extras for animation-mixer (plays GLB skeletal animations)
    await loadScript('https://cdn.jsdelivr.net/gh/c-frame/aframe-extras@7.2.0/dist/aframe-extras.min.js');
    await loadScript('https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js');
    scriptsLoaded = true;
    console.log('✅ A-Frame + AR.js + aframe-extras loaded');
  } catch (e) {
    showToast('❌ Lỗi tải thư viện AR');
    console.error('Failed to load AR libraries:', e);
    throw e;
  }
}

// ===== Build AR Scene =====
function getARSceneHTML() {
  const modelsHTML = modelConfigs.map((m, i) => {
    // animation-mixer: loop repeat, we count loops via 'animation-loop' event
    const mixerAttr = m.animated ? `animation-mixer="clip: ${m.animClip}; loop: repeat"` : '';

    return `
    <a-entity
      id="model-${i}"
      gltf-model="url(${m.src})"
      scale="${m.scale}"
      position="${m.position}"
      rotation="${m.rotation}"
      visible="${i === 0 ? 'true' : 'false'}"
      ${mixerAttr}
    ></a-entity>
  `;
  }).join('\n');

  return `
    <a-scene
      id="ar-scene"
      embedded
      arjs="sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix; matrixCodeType: 3x3;"
      renderer="logarithmicDepthBuffer: true; antialias: true; alpha: true;"
      vr-mode-ui="enabled: false"
    >
      <a-marker preset="hiro" id="ar-marker">
        <!-- Glow platform -->
        <a-cylinder
          color="#1a1a2e"
          radius="0.5"
          height="0.03"
          position="0 0 0"
          material="metalness: 0.8; roughness: 0.2; color: #1a1a2e"
        ></a-cylinder>
        <a-torus
          color="#6C63FF"
          radius="0.48"
          radius-tubular="0.01"
          position="0 0.02 0"
          rotation="90 0 0"
          material="emissive: #6C63FF; emissiveIntensity: 0.6; opacity: 0.7"
          animation="property: rotation; to: 90 360 0; dur: 4000; easing: linear; loop: true"
        ></a-torus>

        <!-- GLB Animated Models -->
        ${modelsHTML}

        <!-- Lighting -->
        <a-light type="ambient" color="#ffffff" intensity="0.7"></a-light>
        <a-light type="directional" color="#ffffff" intensity="0.9" position="1 2 1"></a-light>
        <a-light type="point" color="#6C63FF" intensity="0.4" distance="3" position="0 1.5 0"></a-light>
      </a-marker>

      <a-entity camera></a-entity>
    </a-scene>
  `;
}

// ===== Start AR =====
async function startAR() {
  const btn = document.getElementById('btn-start-ar');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⏳</span> Đang khởi tạo...';

  try {
    await loadARLibraries();

    splashScreen.classList.add('hidden');

    setTimeout(() => {
      splashScreen.style.display = 'none';

      arSceneContainer.innerHTML = getARSceneHTML();
      arSceneContainer.style.display = 'block';
      arHud.style.display = 'flex';

      setTimeout(() => {
        setupMarkerEvents();
        setupAnimationEndEvents();
        showToast('📷 Camera đã bật — Hướng vào Hiro Marker');
      }, 1000);
    }, 600);
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">▶</span> Bắt đầu AR';
    showToast('❌ Không thể khởi tạo AR');
  }
}

// ===== Exit AR =====
function exitAR() {
  arSceneContainer.innerHTML = '';
  arSceneContainer.style.display = 'none';
  arHud.style.display = 'none';

  splashScreen.style.display = 'flex';
  splashScreen.offsetHeight;
  splashScreen.classList.remove('hidden');

  const btn = document.getElementById('btn-start-ar');
  btn.disabled = false;
  btn.innerHTML = '<span class="btn-icon">▶</span> Bắt đầu AR';

  currentModel = 0;
  animationPaused = false;
  markerFound = false;
  ctaShown = false;
  loopCount = 0;

  // Hide CTA if visible
  const ctaOverlay = document.getElementById('cta-overlay');
  if (ctaOverlay) ctaOverlay.style.display = 'none';
}

// ===== Marker Events =====
function setupMarkerEvents() {
  const marker = document.getElementById('ar-marker');
  if (!marker) return;

  marker.addEventListener('markerFound', () => {
    markerFound = true;
    updateHudStatus(true);
    showToast('✨ Marker detected — ' + modelConfigs[currentModel].name);

    // Reset loop count AND hide CTA when marker is detected again
    loopCount = 0;
    ctaShown = false;
    const ctaOverlay = document.getElementById('cta-overlay');
    if (ctaOverlay) ctaOverlay.style.display = 'none';
  });

  marker.addEventListener('markerLost', () => {
    markerFound = false;
    updateHudStatus(false);
  });
}

// ===== Animation Loop Counter =====
function setupAnimationEndEvents() {
  for (let i = 0; i < totalModels; i++) {
    const modelEl = document.getElementById('model-' + i);
    if (!modelEl) continue;

    // 'animation-loop' fires each time a loop cycle completes
    modelEl.addEventListener('animation-loop', () => {
      // Only count for the currently visible model
      if (i !== currentModel || ctaShown) return;

      loopCount++;
      const remaining = LOOP_TARGET - loopCount;
      console.log(`🔄 Loop ${loopCount}/${LOOP_TARGET} on model-${i}`);

      if (remaining > 0) {
        showToast(`🔄 Vòng ${loopCount}/${LOOP_TARGET}`);
      } else {
        // Reached target loops → show CTA
        showToast('🎬 Animation hoàn tất!');
        setTimeout(() => showCTA(), 1200);
      }
    });
  }
}

// ===== Show CTA =====
function showCTA() {
  if (ctaShown) return;
  ctaShown = true;

  // Populate CTA content from config
  if (typeof APP_CONFIG !== 'undefined') {
    const titleEl = document.getElementById('cta-title-text');
    const msgEl = document.getElementById('cta-message-text');
    const btnEl = document.getElementById('cta-button');
    const btnTextEl = document.getElementById('cta-button-text');

    if (titleEl && APP_CONFIG.CTA_TITLE) {
      titleEl.innerHTML = APP_CONFIG.CTA_TITLE.replace(
        /(đặc biệt|special|khuyến mãi)/gi,
        '<span class="gradient-text">$1</span>'
      );
    }
    if (msgEl && APP_CONFIG.CTA_MESSAGE) msgEl.textContent = APP_CONFIG.CTA_MESSAGE;
    if (btnEl && APP_CONFIG.CTA_LINK) btnEl.href = APP_CONFIG.CTA_LINK;
    if (btnTextEl && APP_CONFIG.CTA_BUTTON_TEXT) btnTextEl.textContent = APP_CONFIG.CTA_BUTTON_TEXT;
  }

  const ctaOverlay = document.getElementById('cta-overlay');
  if (ctaOverlay) {
    ctaOverlay.style.display = 'flex';
  }
}

// ===== Dismiss CTA =====
function dismissCTA() {
  const ctaOverlay = document.getElementById('cta-overlay');
  if (ctaOverlay) {
    ctaOverlay.style.display = 'none';
  }
}

// ===== Update HUD =====
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

// ===== Toggle Marker Modal =====
function toggleMarkerModal() {
  if (markerModal.style.display === 'none' || !markerModal.style.display) {
    markerModal.style.display = 'flex';
  } else {
    markerModal.style.display = 'none';
  }
}

// ===== Change Model =====
function changeModel() {
  const current = document.getElementById('model-' + currentModel);
  if (current) current.setAttribute('visible', 'false');

  currentModel = (currentModel + 1) % totalModels;

  const next = document.getElementById('model-' + currentModel);
  if (next) next.setAttribute('visible', 'true');

  // Reset loop counter for new model
  loopCount = 0;
  ctaShown = false;

  // Hide CTA if visible
  const ctaOverlay = document.getElementById('cta-overlay');
  if (ctaOverlay) ctaOverlay.style.display = 'none';

  showToast('Model: ' + modelConfigs[currentModel].name);

  if (markerFound) {
    hudInstruction.textContent = 'Đang hiển thị: ' + modelConfigs[currentModel].name;
  }
}

// ===== Toggle Animation =====
function toggleAnimation() {
  animationPaused = !animationPaused;

  const scene = document.getElementById('ar-scene');
  if (!scene) return;

  const animatedEls = scene.querySelectorAll('[animation], [animation__float], [animation__pulse]');
  animatedEls.forEach(el => {
    ['animation', 'animation__float', 'animation__pulse'].forEach(attr => {
      if (el.hasAttribute(attr)) {
        el.setAttribute(attr, 'enabled', !animationPaused);
      }
    });
  });

  showToast(animationPaused ? '⏸ Animation tạm dừng' : '▶ Animation đã bật');
}

// ===== Take Screenshot =====
function takeScreenshot() {
  const scene = document.getElementById('ar-scene');
  if (!scene) return;

  screenshotFlash.classList.add('flash');
  setTimeout(() => screenshotFlash.classList.remove('flash'), 200);

  setTimeout(() => {
    const canvas = scene.canvas;
    if (canvas) {
      try {
        const link = document.createElement('a');
        link.download = 'ar-screenshot-' + Date.now() + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('📸 Đã lưu ảnh!');
      } catch (e) {
        showToast('⚠️ Không thể chụp — camera bảo mật');
      }
    }
  }, 300);
}

// ===== Toast =====
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2500);
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('dblclick', (e) => {
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  }, { passive: false });

  console.log('🚀 Web AR Demo — 3 GLB models ready');
  console.log('Models:', modelConfigs.map(m => m.name).join(', '));
});
