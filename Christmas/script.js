import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- 全局变量 ---
let scene, camera, renderer, composer;
let treeGroup, treePoints, ornamentPoints, starMesh;
let snowSystem, snowGeo;
let trailParticles = [];
let heartParticles = [];
let clock = new THREE.Clock();

// 状态管理
const state = {
    wind: 0,
    timeScale: 1.0,
    cursor: new THREE.Vector3(9999, 9999, 9999),
    isFist: false,
    handDetected: false,
    starActive: false,
    rainbowMode: false,
    blizzardMode: false,
    bgmPlaying: false,
    lastGesture: 'None',
    treeScale: 1.0, // 树的大小
    themeIndex: 0 // 配色主题
};

const THEMES = [
    { name: "Classic", colors: [0x2ecc71, 0xf1c40f, 0xe74c3c] }, // 绿树金红
    { name: "Frozen", colors: [0x3498db, 0xffffff, 0xaed6f1] }, // 蓝白冰雪
    { name: "Mystic", colors: [0x9b59b6, 0xe91e63, 0x00bcd4] }  // 紫粉青幻彩
];

// UI 元素
const videoElement = document.getElementById('input_video');
const loadingElement = document.getElementById('loading');
const feedbackElement = document.getElementById('status-feedback');

// --- 音效管理器 (增强版) ---
class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.gain.value = 0.5;

        this.isBgmPlaying = false;
        
        // Jingle Bells 简谱
        this.melody = [
            {n: 'E4', d: 0.25}, {n: 'E4', d: 0.25}, {n: 'E4', d: 0.5},
            {n: 'E4', d: 0.25}, {n: 'E4', d: 0.25}, {n: 'E4', d: 0.5},
            {n: 'E4', d: 0.25}, {n: 'G4', d: 0.25}, {n: 'C4', d: 0.35}, {n: 'D4', d: 0.15}, {n: 'E4', d: 1.0},
            {n: 'F4', d: 0.25}, {n: 'F4', d: 0.25}, {n: 'F4', d: 0.35}, {n: 'F4', d: 0.15},
            {n: 'F4', d: 0.25}, {n: 'E4', d: 0.25}, {n: 'E4', d: 0.25}, {n: 'E4', d: 0.15}, {n: 'E4', d: 0.1},
            {n: 'E4', d: 0.25}, {n: 'D4', d: 0.25}, {n: 'D4', d: 0.25}, {n: 'E4', d: 0.25}, {n: 'D4', d: 0.5}, {n: 'G4', d: 0.5}
        ];
        this.noteFreqs = {
            'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88
        };
        this.bgmTimer = null;
        this.currentNoteIndex = 0;
    }

    resumeContext() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playTone(freq, duration, type = 'sine', vol = 0.1) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playEffect(type) {
        this.resumeContext();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.masterGain);

        switch(type) {
            case 'magic': // 召唤星星
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(500, now);
                osc.frequency.linearRampToValueAtTime(1500, now + 0.5);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0, now + 1.0);
                osc.start();
                osc.stop(now + 1.0);
                break;
            case 'wind': // 暴风雪
                // 模拟风声比较复杂，这里用低频震荡
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(100, now);
                osc.frequency.exponentialRampToValueAtTime(50, now + 1.0);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.linearRampToValueAtTime(0, now + 1.0);
                osc.start();
                osc.stop(now + 1.0);
                break;
            case 'switch': // 切换模式
                osc.type = 'square';
                osc.frequency.setValueAtTime(880, now);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start();
                osc.stop(now + 0.1);
                break;
            case 'grow': // 树生长
                osc.type = 'sine';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.linearRampToValueAtTime(400, now + 0.3);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start();
                osc.stop(now + 0.3);
                break;
        }
    }

    toggleBGM() {
        this.resumeContext();
        if (this.isBgmPlaying) {
            this.stopBGM();
        } else {
            this.startBGM();
        }
        return this.isBgmPlaying;
    }

    startBGM() {
        if (this.isBgmPlaying) return;
        this.isBgmPlaying = true;
        this.currentNoteIndex = 0;
        this.playNextNote();
    }

    stopBGM() {
        this.isBgmPlaying = false;
        clearTimeout(this.bgmTimer);
    }

    playNextNote() {
        if (!this.isBgmPlaying) return;
        const note = this.melody[this.currentNoteIndex];
        const freq = this.noteFreqs[note.n];
        this.playTone(freq, note.d * 0.8, 'sine', 0.1);
        const durationMs = note.d * 500;
        this.bgmTimer = setTimeout(() => {
            this.currentNoteIndex = (this.currentNoteIndex + 1) % this.melody.length;
            this.playNextNote();
        }, durationMs);
    }
}

