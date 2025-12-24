import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// 常量定义
const CONFIG = {
    PARTICLE_COUNTS: {
        SNOW: 2000,
        FOLIAGE: 6000,
        ORNAMENTS: 500
    },
    PERFORMANCE: {
        MAX_FPS: 60,
        LOW_FPS_THRESHOLD: 30
    },
    GESTURE: {
        COOLDOWN: 800,
        CONFIDENCE_THRESHOLD: 0.5
    }
};

// 性能监控器
class PerformanceMonitor {
    constructor() {
        this.fps = 0;
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.element = document.getElementById('performance-monitor');
    }

    update() {
        this.frameCount++;
        const currentTime = performance.now();
        if (currentTime >= this.lastTime + 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
            this.frameCount = 0;
            this.lastTime = currentTime;
            this.render();
        }
    }

    render() {
        if (this.element) {
            this.element.textContent = `FPS: ${this.fps}`;
            if (this.fps < CONFIG.PERFORMANCE.LOW_FPS_THRESHOLD) {
                this.element.style.color = '#ff6b6b';
            } else {
                this.element.style.color = '#aaa';
            }
        }
    }
}

// 场景管理器
class SceneManager {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.composer = null;
        this.clock = new THREE.Clock();
        this.init();
    }

    init() {
        this.createScene();
        this.createCamera();
        this.createRenderer();
        this.setupPostProcessing();
        this.setupLighting();
        this.setupEventListeners();
    }

    createScene() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x020111, 0.002);
        this.scene.background = new THREE.Color(0x020111);
    }

    createCamera() {
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.updateCameraPosition();
    }

    createRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('output_canvas'),
            antialias: true,
            powerPreference: 'high-performance'
        });
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    setupPostProcessing() {
        const renderScene = new RenderPass(this.scene, this.camera);
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight), 
            1.5, 0.4, 0.85
        );
        
        bloomPass.threshold = 0.15;
        bloomPass.strength = 1.5;
        bloomPass.radius = 0.5;

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(renderScene);
        this.composer.addPass(bloomPass);
    }

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
        this.scene.add(ambientLight);
        
        const starLight = new THREE.PointLight(0xffaa33, 2, 60);
        starLight.position.set(0, 20, 0);
        this.scene.add(starLight);
        
        const fillLight = new THREE.PointLight(0xccccff, 0.8, 50);
        fillLight.position.set(10, 10, 10);
        this.scene.add(fillLight);
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize());
        
        // 页面可见性变化时暂停/恢复动画
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.clock.stop();
            } else {
                this.clock.start();
            }
        });
    }

    updateCameraPosition() {
        const aspect = window.innerWidth / window.innerHeight;
        if (aspect < 1.0) {
            this.camera.position.set(0, 15, 45);
        } else {
            this.camera.position.set(0, 10, 30);
        }
        this.camera.lookAt(0, 5, 0);
    }

    onWindowResize() {
        this.updateCameraPosition();
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        this.composer.render();
    }
}

// 手势识别器
class GestureRecognizer {
    constructor() {
        this.lastGesture = 'None';
        this.gestureLock = false;
        this.hands = null;
        this.camera = null;
    }

