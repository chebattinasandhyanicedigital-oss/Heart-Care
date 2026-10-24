/**
 * CardioSync // Real 3D Anatomical Human Heart & Telemetry Dashboard
 * Powered by Three.js WebGL Engine with:
 * - Genuine 3D anatomical human heart model (ventricles, atria, aorta, pulmonary trunk, vena cava, coronary network)
 * - 360-degree interactive mouse/touch orbit controls & zoom
 * - Helical cardiac torsion and systolic-diastolic contractions
 * - Synchronized real-time CRT ECG cardiogram line
 * - Dynamic hemodynamic vitals (BP, Cardiac Output, SpO2)
 * - Synthesized dual-chamber Web Audio API heartbeat ("lub-dub")
 * - Left-side Heart Care Protocol guide
 * - Full prefers-reduced-motion accessibility
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // Configuration & Application State
  // --------------------------------------------------------------------------
  const CONFIG = {
    defaultBPM: 75,
    minBPM: 40,
    maxBPM: 180,
    particleCount: 40,
    reducedMotionQuery: '(prefers-reduced-motion: reduce)',
  };

  const state = {
    bpm: CONFIG.defaultBPM,
    baseBPM: CONFIG.defaultBPM,
    isAdrenalineRush: false,
    adrenalineTimer: null,

    // Audio
    audioEnabled: false,
    audioCtx: null,
    lastBeatPlayedPhase: -1,

    // 3D Orbit & Interaction State
    isDragging: false,
    prevPointerX: 0,
    prevPointerY: 0,
    targetRotY: 0.15,
    targetRotX: 0.08,
    currentRotY: 0.15,
    currentRotX: 0.08,
    targetZoom: 7.2,
    currentZoom: 7.2,
    hoverOffsetX: 0,
    hoverOffsetY: 0,

    // ECG & Cardiac Phase
    cyclePhase: 0,
    scanX: 0,
    lastTimestamp: 0,

    isReducedMotion: false,
    animationFrameId: null,
  };

  // DOM Elements - Telemetry HUD
  const bpmDisplay = document.getElementById('bpmDisplay');
  const rhythmStatus = document.getElementById('rhythmStatus');
  const bpDisplay = document.getElementById('bpDisplay');
  const spo2Display = document.getElementById('spo2Display');
  const cardiacOutputDisplay = document.getElementById('cardiacOutputDisplay');
  const ecgIndicator = document.getElementById('ecgIndicator');
  const ecgDisplayBox = document.getElementById('ecgDisplayBox');
  const phaseName = document.getElementById('phaseName');
  const phaseDot = document.getElementById('phaseDot');
  const audioToggleBtn = document.getElementById('audioToggleBtn');
  const audioIcon = document.getElementById('audioIcon');
  const audioLabel = document.getElementById('audioLabel');

  // DOM Elements - Controls & Care Panel
  const speedSlider = document.getElementById('speedSlider');
  const sliderValue = document.getElementById('sliderValue');
  const paceButtons = document.querySelectorAll('.pace-btn');
  const heartCarePanel = document.getElementById('heartCarePanel');
  const careToggleBtn = document.getElementById('careToggleBtn');
  const mobileCareBtn = document.getElementById('mobileCareBtn');
  const careCards = document.querySelectorAll('.care-card');
  const rotationFeedback = document.getElementById('rotationFeedback');
  const resetCameraBtn = document.getElementById('resetCameraBtn');

  // Canvases
  const particleCanvas = document.getElementById('particleCanvas');
  const pCtx = particleCanvas.getContext('2d');

  const ecgCanvas = document.getElementById('ecgCanvas');
  const ecgCtx = ecgCanvas.getContext('2d');

  const webglContainer = document.getElementById('webglContainer');

  // --------------------------------------------------------------------------
  // Web Audio API Synthesized Heartbeat Engine
  // --------------------------------------------------------------------------
  function initAudioContext() {
    if (!state.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        state.audioCtx = new AudioCtx();
      }
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
  }

  function playCardiacTone(freq, duration, gainLevel, startTime) {
    if (!state.audioEnabled || !state.audioCtx) return;

    try {
      const osc = state.audioCtx.createOscillator();
      const gain = state.audioCtx.createGain();
      const filter = state.audioCtx.createBiquadFilter();

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(140, startTime);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.exponentialRampToValueAtTime(32, startTime + duration);

      gain.gain.setValueAtTime(gainLevel, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(state.audioCtx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch (e) {
      // Audio fallback
    }
  }

  function playHeartbeatSound() {
    if (!state.audioEnabled || !state.audioCtx) return;
    const now = state.audioCtx.currentTime;
    // Lub (Atrioventricular closure)
    playCardiacTone(56, 0.09, 0.24, now);
    // Dub (Semilunar closure ~130ms later)
    playCardiacTone(70, 0.07, 0.17, now + 0.13);
  }

  if (audioToggleBtn) {
    audioToggleBtn.addEventListener('click', () => {
      state.audioEnabled = !state.audioEnabled;
      initAudioContext();

      if (state.audioEnabled) {
        audioToggleBtn.classList.add('active');
        audioIcon.textContent = '🔊';
        audioLabel.textContent = 'Sound ON';
        playHeartbeatSound();
      } else {
        audioToggleBtn.classList.remove('active');
        audioIcon.textContent = '🔇';
        audioLabel.textContent = 'Sound OFF';
      }
    });
  }

  // --------------------------------------------------------------------------
  // Left-Side Heart Care Protocol Accordion
  // --------------------------------------------------------------------------
  function setupHeartCareAccordion() {
    careCards.forEach((card) => {
      const headerBtn = card.querySelector('.care-card-header');
      if (!headerBtn) return;

      headerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = card.classList.contains('active');

        careCards.forEach((other) => {
          other.classList.remove('active');
          const btn = other.querySelector('.care-card-header');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        });

        if (!isActive) {
          card.classList.add('active');
          headerBtn.setAttribute('aria-expanded', 'true');
        }
      });
    });

    if (careToggleBtn && heartCarePanel) {
      careToggleBtn.addEventListener('click', () => {
        heartCarePanel.classList.toggle('collapsed');
      });
    }

    if (mobileCareBtn && heartCarePanel) {
      mobileCareBtn.addEventListener('click', () => {
        heartCarePanel.classList.toggle('mobile-open');
      });
    }
  }

  setupHeartCareAccordion();

  // --------------------------------------------------------------------------
  // Accessibility: prefers-reduced-motion
  // --------------------------------------------------------------------------
  const mediaQuery = window.matchMedia(CONFIG.reducedMotionQuery);

  function handleReducedMotionChange() {
    state.isReducedMotion = mediaQuery.matches;
  }

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleReducedMotionChange);
  } else if (mediaQuery.addListener) {
    mediaQuery.addListener(handleReducedMotionChange);
  }
  handleReducedMotionChange();

  // --------------------------------------------------------------------------
  // Dynamic Hemodynamic Vitals & Speed Synchronization
  // --------------------------------------------------------------------------
  function updateBPM(newBPM, updateUI = true) {
    const clamped = Math.max(CONFIG.minBPM, Math.min(CONFIG.maxBPM, Math.round(newBPM)));
    state.bpm = clamped;

    const cycleDuration = (60 / state.bpm).toFixed(3);
    document.documentElement.style.setProperty('--cardiac-cycle-duration', `${cycleDuration}s`);

    if (updateUI) {
      if (bpmDisplay) bpmDisplay.textContent = state.bpm;
      if (sliderValue) sliderValue.textContent = state.bpm;
      if (speedSlider) speedSlider.value = state.bpm;

      // Blood Pressure Scaling
      const systolic = Math.round(102 + (state.bpm - 50) * 0.36);
      const diastolic = Math.round(68 + (state.bpm - 50) * 0.16);
      if (bpDisplay) bpDisplay.textContent = `${systolic}/${diastolic}`;

      // Cardiac Output: (SV * HR) / 1000
      const cardiacOutput = ((70 * state.bpm) / 1000).toFixed(1);
      if (cardiacOutputDisplay) cardiacOutputDisplay.textContent = cardiacOutput;

      if (spo2Display) {
        spo2Display.textContent = state.bpm > 140 ? '98%' : '99%';
      }

      if (rhythmStatus) {
        if (state.bpm < 60) {
          rhythmStatus.textContent = 'Sinus Bradycardia';
          rhythmStatus.style.color = '#7aa2f7';
        } else if (state.bpm <= 100) {
          rhythmStatus.textContent = 'Normal Sinus Rhythm';
          rhythmStatus.style.color = '';
        } else if (state.bpm <= 140) {
          rhythmStatus.textContent = 'Sinus Tachycardia';
          rhythmStatus.style.color = '#ff9e3b';
        } else {
          rhythmStatus.textContent = 'Marked Tachycardia';
          rhythmStatus.style.color = '#ff2a5f';
        }
      }

      paceButtons.forEach((btn) => {
        const btnBpm = parseInt(btn.dataset.bpm, 10);
        if (Math.abs(btnBpm - state.bpm) <= 3) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
  }

  updateBPM(CONFIG.defaultBPM);

  paceButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetBpm = parseInt(btn.dataset.bpm, 10);
      state.baseBPM = targetBpm;
      updateBPM(targetBpm);
    });
  });

  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      state.baseBPM = val;
      updateBPM(val);
    });
  }

  // --------------------------------------------------------------------------
  // Real-Time Sweeping CRT ECG Waveform Generator
  // --------------------------------------------------------------------------
  let ecgPoints = [];
  let ecgDPR = 1;
  let ecgWidth = 0;
  let ecgHeight = 0;

  function resizeECGCanvas() {
    ecgDPR = window.devicePixelRatio || 1;
    const rect = ecgCanvas.getBoundingClientRect();
    ecgWidth = rect.width;
    ecgHeight = rect.height;

    ecgCanvas.width = ecgWidth * ecgDPR;
    ecgCanvas.height = ecgHeight * ecgDPR;

    ecgCtx.scale(ecgDPR, ecgDPR);

    const totalPixels = Math.ceil(ecgWidth);
    ecgPoints = new Float32Array(totalPixels);
    const baseline = ecgHeight * 0.54;
    for (let i = 0; i < totalPixels; i++) {
      ecgPoints[i] = baseline;
    }
    state.scanX = 0;
  }

  window.addEventListener('resize', resizeECGCanvas, { passive: true });
  resizeECGCanvas();

  function getECGAmplitude(phase) {
    if (phase >= 0.08 && phase < 0.18) {
      const pPhase = (phase - 0.08) / 0.10;
      return Math.sin(pPhase * Math.PI) * 0.16;
    }
    if (phase >= 0.23 && phase < 0.26) {
      const qPhase = (phase - 0.23) / 0.03;
      return -Math.sin(qPhase * Math.PI) * 0.18;
    }
    if (phase >= 0.26 && phase < 0.33) {
      const rPhase = (phase - 0.26) / 0.07;
      if (rPhase < 0.45) {
        return (rPhase / 0.45) * 1.0;
      } else {
        return (1.0 - (rPhase - 0.45) / 0.55) * 1.0;
      }
    }
    if (phase >= 0.33 && phase < 0.37) {
      const sPhase = (phase - 0.33) / 0.04;
      return -Math.sin(sPhase * Math.PI) * 0.28;
    }
    if (phase >= 0.46 && phase < 0.62) {
      const tPhase = (phase - 0.46) / 0.16;
      return Math.sin(tPhase * Math.PI) * 0.32;
    }
    return (Math.sin(phase * Math.PI * 18) * 0.012);
  }

  function updateCardiacPhaseIndicator(phase) {
    if (!phaseName || !phaseDot) return;

    if (phase >= 0.08 && phase < 0.22) {
      phaseName.textContent = 'Atrial Systole (P-Wave)';
      phaseName.style.color = '#00d2ff';
      phaseDot.style.backgroundColor = '#00d2ff';
      phaseDot.style.boxShadow = '0 0 8px #00d2ff';
    } else if (phase >= 0.26 && phase < 0.42) {
      phaseName.textContent = 'Ventricular Ejection (QRS)';
      phaseName.style.color = '#ff2a5f';
      phaseDot.style.backgroundColor = '#ff2a5f';
      phaseDot.style.boxShadow = '0 0 10px #ff2a5f';
    } else if (phase >= 0.46 && phase < 0.64) {
      phaseName.textContent = 'Ventricular Recovery (T-Wave)';
      phaseName.style.color = '#00f5a0';
      phaseDot.style.backgroundColor = '#00f5a0';
      phaseDot.style.boxShadow = '0 0 8px #00f5a0';
    } else {
      phaseName.textContent = 'Ventricular Diastole (Filling)';
      phaseName.style.color = 'var(--text-muted)';
      phaseDot.style.backgroundColor = 'var(--text-subtle)';
      phaseDot.style.boxShadow = 'none';
    }
  }

  function renderECGLine(deltaSeconds) {
    if (ecgWidth <= 0 || ecgHeight <= 0) return;

    const baselineY = ecgHeight * 0.54;
    const maxAmplitudePx = ecgHeight * 0.42;

    const pixelsPerBeat = Math.max(90, Math.min(220, ecgWidth * 0.26));
    const scanSpeed = (pixelsPerBeat * (state.bpm / 60));
    const advancePx = scanSpeed * deltaSeconds;

    const cycleFreq = state.bpm / 60;
    state.cyclePhase = (state.cyclePhase + cycleFreq * deltaSeconds) % 1.0;

    updateCardiacPhaseIndicator(state.cyclePhase);

    if (state.cyclePhase >= 0.27 && state.cyclePhase < 0.35) {
      if (state.lastBeatPlayedPhase !== 1) {
        state.lastBeatPlayedPhase = 1;
        playHeartbeatSound();
      }
    } else {
      state.lastBeatPlayedPhase = 0;
    }

    const prevScanX = state.scanX;
    state.scanX = (state.scanX + advancePx);

    const startX = Math.floor(prevScanX);
    const endX = Math.floor(state.scanX);

    for (let x = startX; x <= endX; x++) {
      const wrappedX = x % Math.ceil(ecgWidth);
      const frac = (x - startX) / Math.max(1, endX - startX);
      const currentPhase = (state.cyclePhase + frac * (advancePx / ecgWidth)) % 1.0;
      const amp = getECGAmplitude(currentPhase);
      ecgPoints[wrappedX] = baselineY - amp * maxAmplitudePx;

      if (amp > 0.8) {
        if (ecgIndicator) {
          ecgIndicator.style.transform = 'scale(1.5)';
          ecgIndicator.style.boxShadow = '0 0 16px #00f5a0, 0 0 28px #00f5a0';
        }
        if (ecgDisplayBox) {
          ecgDisplayBox.classList.add('pulse-flash');
        }
      } else {
        if (ecgIndicator) {
          ecgIndicator.style.transform = 'scale(1)';
          ecgIndicator.style.boxShadow = '0 0 10px #00f5a0';
        }
        if (ecgDisplayBox) {
          ecgDisplayBox.classList.remove('pulse-flash');
        }
      }
    }

    state.scanX = state.scanX % ecgWidth;

    ecgCtx.clearRect(0, 0, ecgWidth, ecgHeight);

    const currentHead = Math.floor(state.scanX);
    const eraseGap = 28;

    ecgCtx.lineWidth = 2.4;
    ecgCtx.lineCap = 'round';
    ecgCtx.lineJoin = 'round';
    ecgCtx.strokeStyle = '#00f5a0';
    ecgCtx.shadowColor = 'rgba(0, 245, 160, 0.85)';
    ecgCtx.shadowBlur = 8;

    ecgCtx.beginPath();
    let started = false;

    for (let x = 0; x < ecgWidth; x++) {
      const distAhead = (x - currentHead + ecgWidth) % ecgWidth;
      if (distAhead < eraseGap) {
        if (started) {
          ecgCtx.stroke();
          ecgCtx.beginPath();
          started = false;
        }
        continue;
      }

      const y = ecgPoints[x];
      if (!started) {
        ecgCtx.moveTo(x, y);
        started = true;
      } else {
        ecgCtx.lineTo(x, y);
      }
    }
    if (started) ecgCtx.stroke();

    const headY = ecgPoints[currentHead] || baselineY;
    ecgCtx.beginPath();
    ecgCtx.arc(currentHead, headY, 3.8, 0, Math.PI * 2);
    ecgCtx.fillStyle = '#ffffff';
    ecgCtx.shadowColor = '#00f5a0';
    ecgCtx.shadowBlur = 16;
    ecgCtx.fill();
    ecgCtx.shadowBlur = 0;
  }

  // --------------------------------------------------------------------------
  // Background Ambient Dust Particles
  // --------------------------------------------------------------------------
  class BioParticle {
    constructor(w, h) {
      this.reset(w, h, true);
    }

    reset(w, h, isInitial = false) {
      this.x = Math.random() * w;
      this.y = isInitial ? Math.random() * h : h + 15;
      this.radius = Math.random() < 0.25 ? Math.random() * 2.5 + 1.2 : Math.random() * 1.5 + 0.6;
      this.vy = -(Math.random() * 0.45 + 0.15);
      this.vx = (Math.random() - 0.5) * 0.28;
      this.baseAlpha = Math.random() * 0.38 + 0.12;
      this.alpha = this.baseAlpha;
      this.pulseSpeed = Math.random() * 0.02 + 0.01;
      this.pulsePhase = Math.random() * Math.PI * 2;
      const hues = ['255, 42, 95', '220, 20, 60', '255, 120, 160', '0, 210, 255'];
      this.color = hues[Math.floor(Math.random() * hues.length)];
    }

    update(w, h, mouseX, mouseY) {
      this.y += this.vy;
      this.x += this.vx;

      const dx = this.x - mouseX;
      const dy = this.y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = 130;
      if (dist < maxDist && dist > 1) {
        const force = (1 - dist / maxDist) * 1.8;
        this.x += (dx / dist) * force;
        this.y += (dy / dist) * force;
      }

      this.pulsePhase += this.pulseSpeed;
      this.alpha = Math.max(0.05, this.baseAlpha + Math.sin(this.pulsePhase) * 0.1);

      if (this.y < -20 || this.x < -20 || this.x > w + 20) {
        this.reset(w, h, false);
      }
    }

    draw(context) {
      context.beginPath();
      context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(${this.color}, ${this.alpha})`;
      context.shadowColor = `rgba(${this.color}, 0.55)`;
      context.shadowBlur = 6;
      context.fill();
      context.shadowBlur = 0;
    }
  }

  let particles = [];
  function resizeParticleCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    particleCanvas.width = w * dpr;
    particleCanvas.height = h * dpr;
    particleCanvas.style.width = `${w}px`;
    particleCanvas.style.height = `${h}px`;
    pCtx.scale(dpr, dpr);

    particles = [];
    for (let i = 0; i < CONFIG.particleCount; i++) {
      particles.push(new BioParticle(w, h));
    }
  }

  window.addEventListener('resize', resizeParticleCanvas, { passive: true });
  resizeParticleCanvas();

  // --------------------------------------------------------------------------
  // Three.js WebGL Real 3D Anatomical Heart Engine
  // --------------------------------------------------------------------------
  let scene, camera, renderer;
  let heartRoot, ventriclesGroup, atriaGroup, vesselsGroup, coronaryGroup;
  let lvMesh, rvMesh, aortaMesh, pulmonaryMesh, svcMesh, ivcMesh;
  let coronaryArteries = [];
  let arteryMaterial;

  function createProceduralMuscleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base tone
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 512);

    // Striated myocardial muscle fiber lines
    for (let i = 0; i < 600; i++) {
      const y = Math.random() * 512;
      const x = Math.random() * 512;
      const len = Math.random() * 60 + 30;
      const angle = (Math.PI / 4) + (Math.random() - 0.5) * 0.4;
      const strokeVal = Math.floor(Math.random() * 70 + 85);

      ctx.strokeStyle = `rgb(${strokeVal}, ${strokeVal}, ${strokeVal})`;
      ctx.lineWidth = Math.random() * 2 + 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }

  function initReal3DHeart() {
    if (typeof THREE === 'undefined') {
      console.warn('Three.js is loading...');
      setTimeout(initReal3DHeart, 150);
      return;
    }

    const width = webglContainer.clientWidth || 600;
    const height = webglContainer.clientHeight || 500;

    // 1. Scene & Camera
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0, state.currentZoom);

    // 2. WebGL Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if (renderer.outputColorSpace) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    webglContainer.appendChild(renderer.domElement);

    // 3. Cinematic Lights
    const ambientLight = new THREE.AmbientLight(0x2a1420, 1.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(5, 8, 7);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x3560b0, 1.2);
    fillLight.position.set(-6, -2, 5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x00f5a0, 1.8);
    rimLight.position.set(-5, 4, -5);
    scene.add(rimLight);

    const coreGlowLight = new THREE.PointLight(0xff2a5f, 3.2, 18);
    coreGlowLight.position.set(0, -0.2, 1);
    scene.add(coreGlowLight);

    // 4. Materials
    const muscleBumpTex = createProceduralMuscleTexture();

    const lvMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x9e122d,
      roughness: 0.28,
      metalness: 0.06,
      clearcoat: 0.95,
      clearcoatRoughness: 0.12,
      bumpMap: muscleBumpTex,
      bumpScale: 0.045,
    });

    const rvMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x8b0e25,
      roughness: 0.3,
      metalness: 0.05,
      clearcoat: 0.9,
      clearcoatRoughness: 0.14,
      bumpMap: muscleBumpTex,
      bumpScale: 0.04,
    });

    const atriaMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xaa1738,
      roughness: 0.32,
      metalness: 0.04,
      clearcoat: 0.88,
      clearcoatRoughness: 0.16,
    });

    const aortaMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xd92348,
      roughness: 0.22,
      metalness: 0.08,
      clearcoat: 0.98,
      clearcoatRoughness: 0.1,
    });

    const pulmonaryMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x2b528f,
      roughness: 0.24,
      metalness: 0.08,
      clearcoat: 0.95,
      clearcoatRoughness: 0.12,
    });

    const venaCavaMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x224275,
      roughness: 0.26,
      metalness: 0.06,
      clearcoat: 0.92,
      clearcoatRoughness: 0.14,
    });

    arteryMaterial = new THREE.MeshStandardMaterial({
      color: 0xff2a5f,
      emissive: 0xff1e53,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.1,
    });

    const veinMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d66b8,
      emissive: 0x1b3266,
      emissiveIntensity: 0.45,
      roughness: 0.25,
    });

    const fatMaterial = new THREE.MeshStandardMaterial({
      color: 0xc99c5b,
      roughness: 0.65,
      metalness: 0.02,
    });

    // 5. Build Anatomical Heart Hierarchy
    heartRoot = new THREE.Group();
    // Anatomical orientation tilt (~35 deg left axis)
    heartRoot.rotation.z = -0.16;
    heartRoot.rotation.y = 0.25;
    scene.add(heartRoot);

    ventriclesGroup = new THREE.Group();
    atriaGroup = new THREE.Group();
    vesselsGroup = new THREE.Group();
    coronaryGroup = new THREE.Group();

    heartRoot.add(ventriclesGroup);
    heartRoot.add(atriaGroup);
    heartRoot.add(vesselsGroup);
    heartRoot.add(coronaryGroup);

    // --- LEFT VENTRICLE (Conical Apex) ---
    const lvGeo = new THREE.SphereGeometry(1.42, 48, 48);
    const lvPos = lvGeo.attributes.position;
    for (let i = 0; i < lvPos.count; i++) {
      let x = lvPos.getX(i);
      let y = lvPos.getY(i);
      let z = lvPos.getZ(i);

      // Elongate and taper downwards to form anatomical conical apex
      if (y < 0) {
        const taper = 1.0 + y * 0.42;
        x *= Math.max(0.18, taper);
        z *= Math.max(0.18, taper);
        y *= 1.45; // apex elongation
      } else {
        // Upper base curvature
        y *= 0.85;
      }
      // Lateral muscular bulge
      if (x < 0) x *= 1.12;

      lvPos.setXYZ(i, x, y, z);
    }
    lvGeo.computeVertexNormals();
    lvMesh = new THREE.Mesh(lvGeo, lvMaterial);
    lvMesh.position.set(-0.25, -0.4, 0);
    ventriclesGroup.add(lvMesh);

    // --- RIGHT VENTRICLE (Anterior/Lateral Wrap) ---
    const rvGeo = new THREE.SphereGeometry(1.2, 40, 40);
    const rvPos = rvGeo.attributes.position;
    for (let i = 0; i < rvPos.count; i++) {
      let x = rvPos.getX(i);
      let y = rvPos.getY(i);
      let z = rvPos.getZ(i);

      if (y < 0) {
        const taper = 1.0 + y * 0.38;
        x *= Math.max(0.25, taper);
        z *= Math.max(0.25, taper);
        y *= 1.25;
      }
      // Curve upwards into infundibulum (pulmonary conus)
      if (y > 0.4) {
        z += 0.25;
        x -= 0.15;
      }
      rvPos.setXYZ(i, x, y, z);
    }
    rvGeo.computeVertexNormals();
    rvMesh = new THREE.Mesh(rvGeo, rvMaterial);
    rvMesh.position.set(0.65, -0.25, 0.4);
    rvMesh.scale.set(0.9, 0.95, 0.85);
    ventriclesGroup.add(rvMesh);

    // --- ATRIUM RIGHT & AURICLE ---
    const raGeo = new THREE.SphereGeometry(0.85, 32, 32);
    const raMesh = new THREE.Mesh(raGeo, atriaMaterial);
    raMesh.position.set(1.05, 0.75, -0.15);
    raMesh.scale.set(0.95, 1.1, 0.9);
    atriaGroup.add(raMesh);

    // Right Auricle flap
    const raAuricleGeo = new THREE.ConeGeometry(0.5, 0.9, 16);
    const raAuricle = new THREE.Mesh(raAuricleGeo, atriaMaterial);
    raAuricle.position.set(0.7, 0.95, 0.55);
    raAuricle.rotation.set(-0.6, 0.4, -0.8);
    atriaGroup.add(raAuricle);

    // --- ATRIUM LEFT & AURICLE ---
    const laGeo = new THREE.SphereGeometry(0.82, 32, 32);
    const laMesh = new THREE.Mesh(laGeo, atriaMaterial);
    laMesh.position.set(-0.75, 0.85, -0.5);
    laMesh.scale.set(1.05, 0.9, 0.95);
    atriaGroup.add(laMesh);

    // Left Auricle flap
    const laAuricleGeo = new THREE.ConeGeometry(0.42, 0.8, 16);
    const laAuricle = new THREE.Mesh(laAuricleGeo, atriaMaterial);
    laAuricle.position.set(-0.85, 0.7, 0.45);
    laAuricle.rotation.set(0.4, -0.3, 0.6);
    atriaGroup.add(laAuricle);

    // --- AORTA & AORTIC ARCH (Spline Tube) ---
    const aortaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.05, 0.5, 0.1),    // Aortic root
      new THREE.Vector3(0.12, 1.4, 0.25),   // Ascending aorta
      new THREE.Vector3(0.0, 2.1, 0.1),     // Arch crest
      new THREE.Vector3(-0.45, 2.05, -0.35),// Arch peak
      new THREE.Vector3(-0.7, 1.3, -0.65),  // Descending aorta
      new THREE.Vector3(-0.75, 0.1, -0.75), // Thoracic continuation
    ]);
    const aortaGeo = new THREE.TubeGeometry(aortaCurve, 40, 0.34, 20, false);
    aortaMesh = new THREE.Mesh(aortaGeo, aortaMaterial);
    vesselsGroup.add(aortaMesh);

    // Three Great Arterial Branches of the Arch:
    // 1. Brachiocephalic Artery
    const bcGeo = new THREE.CylinderGeometry(0.13, 0.14, 0.85, 16);
    const bcMesh = new THREE.Mesh(bcGeo, aortaMaterial);
    bcMesh.position.set(0.22, 2.3, 0.22);
    bcMesh.rotation.set(0.1, 0, -0.35);
    vesselsGroup.add(bcMesh);

    // 2. Left Common Carotid
    const lccGeo = new THREE.CylinderGeometry(0.1, 0.11, 0.8, 16);
    const lccMesh = new THREE.Mesh(lccGeo, aortaMaterial);
    lccMesh.position.set(-0.08, 2.45, 0.0);
    lccMesh.rotation.set(-0.1, 0, -0.15);
    vesselsGroup.add(lccMesh);

    // 3. Left Subclavian
    const lscGeo = new THREE.CylinderGeometry(0.1, 0.11, 0.8, 16);
    const lscMesh = new THREE.Mesh(lscGeo, aortaMaterial);
    lscMesh.position.set(-0.35, 2.35, -0.22);
    lscMesh.rotation.set(-0.25, 0, 0.15);
    vesselsGroup.add(lscMesh);

    // --- PULMONARY TRUNK & BIFURCATION ---
    const pulmonaryCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.45, 0.45, 0.7),   // Origin from RV infundibulum
      new THREE.Vector3(0.2, 1.25, 0.55),   // Crosses anterior to aorta
      new THREE.Vector3(-0.15, 1.65, 0.1),  // Bifurcation crest
    ]);
    const pulmonaryGeo = new THREE.TubeGeometry(pulmonaryCurve, 24, 0.32, 18, false);
    pulmonaryMesh = new THREE.Mesh(pulmonaryGeo, pulmonaryMaterial);
    vesselsGroup.add(pulmonaryMesh);

    // Right Pulmonary Artery (runs under arch to right lung)
    const rpaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.15, 1.65, 0.1),
      new THREE.Vector3(0.4, 1.55, -0.15),
      new THREE.Vector3(1.3, 1.45, -0.3),
    ]);
    const rpaGeo = new THREE.TubeGeometry(rpaCurve, 16, 0.22, 16, false);
    const rpaMesh = new THREE.Mesh(rpaGeo, pulmonaryMaterial);
    vesselsGroup.add(rpaMesh);

    // Left Pulmonary Artery (runs to left lung)
    const lpaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.15, 1.65, 0.1),
      new THREE.Vector3(-0.65, 1.5, -0.05),
      new THREE.Vector3(-1.25, 1.35, -0.2),
    ]);
    const lpaGeo = new THREE.TubeGeometry(lpaCurve, 16, 0.22, 16, false);
    const lpaMesh = new THREE.Mesh(lpaGeo, pulmonaryMaterial);
    vesselsGroup.add(lpaMesh);

    // --- SUPERIOR VENA CAVA (SVC) ---
    const svcCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.15, 2.2, -0.15),
      new THREE.Vector3(1.1, 1.4, -0.15),
      new THREE.Vector3(1.05, 0.85, -0.15),
    ]);
    const svcGeo = new THREE.TubeGeometry(svcCurve, 16, 0.28, 18, false);
    svcMesh = new THREE.Mesh(svcGeo, venaCavaMaterial);
    vesselsGroup.add(svcMesh);

    // --- CORONARY ARTERY NETWORK (LAD & Branches) ---
    // 1. LAD (Left Anterior Descending) Artery down the sulcus
    const ladCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.12, 0.75, 1.05),
      new THREE.Vector3(0.18, 0.2, 1.25),
      new THREE.Vector3(0.15, -0.4, 1.2),
      new THREE.Vector3(0.08, -1.1, 0.95),
      new THREE.Vector3(-0.05, -1.8, 0.45), // Tapers into apex
    ]);
    const ladGeo = new THREE.TubeGeometry(ladCurve, 32, 0.055, 10, false);
    const ladMesh = new THREE.Mesh(ladGeo, arteryMaterial);
    coronaryGroup.add(ladMesh);
    coronaryArteries.push(ladMesh);

    // 2. Diagonal Branch 1
    const diag1Curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.16, 0.15, 1.23),
      new THREE.Vector3(-0.35, 0.0, 1.15),
      new THREE.Vector3(-0.75, -0.25, 0.9),
    ]);
    const diag1Geo = new THREE.TubeGeometry(diag1Curve, 16, 0.038, 8, false);
    const diag1Mesh = new THREE.Mesh(diag1Geo, arteryMaterial);
    coronaryGroup.add(diag1Mesh);
    coronaryArteries.push(diag1Mesh);

    // 3. Diagonal Branch 2
    const diag2Curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.12, -0.45, 1.18),
      new THREE.Vector3(-0.25, -0.65, 1.05),
      new THREE.Vector3(-0.55, -0.95, 0.75),
    ]);
    const diag2Geo = new THREE.TubeGeometry(diag2Curve, 16, 0.032, 8, false);
    const diag2Mesh = new THREE.Mesh(diag2Geo, arteryMaterial);
    coronaryGroup.add(diag2Mesh);
    coronaryArteries.push(diag2Mesh);

    // 4. Right Ventricular Branch
    const rvBranchCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.18, 0.2, 1.25),
      new THREE.Vector3(0.55, 0.05, 1.15),
      new THREE.Vector3(0.85, -0.2, 0.9),
    ]);
    const rvBranchGeo = new THREE.TubeGeometry(rvBranchCurve, 16, 0.035, 8, false);
    const rvBranchMesh = new THREE.Mesh(rvBranchGeo, arteryMaterial);
    coronaryGroup.add(rvBranchMesh);
    coronaryArteries.push(rvBranchMesh);

    // 5. Great Cardiac Vein (Blue vein alongside LAD)
    const veinCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.04, 0.8, 1.02),
      new THREE.Vector3(0.09, 0.22, 1.24),
      new THREE.Vector3(0.07, -0.38, 1.19),
      new THREE.Vector3(0.02, -1.05, 0.93),
      new THREE.Vector3(-0.09, -1.75, 0.42),
    ]);
    const veinGeo = new THREE.TubeGeometry(veinCurve, 30, 0.048, 10, false);
    const cardiacVeinMesh = new THREE.Mesh(veinGeo, veinMaterial);
    coronaryGroup.add(cardiacVeinMesh);

    // --- EPICARDIAL ADIPOSE FAT PADS ---
    const fat1Geo = new THREE.DodecahedronGeometry(0.24, 1);
    const fat1 = new THREE.Mesh(fat1Geo, fatMaterial);
    fat1.position.set(0.15, 0.85, 0.95);
    fat1.scale.set(1.4, 0.6, 0.9);
    coronaryGroup.add(fat1);

    const fat2 = new THREE.Mesh(fat1Geo, fatMaterial);
    fat2.position.set(0.18, -0.35, 1.25);
    fat2.scale.set(0.8, 0.5, 0.6);
    coronaryGroup.add(fat2);

    setupOrbitControls();
    window.addEventListener('resize', onWebGLResize, { passive: true });
  }

  function onWebGLResize() {
    if (!renderer || !camera || !webglContainer) return;
    const width = webglContainer.clientWidth || 600;
    const height = webglContainer.clientHeight || 500;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  // --------------------------------------------------------------------------
  // Interactive 360° Mouse & Touch Orbit Engine
  // --------------------------------------------------------------------------
  function setupOrbitControls() {
    const el = webglContainer;
    if (!el) return;

    function onPointerDown(clientX, clientY) {
      state.isDragging = true;
      state.prevPointerX = clientX;
      state.prevPointerY = clientY;
    }

    function onPointerMove(clientX, clientY) {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      state.hoverOffsetX = (clientX - centerX) / (window.innerWidth / 2);
      state.hoverOffsetY = (clientY - centerY) / (window.innerHeight / 2);

      if (!state.isDragging) return;

      const deltaX = clientX - state.prevPointerX;
      const deltaY = clientY - state.prevPointerY;
      state.prevPointerX = clientX;
      state.prevPointerY = clientY;

      // Orbit rotation sensitivity
      state.targetRotY += deltaX * 0.009;
      state.targetRotX += deltaY * 0.009;
      // Clamp pitch to avoid flipping over poles
      state.targetRotX = Math.max(-Math.PI * 0.42, Math.min(Math.PI * 0.42, state.targetRotX));

      updateRotationBadge();
    }

    function onPointerUp() {
      state.isDragging = false;
    }

    // Mouse listeners
    el.addEventListener('mousedown', (e) => {
      onPointerDown(e.clientX, e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
      onPointerMove(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', onPointerUp);

    // Touch listeners
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchend', onPointerUp);

    // Mouse wheel zoom
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY * 0.005;
      state.targetZoom = Math.max(4.2, Math.min(12.0, state.targetZoom + zoomDelta));
    }, { passive: false });

    // Reset Camera Button
    if (resetCameraBtn) {
      resetCameraBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetToAnteriorView();
      });
    }

    // Click on 3D Heart triggers adrenaline burst
    el.addEventListener('click', (e) => {
      const rect = el.getBoundingClientRect();
      const clickX = e.clientX || (rect.left + rect.width / 2);
      const clickY = e.clientY || (rect.top + rect.height / 2);
      triggerAdrenalineSurge(clickX, clickY);
    });
  }

  function resetToAnteriorView() {
    state.targetRotY = 0.15;
    state.targetRotX = 0.08;
    state.targetZoom = 7.2;
    updateRotationBadge();
  }

  function updateRotationBadge() {
    if (!rotationFeedback) return;
    const degY = (state.targetRotY * (180 / Math.PI)) % 360;
    const normDegY = degY > 180 ? degY - 360 : (degY < -180 ? degY + 360 : degY);
    
    if (Math.abs(normDegY) < 15) {
      rotationFeedback.textContent = 'Anterior View (0°)';
    } else if (normDegY >= 15 && normDegY <= 75) {
      rotationFeedback.textContent = `Right Anterolateral (+${normDegY.toFixed(0)}°)`;
    } else if (normDegY > 75 && normDegY < 125) {
      rotationFeedback.textContent = 'Right Lateral View (90°)';
    } else if (Math.abs(normDegY) >= 125) {
      rotationFeedback.textContent = 'Posterior View (180°)';
    } else if (normDegY <= -15 && normDegY >= -75) {
      rotationFeedback.textContent = `Left Anterolateral (${normDegY.toFixed(0)}°)`;
    } else if (normDegY < -75 && normDegY > -125) {
      rotationFeedback.textContent = 'Left Lateral View (-90°)';
    }
  }

  // --------------------------------------------------------------------------
  // Unified 3D & 2D Animation Loop
  // --------------------------------------------------------------------------
  function renderLoop(timestamp) {
    if (!state.lastTimestamp) state.lastTimestamp = timestamp;
    const deltaMs = Math.min(100, timestamp - state.lastTimestamp);
    const deltaSeconds = deltaMs / 1000;
    state.lastTimestamp = timestamp;

    // 1. Draw 2D background ambient dust particles
    if (!state.isReducedMotion) {
      pCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const w = window.innerWidth;
      const h = window.innerHeight;
      for (const p of particles) {
        p.update(w, h, state.mouseX, state.mouseY);
        p.draw(pCtx);
      }
    }

    // 2. Render live sweeping ECG line with real-time speed
    if (!state.isReducedMotion) {
      renderECGLine(deltaSeconds);
    }

    // 3. Render and animate Real 3D Heart in WebGL
    if (renderer && scene && camera && heartRoot) {
      // Lerp camera zoom
      state.currentZoom += (state.targetZoom - state.currentZoom) * 0.08;
      camera.position.z = state.currentZoom;

      // Lerp 3D rotation with subtle hover parallax look-at
      const hoverY = state.isDragging ? 0 : state.hoverOffsetX * 0.15;
      const hoverX = state.isDragging ? 0 : -state.hoverOffsetY * 0.12;

      state.currentRotY += (state.targetRotY + hoverY - state.currentRotY) * 0.08;
      state.currentRotX += (state.targetRotX + hoverX - state.currentRotX) * 0.08;

      heartRoot.rotation.y = state.currentRotY;
      heartRoot.rotation.x = state.currentRotX;

      // 4. Physiological Helical Torsion & Systolic Contraction
      if (!state.isReducedMotion) {
        const phase = state.cyclePhase;
        let systolicCompression = 0;
        let torsionAngle = 0;

        // Ventricular systole contraction (ejection curve)
        if (phase >= 0.26 && phase < 0.42) {
          const t = (phase - 0.26) / 0.16;
          systolicCompression = Math.sin(t * Math.PI);
          // Helical torsion: apex twists relative to base
          torsionAngle = Math.sin(t * Math.PI) * 0.12;
        } else if (phase >= 0.42 && phase < 0.55) {
          // Viscoelastic recoil & early filling
          const t = (phase - 0.42) / 0.13;
          systolicCompression = Math.sin((1 - t) * (Math.PI / 2)) * 0.25;
          torsionAngle = -Math.sin(t * Math.PI) * 0.03;
        }

        // Apply 3D scale compression (ventricles contract radially and longitudinally)
        if (ventriclesGroup) {
          const sx = 1.0 - systolicCompression * 0.09;
          const sy = 1.0 - systolicCompression * 0.06;
          const sz = 1.0 - systolicCompression * 0.09;
          ventriclesGroup.scale.set(sx, sy, sz);

          // Helical wringing torsion
          if (lvMesh) {
            lvMesh.rotation.y = torsionAngle;
          }
        }

        // Aorta Windkessel expansion during peak systolic ejection
        if (aortaMesh) {
          const aortaExpansion = 1.0 + systolicCompression * 0.065;
          aortaMesh.scale.set(aortaExpansion, aortaExpansion, aortaExpansion);
        }

        // Coronary artery blood surge pulse
        if (arteryMaterial) {
          arteryMaterial.emissiveIntensity = 0.85 + systolicCompression * 1.6;
        }
      }

      renderer.render(scene, camera);
    }

    state.animationFrameId = requestAnimationFrame(renderLoop);
  }

  // --------------------------------------------------------------------------
  // Click Interaction: Adrenaline Cardiac Surge
  // --------------------------------------------------------------------------
  function triggerAdrenalineSurge(originX, originY) {
    if (state.isReducedMotion) return;

    const surgeBPM = Math.min(175, state.baseBPM + 48);
    updateBPM(surgeBPM);

    clearTimeout(state.adrenalineTimer);
    state.adrenalineTimer = setTimeout(() => {
      updateBPM(state.baseBPM);
    }, 3200);

    const sparkCount = 8;
    const icons = ['✦', '✨', '⚡', '❤️'];

    for (let i = 0; i < sparkCount; i++) {
      const spark = document.createElement('span');
      spark.className = 'click-spark';
      spark.textContent = icons[Math.floor(Math.random() * icons.length)];

      const angle = (Math.PI * 2 / sparkCount) * i + (Math.random() * 0.4 - 0.2);
      const distance = Math.random() * 85 + 55;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance;
      const rot = (Math.random() * 50 - 25) + 'deg';

      spark.style.left = `${originX}px`;
      spark.style.top = `${originY}px`;
      spark.style.setProperty('--tx', `${tx}px`);
      spark.style.setProperty('--ty', `${ty}px`);
      spark.style.setProperty('--rot', rot);

      document.body.appendChild(spark);

      spark.addEventListener('animationend', () => {
        spark.remove();
      });
    }
  }

  // Initialize Real 3D Heart
  initReal3DHeart();

  // Start Animation Loop
  state.animationFrameId = requestAnimationFrame(renderLoop);

  // Tab visibility power-saving
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(state.animationFrameId);
    } else {
      state.lastTimestamp = performance.now();
      state.animationFrameId = requestAnimationFrame(renderLoop);
    }
  });

})();