const soundManager = new SoundManager();


// --- 初始化入口 ---
init();
initMediaPipe();
animate();

function init() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020111, 0.002);
    scene.background = new THREE.Color(0x020111);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    updateCameraPosition(); // 根据屏幕比例设置相机位置

    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('output_canvas'),
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Post-processing
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.15; // 降低阈值让更多物体发光
    bloomPass.strength = 1.5;
    bloomPass.radius = 0.5;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
    
    // UI 交互：折叠指令面板
    const panelHeader = document.getElementById('panel-header');
    const panel = document.getElementById('instruction-panel');
    if(panelHeader && panel) {
        panelHeader.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
        });
        
        // 移动端默认折叠
        if (window.innerWidth < 768) {
            panel.classList.add('collapsed');
        }
    }

    // Objects
    createEnhancedTree(); // 全新升级的树
    createStar();
    createSnow();
    createForestBackground();

    window.addEventListener('resize', onWindowResize);
}

function updateCameraPosition() {
    const aspect = window.innerWidth / window.innerHeight;
    if (aspect < 1.0) {
        // 竖屏模式 (手机)
        camera.position.set(0, 15, 45); // 拉远相机
        camera.lookAt(0, 8, 0);
    } else {
        // 横屏模式 (PC)
        camera.position.set(0, 10, 30);
        camera.lookAt(0, 5, 0);
    }
}