    async init() {
        this.hands = new Hands({
            locateFile: (file) => `https://unpkg.com/@mediapipe/hands/${file}`
        });
        
        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 0,
            minDetectionConfidence: CONFIG.GESTURE.CONFIDENCE_THRESHOLD,
            minTrackingConfidence: CONFIG.GESTURE.CONFIDENCE_THRESHOLD
        });
        
        this.hands.onResults((results) => this.onHandsResults(results));
        
        const videoElement = document.getElementById('input_video');
        this.camera = new Camera(videoElement, {
            onFrame: async () => {
                if (this.hands) {
                    await this.hands.send({ image: videoElement });
                }
            },
            width: 640,
            height: 480
        });
        
        await this.camera.start();
        return this.camera;
    }

    distance(p1, p2) {
        return Math.hypot(p1.x - p2.x, p1.y - p2.y);
    }

    onHandsResults(results) {
        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            AppState.update({ handDetected: false, isFist: false });
            return;
        }

        const landmarks = results.multiHandLandmarks[0];
        const wrist = landmarks[0];
        const tips = [4, 8, 12, 16, 20].map(i => landmarks[i]);
        const pips = [2, 6, 10, 14, 18].map(i => landmarks[i]);

        // 手指伸直判断
        const isExtended = [0, 1, 2, 3, 4].map(i => {
            if (i === 0) return this.distance(tips[0], landmarks[17]) > 0.15;
            return this.distance(tips[i], wrist) > this.distance(pips[i], wrist) * 1.1;
        });

        const gesture = this.recognizeGesture(isExtended, tips, wrist);
        this.handleGesture(gesture, landmarks);
    }

    recognizeGesture(isExtended, tips, wrist) {
        const distThumbIndex = this.distance(tips[0], tips[1]);

        if (!isExtended[1] && !isExtended[2] && !isExtended[3] && !isExtended[4]) return "Fist";
        if (distThumbIndex < 0.05 && isExtended[2] && isExtended[3] && isExtended[4]) return "OK";
        if (isExtended[1] && isExtended[2] && !isExtended[3] && !isExtended[4]) return "Victory";
        if (isExtended[0] && isExtended[4] && !isExtended[1] && !isExtended[2] && !isExtended[3]) return "Shaka";
        if (isExtended[1] && !isExtended[0] && !isExtended[2] && !isExtended[3] && !isExtended[4]) return "Point";
        if (isExtended[0] && !isExtended[1] && !isExtended[2] && !isExtended[3] && !isExtended[4]) return "ThumbsUp";
        if (isExtended[0] && isExtended[1] && isExtended[4] && !isExtended[2] && !isExtended[3]) return "Love";
        if (isExtended[1] && isExtended[2] && isExtended[3] && isExtended[4]) return "Open";
        
        return "None";
    }

    handleGesture(gesture, landmarks) {
        AppState.update({ handDetected: true, isFist: gesture === "Fist" });

        if (gesture !== this.lastGesture && !this.gestureLock) {
            if (gesture !== "Point") {
                GestureHandler.handle(gesture);
                this.lastGesture = gesture;
                this.gestureLock = true;
                setTimeout(() => this.gestureLock = false, CONFIG.GESTURE.COOLDOWN);
            } else {
                this.lastGesture = gesture;
            }
        }

        // 处理持续性手势
        if (gesture === "Point") {
            EffectsManager.updateMagicTrail(AppState.cursor);
        }
        if (gesture === "Love" && Math.random() > 0.8) {
            EffectsManager.spawnHeart(AppState.cursor);
        }
    }
}

// 应用状态管理
class AppState {
    static state = {
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
        treeScale: 1.0,
        themeIndex: 0
    };

    static THEMES = [
        { name: "Classic", colors: [0x2ecc71, 0xf1c40f, 0xe74c3c] },
        { name: "Frozen", colors: [0x3498db, 0xffffff, 0xaed6f1] },
        { name: "Mystic", colors: [0x9b59b6, 0xe91e63, 0x00bcd4] }
    ];

    static update(newState) {
        this.state = { ...this.state, ...newState };
    }

    static get currentTheme() {
        return this.THEMES[this.state.themeIndex];
    }
}

// 手势处理器
class GestureHandler {
    static handle(gesture) {
        switch (gesture) {
            case "Victory":
                AppState.update({ rainbowMode: !AppState.state.rainbowMode });
                SoundManager.playEffect('switch');
                UI.showFeedback(AppState.state.rainbowMode ? "🌈 彩虹模式" : "❄️ 纯净模式");
                break;
            case "OK":
                const playing = SoundManager.toggleBGM();
                UI.showFeedback(playing ? "🎵 播放音乐" : "🔇 暂停音乐");
                break;
            case "Open":
                if (!AppState.state.starActive) EffectsManager.triggerStarAnimation();
                break;
            case "Fist":
                UI.showFeedback("⏳ 时间静止");
                break;
            case "ThumbsUp":
                SoundManager.playEffect('grow');
                UI.showFeedback("👍 圣树充能");
                EffectsManager.growTree();
                break;
            case "Shaka":
                SoundManager.playEffect('switch');
                EffectsManager.updateTreeTheme();
                UI.showFeedback(`🎨 主题: ${AppState.currentTheme.name}`);
                break;
            case "Love":
                UI.showFeedback("❤️ 圣诞快乐");
                SoundManager.playEffect('magic');
                break;
        }
    }
}

// 初始化应用
class ChristmasMagicApp {
    constructor() {
        this.performanceMonitor = new PerformanceMonitor();
        this.sceneManager = new SceneManager();
        this.gestureRecognizer = new GestureRecognizer();
        this.isInitialized = false;
    }

    async init() {
        try {
            UI.showLoading(true);
            
            // 初始化各个模块
            await this.gestureRecognizer.init();
            EffectsManager.init(this.sceneManager.scene, this.sceneManager.camera);
            
            // 设置UI交互
            this.setupUI();
            
            this.isInitialized = true;
            UI.showLoading(false);
            
            // 开始动画循环
            this.animate();
            
        } catch (error) {
            console.error('初始化失败:', error);
            UI