// --- 升级版圣诞树 ---
function createEnhancedTree() {
    if (treeGroup) scene.remove(treeGroup);
    treeGroup = new THREE.Group();
    scene.add(treeGroup);

    const theme = THEMES[state.themeIndex];

    // 1. 树叶 (Volumetric Layered Pine)
    const foliageCount = 6000; // 增加密度
    const foliageGeo = new THREE.BufferGeometry();
    const foliagePos = [];
    const foliageCol = [];
    const colorGreen = new THREE.Color(theme.colors[0]);
    const colorDarkGreen = new THREE.Color(0x0f3d1e); // 深色阴影

    for (let i = 0; i < foliageCount; i++) {
        // 使用多层结构模拟真实树枝
        const layerCount = 12;
        const layer = Math.floor(Math.random() * layerCount);
        const t = layer / layerCount; // 0 (bottom) to 1 (top)
        
        // 每一层是一个圆锥台
        const layerHeight = 20 / layerCount;
        const yBase = layer * layerHeight;
        const y = yBase + Math.random() * layerHeight * 1.5; // 稍微重叠
        
        // 树的整体轮廓
        const maxR = 9 * (1 - y / 22); 
        
        // 分形/分瓣效果 (Lobed shape)
        const angle = Math.random() * Math.PI * 2;
        const lobeFreq = 5 + Math.floor(y / 5); // 顶部瓣数少，底部多
        const lobe = Math.cos(angle * lobeFreq);
        
        // 半径计算：基础半径 + 瓣状突出 + 随机扰动
        const r = maxR * (0.6 + 0.3 * lobe + 0.1 * Math.random()) * Math.sqrt(Math.random()); // sqrt分布让外部更密

        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        
        foliagePos.push(x, y, z);
        
        // 颜色深度变化：内部/底部更暗
        const depth = r / maxR; // 0 (inner) to 1 (outer)
        const mixFactor = depth * 0.8 + Math.random() * 0.2;
        const c = colorDarkGreen.clone().lerp(colorGreen, mixFactor);
        
        // 偶尔加点亮色嫩芽
        if (Math.random() > 0.9) c.addScalar(0.1);

        foliageCol.push(c.r, c.g, c.b);
    }
    foliageGeo.setAttribute('position', new THREE.Float32BufferAttribute(foliagePos, 3));
    foliageGeo.setAttribute('color', new THREE.Float32BufferAttribute(foliageCol, 3));
    
    // 使用松针纹理
    const foliageMat = new THREE.PointsMaterial({ 
        size: 0.8, 
        vertexColors: true, 
        map: new THREE.CanvasTexture(generatePineTexture()),
        alphaTest: 0.1,
        transparent: true,
        depthWrite: false, // 避免遮挡问题，增加蓬松感
        blending: THREE.NormalBlending // 改用正常混合，更有实体感
    });
    const foliage = new THREE.Points(foliageGeo, foliageMat);
    treeGroup.add(foliage);

    // 2. 装饰彩灯 (Spiral Ornaments)
    const ornamentCount = 500; // 增加数量
    const ornamentGeo = new THREE.BufferGeometry();
    const ornamentPos = [];
    const ornamentCol = [];
    const colorGold = new THREE.Color(theme.colors[1]);
    const colorRed = new THREE.Color(theme.colors[2]);

    for (let i = 0; i < ornamentCount; i++) {
        const t = i / ornamentCount;
        const y = t * 20; // 高度分布
        
        // 改进的螺旋分布，更自然
        const angle = t * Math.PI * 30 + Math.random(); 
        const rBase = 9 * (1 - y / 21); // 略微收缩
        // 贴合树的起伏
        const lobe = Math.cos(angle * 5); 
        const radius = rBase * (0.8 + 0.15 * lobe) + 0.2; // 浮在树叶表面

        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        ornamentPos.push(x, y, z);

        const c = Math.random() > 0.6 ? colorGold : colorRed;
        ornamentCol.push(c.r, c.g, c.b);
    }
    ornamentGeo.setAttribute('position', new THREE.Float32BufferAttribute(ornamentPos, 3));
    ornamentGeo.setAttribute('color', new THREE.Float32BufferAttribute(ornamentCol, 3));
    
    // 使用圆形光点贴图
    const ornamentMat = new THREE.PointsMaterial({ 
        size: 0.6, 
        vertexColors: true, 
        blending: THREE.AdditiveBlending,
        map: new THREE.CanvasTexture(generateLightTexture()),
        transparent: true,
        alphaTest: 0.1
    });
    ornamentPoints = new THREE.Points(ornamentGeo, ornamentMat);
    treeGroup.add(ornamentPoints);
}

function generateLightTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
    return canvas;
}

function generatePineTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    ctx.translate(32, 32);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    
    // 绘制松针簇
    const count = 12;
    for(let i=0; i<count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const len = 15 + Math.random() * 15;
        
        ctx.beginPath();
        ctx.moveTo(0,0);
        ctx.lineTo(Math.cos(angle)*len, Math.sin(angle)*len);
        ctx.stroke();
    }
    
    // 柔和中心
    const grad = ctx.createRadialGradient(0,0,0, 0,0,15);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-32,-32,64,64);
    
    return canvas;
}

function updateTreeTheme() {
    state.themeIndex = (state.themeIndex + 1) % THEMES.length;
    createEnhancedTree(); // 重建树
    
    // 同时改变星光颜色
    // const theme = THEMES[state.themeIndex];
    // if(starMesh) starMesh.material.color.setHex(theme.colors[1]);
}

function createStar() {
    const geometry = new THREE.OctahedronGeometry(1, 0);
    const material = new THREE.MeshBasicMaterial({ color: 0xffff88 });
    starMesh = new THREE.Mesh(geometry, material);
    starMesh.position.set(0, 20.5, 0); // 调整高度
    starMesh.scale.set(0.3, 0.3, 0.3); // 默认大小
    scene.add(starMesh);
    
    // 星星光晕
    const spriteMat = new THREE.SpriteMaterial({ 
        map: new THREE.CanvasTexture(generateSprite()), 
        color: 0xffff00, 
        transparent: true, 
        blending: THREE.AdditiveBlending 
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(5, 5, 1);
    starMesh.add(sprite);
}

function generateSprite() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,0,0.5)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    return canvas;
}

function createSnow() {
    const particleCount = 2000;
    snowGeo = new THREE.BufferGeometry();
    const positions = [];
    const velocities = [];
    const colors = [];
    const baseColor = new THREE.Color(0xffffff);

    for (let i = 0; i < particleCount; i++) {
        const x = (Math.random() - 0.5) * 80; // 扩大范围
        const y = Math.random() * 50;
        const z = (Math.random() - 0.5) * 60;
        positions.push(x, y, z);
        velocities.push(0, -0.1 - Math.random() * 0.1, 0);
        colors.push(baseColor.r, baseColor.g, baseColor.b);
    }

    snowGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    snowGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    snowGeo.userData = { velocities: velocities };

    // 使用自定义雪花贴图
    const material = new THREE.PointsMaterial({
        size: 0.8,
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        map: new THREE.CanvasTexture(generateSnowflakeTexture()),
        alphaTest: 0.05
    });

    snowSystem = new THREE.Points(snowGeo, material);
    scene.add(snowSystem);
}

function generateSnowflakeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    
    ctx.translate(16, 16);
    
    // 绘制六角雪花
    for(let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -14);
        ctx.stroke();
        
        // 分叉
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(-4, -12);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(4, -12);
        ctx.stroke();
        
        ctx.rotate(Math.PI / 3);
    }
    
    // 中间加个柔和光晕，避免太生硬
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 8);
    gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(-16, -16, 32, 32);

    return canvas;
}

function createForestBackground() {
    // Ground
    // 使用 StandardMaterial 接收光照
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshStandardMaterial({ 
        color: 0x111122, 
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    scene.add(ground);
    
    // 环境光 (稍微调暗，让点光源更明显)
    const ambientLight = new THREE.AmbientLight(0x404060, 0.5); 
    scene.add(ambientLight);
    
    // 树顶星光 (照亮树和地面)
    const starLight = new THREE.PointLight(0xffaa33, 2, 60);
    starLight.position.set(0, 20, 0);
    starLight.castShadow = false; // 性能考虑不开启阴影
    scene.add(starLight);
    
    // 补光 (照亮树的暗部)
    const fillLight = new THREE.PointLight(0xccccff, 0.8, 50);
    fillLight.position.set(10, 10, 10);
    scene.add(fillLight);
}

// --- MediaPipe ---
function initMediaPipe() {
    // 替换为 Cloudflare CDN 源 unpkg.com
    const hands = new Hands({locateFile: (file) => `https://unpkg.com/@mediapipe/hands/${file}`});
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0, // 移动端优化：使用 Lite 模型
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    hands.onResults(onHandsResults);

    const cameraUtils = new Camera(videoElement, {
        onFrame: async () => await hands.send({image: videoElement}),
        width: 640, height: 480
    });
    cameraUtils.start()
        .then(() => loadingElement.style.display = 'none')
        .catch(err => console.error(err));
}

function distance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

let gestureLock = false;

function onHandsResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        state.handDetected = true;
        const landmarks = results.multiHandLandmarks[0];
        const wrist = landmarks[0];
        const tips = [4, 8, 12, 16, 20].map(i => landmarks[i]);
        const pips = [2, 6, 10, 14, 18].map(i => landmarks[i]);

        updateCursorPosition(landmarks[8]);
        updateWind(landmarks);

        // 手指伸直判断
        const isExtended = [0,1,2,3,4].map(i => {
            if (i===0) return distance(tips[0], landmarks[17]) > 0.15; // 拇指
            return distance(tips[i], wrist) > distance(pips[i], wrist) * 1.1;
        });

        const distThumbIndex = distance(tips[0], tips[1]);

        let currentGesture = "None";

        // 识别逻辑
        if (!isExtended[1] && !isExtended[2] && !isExtended[3] && !isExtended[4]) currentGesture = "Fist";
        else if (distThumbIndex < 0.05 && isExtended[2] && isExtended[3] && isExtended[4]) currentGesture = "OK";
        // Victory
        else if (isExtended[1] && isExtended[2] && !isExtended[3] && !isExtended[4]) currentGesture = "Victory";
        // Shaka (666): 拇指小指伸直，中间弯曲 (放在 SpiderMan 前面判断)
        else if (isExtended[0] && isExtended[4] && !isExtended[1] && !isExtended[2] && !isExtended[3]) currentGesture = "Shaka";
        // Point: 仅食指伸直
        else if (isExtended[1] && !isExtended[0] && !isExtended[2] && !isExtended[3] && !isExtended[4]) currentGesture = "Point";
        // Thumbs Up: 拇指伸直，其他弯曲
        else if (isExtended[0] && !isExtended[1] && !isExtended[2] && !isExtended[3] && !isExtended[4]) currentGesture = "ThumbsUp";
        // Shaka (666): 拇指小指伸直，中间弯曲
        else if (isExtended[0] && isExtended[4] && !isExtended[1] && !isExtended[2] && !isExtended[3]) currentGesture = "Shaka";
        // Point: 仅食指伸直
        else if (isExtended[1] && !isExtended[0] && !isExtended[2] && !isExtended[3] && !isExtended[4]) currentGesture = "Point";
        // Love (ILY): 拇指、食指、小指伸直
        else if (isExtended[0] && isExtended[1] && isExtended[4] && !isExtended[2] && !isExtended[3]) currentGesture = "Love";
        else if (isExtended[1] && isExtended[2] && isExtended[3] && isExtended[4]) currentGesture = "Open";

        if (currentGesture !== state.lastGesture && !gestureLock) {
            // Point 手势不需要锁定，因为它需要持续交互
            if (currentGesture !== "Point") {
                handleGestureAction(currentGesture);
                state.lastGesture = currentGesture;
                gestureLock = true;
                setTimeout(() => gestureLock = false, 800);
            } else {
                state.lastGesture = currentGesture; // 允许 Point 状态切换但不触发 Action
            }
        }
        
        state.isFist = (currentGesture === "Fist");
        
        // 处理持续性手势效果
        if (currentGesture === "Point") {
            updateMagicTrail(state.cursor);
        }
        if (currentGesture === "Love") {
            if (Math.random() > 0.8) spawnHeart(state.cursor);
        }
    } else {
        state.handDetected = false;
        state.wind *= 0.95;
        state.isFist = false;
        state.cursor.set(9999, 9999, 9999);
        state.lastGesture = "None";
        showFeedback("");
    }
}

function handleGestureAction(gesture) {
    switch (gesture) {
        case "Victory":
            state.rainbowMode = !state.rainbowMode;
            soundManager.playEffect('switch');
            showFeedback(state.rainbowMode ? "🌈 彩虹模式" : "❄️ 纯净模式");
            break;
        case "OK":
            const playing = soundManager.toggleBGM();
            showFeedback(playing ? "🎵 播放音乐" : "🔇 暂停音乐");
            break;
        case "SpiderMan":
            state.blizzardMode = true;
            soundManager.playEffect('wind');
            showFeedback("🌪️ 暴风雪!");
            setTimeout(() => { state.blizzardMode = false; }, 2000);
            break;
        case "Open":
            if (!state.starActive) triggerStarAnimation();
            break;
        case "Fist":
            showFeedback("⏳ 时间静止");
            break;
        case "ThumbsUp":
            // 树变大/充能特效
            soundManager.playEffect('grow');
            showFeedback("👍 圣树充能");
            gsap.to(treeGroup.scale, { x: 1.2, y: 1.2, z: 1.2, duration: 0.5, yoyo: true, repeat: 1 });
            break;
        case "Shaka":
            // 切换主题
            soundManager.playEffect('switch');
            updateTreeTheme();
            showFeedback(`🎨 主题: ${THEMES[state.themeIndex].name}`);
            break;
        case "Love":
            showFeedback("❤️ 圣诞快乐");
            soundManager.playEffect('magic');
            break;
    }
}

function showFeedback(text) {
    if (!text) { feedbackElement.classList.remove('active'); return; }
    feedbackElement.innerText = text;
    feedbackElement.classList.add('active');
    setTimeout(() => { if(feedbackElement.innerText === text) feedbackElement.classList.remove('active'); }, 2000);
}

let lastHandX = 0;
function updateWind(landmarks) {
    const wrist = landmarks[0];
    const velocity = (wrist.x - lastHandX) * 50;
    lastHandX = wrist.x;
    if (state.lastGesture === "Open") state.wind += (velocity * -0.5 - state.wind) * 0.1;
    if (state.blizzardMode) state.wind = 5.0;
}

function updateCursorPosition(landmark) {
    const vector = new THREE.Vector3((1 - landmark.x) * 2 - 1, -(landmark.y) * 2 + 1, 0.5);
    vector.unproject(camera);
    const dir = vector.sub(camera.position).normalize();
    const targetZ = 5;
    const distToPlane = (targetZ - camera.position.z) / dir.z;
    state.cursor.copy(camera.position.clone().add(dir.multiplyScalar(distToPlane)));
}

function triggerStarAnimation() {
    state.starActive = true;
    soundManager.playEffect('magic');
    showFeedback("✨ 伯利恒之星");
    
    gsap.to(starMesh.scale, { x: 1.5, y: 1.5, z: 1.5, duration: 1, ease: "elastic.out(1, 0.3)" });
    gsap.to(starMesh.rotation, { y: Math.PI * 4, duration: 2, ease: "power2.out" });
    
    // 爆发粒子特效 (简单模拟：让装饰灯闪烁)
    if(ornamentPoints) ornamentPoints.material.size = 1.0;

    setTimeout(() => {
        gsap.to(starMesh.scale, { x: 0.3, y: 0.3, z: 0.3, duration: 0.5 });
        if(ornamentPoints) ornamentPoints.material.size = 0.5;
        state.starActive = false;
    }, 3000);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (treeGroup) treeGroup.rotation.y += 0.005;
    if (starMesh) starMesh.rotation.y += 0.02;

    updateSnow();
    updateOrnaments();
    updateTrailParticles();
    updateHearts();
    
    composer.render();
}

function updateSnow() {
    if (!snowSystem) return;
    const positions = snowGeo.attributes.position.array;
    const colors = snowGeo.attributes.color.array;
    const velocities = snowGeo.userData.velocities;
    const timeSpeed = state.isFist ? 0.05 : 1.0;
    const windForce = state.wind;

    for (let i = 0; i < 2000; i++) {
        const idx = i * 3;
        positions[idx] += (velocities[idx] + windForce * 0.5) * timeSpeed;
        positions[idx + 1] += (velocities[idx + 1] * (state.blizzardMode ? 5 : 1)) * timeSpeed;
        positions[idx + 2] += velocities[idx + 2] * timeSpeed;

        if (state.rainbowMode) {
            const time = Date.now() * 0.001;
            const c = new THREE.Color().setHSL((time + positions[idx + 1] * 0.02) % 1.0, 1.0, 0.5);
            colors[idx] = c.r; colors[idx + 1] = c.g; colors[idx + 2] = c.b;
        }
        
        if (positions[idx + 1] < 0) {
            positions[idx + 1] = 50;
            positions[idx] = (Math.random() - 0.5) * 80;
            positions[idx + 2] = (Math.random() - 0.5) * 60;
        }
    }
    snowGeo.attributes.position.needsUpdate = true;
    if (state.rainbowMode) snowGeo.attributes.color.needsUpdate = true;
}

// --- 新增特效逻辑 ---

function updateOrnaments() {
    if (!ornamentPoints) return;
    const colors = ornamentPoints.geometry.attributes.color.array;
    const time = Date.now() * 0.005;
    
    // 随机闪烁
    for(let i = 0; i < colors.length; i+=3) {
        if(Math.random() > 0.98) {
            const flicker = 0.5 + Math.sin(time + i) * 0.5;
            // 保持原有色调，只改变亮度
            // 简单处理：偶尔变白
            if(Math.random() > 0.95) {
                colors[i] = 1; colors[i+1] = 1; colors[i+2] = 1;
            } else {
                const theme = THEMES[state.themeIndex];
                const c = new THREE.Color(i % 2 === 0 ? theme.colors[1] : theme.colors[2]);
                colors[i] = c.r * flicker;
                colors[i+1] = c.g * flicker;
                colors[i+2] = c.b * flicker;
            }
        }
    }
    ornamentPoints.geometry.attributes.color.needsUpdate = true;
}

function updateMagicTrail(pos) {
    // 在指尖位置生成粒子
    for(let i=0; i<3; i++) {
        const particle = {
            pos: pos.clone().add(new THREE.Vector3((Math.random()-0.5)*0.5, (Math.random()-0.5)*0.5, (Math.random()-0.5)*0.5)),
            vel: new THREE.Vector3((Math.random()-0.5)*0.1, (Math.random()-0.5)*0.1, (Math.random()-0.5)*0.1),
            life: 1.0,
            color: new THREE.Color().setHSL(Math.random(), 1.0, 0.7),
            mesh: null
        };
        
        const geo = new THREE.PlaneGeometry(0.2, 0.2);
        const mat = new THREE.MeshBasicMaterial({
            color: particle.color, 
            transparent: true, 
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(particle.pos);
        mesh.lookAt(camera.position);
        scene.add(mesh);
        
        particle.mesh = mesh;
        trailParticles.push(particle);
    }
}

function updateTrailParticles() {
    for(let i = trailParticles.length - 1; i >= 0; i--) {
        const p = trailParticles[i];
        p.life -= 0.02;
        p.pos.add(p.vel);
        p.mesh.position.copy(p.pos);
        p.mesh.material.opacity = p.life;
        p.mesh.scale.setScalar(p.life);
        p.mesh.lookAt(camera.position);
        
        if(p.life <= 0) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            trailParticles.splice(i, 1);
        }
    }
}

function spawnHeart(pos) {
    const heartShape = new THREE.Shape();
    const x = 0, y = 0;
    heartShape.moveTo( x + 0.25, y + 0.25 );
    heartShape.bezierCurveTo( x + 0.25, y + 0.25, x + 0.20, y, x, y );
    heartShape.bezierCurveTo( x - 0.30, y, x - 0.30, y + 0.35, x - 0.30, y + 0.35 );
    heartShape.bezierCurveTo( x - 0.30, y + 0.55, x - 0.10, y + 0.77, x + 0.25, y + 0.95 );
    heartShape.bezierCurveTo( x + 0.60, y + 0.77, x + 0.80, y + 0.55, x + 0.80, y + 0.35 );
    heartShape.bezierCurveTo( x + 0.80, y + 0.35, x + 0.80, y, x + 0.50, y );
    heartShape.bezierCurveTo( x + 0.35, y, x + 0.25, y + 0.25, x + 0.25, y + 0.25 );

    const geometry = new THREE.ShapeGeometry( heartShape );
    const material = new THREE.MeshBasicMaterial( { color: 0xff69b4, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending } );
    const mesh = new THREE.Mesh( geometry, material );
    
    mesh.position.copy(pos);
    mesh.scale.set(0.5, 0.5, 0.5);
    mesh.rotation.z = Math.PI; // 修正心形方向
    scene.add( mesh );
    
    heartParticles.push({
        mesh: mesh,
        vel: new THREE.Vector3((Math.random()-0.5)*0.2, 0.2 + Math.random()*0.2, (Math.random()-0.5)*0.2),
        life: 1.5
    });
}

function updateHearts() {
    for(let i = heartParticles.length - 1; i >= 0; i--) {
        const p = heartParticles[i];
        p.life -= 0.01;
        p.mesh.position.add(p.vel);
        p.mesh.material.opacity = p.life;
        p.mesh.rotation.y += 0.05;
        p.mesh.lookAt(camera.position); // 尽量朝向相机，但保留旋转
        
        if(p.life <= 0) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            heartParticles.splice(i, 1);
        }
    }
}

function onWindowResize() {
    updateCameraPosition();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}
