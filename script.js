class MediaPipeHandTracker {
    constructor() {
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.hands = null;
        this.camera = null;
        
        // Performance monitoring
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 0;
        
        // State tracking
        this.currentHands = [];
        this.isInitialized = false;
        
        // NEW: Gesture detection state
        this.gestureState = {
            detected: false,
            confidence: 0,
            metrics: null,
            lastUpdate: Date.now()
        };
        
        // NEW: Particle system integration
        this.particleSystem = null; // Will be initialized after canvas setup
        
        // MediaPipe Hand Landmark Color Mapping
        // Each landmark represents a specific anatomical point on the hand
        // Colors are grouped by finger for intuitive visual identification
        this.landmarkColors = {
            // WRIST (Central anchor point - all fingers connect here)
            0: '#FF0000',  // Wrist center - Red
            
            // THUMB (4 joints from base to tip - Orange family)
            1: '#FF8C00',  // Thumb base (metacarpal-phalangeal joint)
            2: '#FF8C00',  // Thumb middle (proximal interphalangeal joint)  
            3: '#FF8C00',  // Thumb tip (distal interphalangeal joint)
            4: '#FF8C00',  // Thumb nail (finger tip)
            
            // INDEX FINGER (4 joints from knuckle to tip - Yellow family)
            5: '#FFD700',  // Index base (metacarpal-phalangeal joint)
            6: '#FFD700',  // Index middle (proximal interphalangeal joint)
            7: '#FFD700',  // Index tip (distal interphalangeal joint)
            8: '#FFD700',  // Index nail (finger tip)
            
            // MIDDLE FINGER (4 joints from knuckle to tip - Green family)
            9: '#32CD32',  // Middle base (metacarpal-phalangeal joint)
            10: '#32CD32', // Middle middle (proximal interphalangeal joint)
            11: '#32CD32', // Middle tip (distal interphalangeal joint)
            12: '#32CD32', // Middle nail (finger tip)
            
            // RING FINGER (4 joints from knuckle to tip - Blue family)
            13: '#1E90FF', // Ring base (metacarpal-phalangeal joint)
            14: '#1E90FF', // Ring middle (proximal interphalangeal joint)
            15: '#1E90FF', // Ring tip (distal interphalangeal joint)
            16: '#1E90FF', // Ring nail (finger tip)
            
            // PINKY FINGER (4 joints from knuckle to tip - Purple family)
            17: '#8A2BE2', // Pinky base (metacarpal-phalangeal joint)
            18: '#8A2BE2', // Pinky middle (proximal interphalangeal joint)
            19: '#8A2BE2', // Pinky tip (distal interphalangeal joint)
            20: '#8A2BE2'  // Pinky nail (finger tip)
        };
        
        this.init();
    }

    async init() {
        try {
            this.updateStatus('camera-status', 'Requesting permission...', 'warning');
            await this.setupCamera();
            
            this.updateStatus('camera-status', 'Loading MediaPipe...', 'warning');
            await this.setupMediaPipe();
            
            this.setupCanvas();
            this.setupDebugToggle();
            
            // NEW: Initialize particle system
            this.particleSystem = new ParticleSystem('particle-canvas');
            
            // NEW: Setup testing shortcuts
            this.setupTestingShortcuts();
            
            await this.startDetection();
            
            this.updateStatus('camera-status', 'Ready', 'success');
            this.isInitialized = true;
            
        } catch (error) {
            console.error('Initialization failed:', error);
            this.updateStatus('camera-status', 'Error: ' + error.message, 'error');
            this.showErrorMessage(error);
        }
    }

    async setupCamera() {
        this.video = document.getElementById('video');
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                }
            });
            
            this.video.srcObject = stream;
            
            return new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    resolve();
                };
            });
            
        } catch (error) {
            if (error.name === 'NotAllowedError') {
                throw new Error('Camera permission denied. Please allow camera access and refresh.');
            } else if (error.name === 'NotFoundError') {
                throw new Error('No camera found. Please connect a camera and refresh.');
            } else {
                throw new Error('Camera error: ' + error.message);
            }
        }
    }

    async setupMediaPipe() {
        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        this.hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.5
        });

        this.hands.onResults(this.onResults.bind(this));
    }

    setupCanvas() {
        this.canvas = document.getElementById('landmark-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Resize canvas to match video
        const resizeCanvas = () => {
            const rect = this.video.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
        };
        
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }

    async startDetection() {
        this.camera = new Camera(this.video, {
            onFrame: async () => {
                if (this.hands) {
                    await this.hands.send({ image: this.video });
                }
            },
            width: 640,
            height: 480
        });
        
        await this.camera.start();
    }

    onResults(results) {
        try {
            this.updatePerformanceMetrics();
            this.currentHands = results.multiHandLandmarks || [];
            this.drawLandmarks(results);
            this.updateHandCount();
            this.updateDebugData(results);
            
            // NEW: Process gesture detection
            this.processGestures();
            
            // Update instruction text based on hand count
            this.updateInstructions();
            
        } catch (error) {
            console.error('Processing error:', error);
        }
    }

    drawLandmarks(results) {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                const landmarks = results.multiHandLandmarks[i];
                this.drawHandLandmarks(landmarks, i);
            }
        }
    }

    drawHandLandmarks(landmarks, handIndex) {
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        
        // Draw landmarks
        landmarks.forEach((landmark, index) => {
            const x = landmark.x * canvasWidth;
            const y = landmark.y * canvasHeight;
            
            // Draw landmark dot
            this.ctx.beginPath();
            this.ctx.arc(x, y, index === 0 ? 6 : 4, 0, 2 * Math.PI); // Wrist bigger
            this.ctx.fillStyle = this.landmarkColors[index];
            this.ctx.fill();
            
            // Draw landmark number (for debugging)
            if (document.getElementById('debug-panel').style.display !== 'none') {
                this.ctx.font = '10px Arial';
                this.ctx.fillStyle = 'white';
                this.ctx.fillText(index.toString(), x + 6, y - 6);
            }
        });
        
        // Draw connections between landmarks (hand skeleton)
        this.drawHandConnections(landmarks, canvasWidth, canvasHeight);
        
        // Draw hand label
        const wrist = landmarks[0];
        this.ctx.font = '14px Arial';
        this.ctx.fillStyle = '#00BFFF';
        this.ctx.fillText(`Hand ${handIndex + 1}`, wrist.x * canvasWidth + 10, wrist.y * canvasHeight - 10);
    }

    drawHandConnections(landmarks, canvasWidth, canvasHeight) {
        // Hand skeleton connections
        const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],  // Thumb
            [0, 5], [5, 6], [6, 7], [7, 8],  // Index
            [0, 9], [9, 10], [10, 11], [11, 12], // Middle
            [0, 13], [13, 14], [14, 15], [15, 16], // Ring
            [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
            [5, 9], [9, 13], [13, 17]  // Palm connections
        ];
        
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 2;
        
        connections.forEach(([start, end]) => {
            const startPoint = landmarks[start];
            const endPoint = landmarks[end];
            
            this.ctx.beginPath();
            this.ctx.moveTo(startPoint.x * canvasWidth, startPoint.y * canvasHeight);
            this.ctx.lineTo(endPoint.x * canvasWidth, endPoint.y * canvasHeight);
            this.ctx.stroke();
        });
    }

    updateHandCount() {
        const count = this.currentHands.length;
        this.updateStatus('hands-count', count.toString(), count > 0 ? 'success' : '');
    }

    updatePerformanceMetrics() {
        this.frameCount++;
        const currentTime = performance.now();
        
        if (currentTime >= this.lastTime + 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
            this.frameCount = 0;
            this.lastTime = currentTime;
            
            const fpsClass = this.fps >= 25 ? 'success' : this.fps >= 15 ? 'warning' : 'error';
            this.updateStatus('fps-counter', this.fps.toString(), fpsClass);
        }
    }

    updateInstructions() {
        const instructionText = document.getElementById('instruction-text');
        const handCount = this.currentHands.length;
        
        if (handCount === 0) {
            instructionText.textContent = 'Hold your hands in front of the camera';
            instructionText.style.color = 'rgba(255, 255, 255, 0.7)';
        } else if (handCount === 1) {
            instructionText.textContent = 'Great! Now show your other hand for gestures';
            instructionText.style.color = '#FFC107';
        } else if (handCount === 2) {
            // Check for basic gesture
            if (this.gestureState && this.gestureState.detected) {
                const confidence = Math.round(this.gestureState.confidence * 100);
                instructionText.textContent = `Gesture Detected! Confidence: ${confidence}%`;
                instructionText.style.color = '#4CAF50';
            } else {
                instructionText.textContent = 'Bring your hands closer together';
                instructionText.style.color = '#FFC107';
            }
        }
    }

    updateDebugData(results) {
        if (document.getElementById('debug-panel').style.display !== 'none') {
            const debugData = {
                timestamp: new Date().toISOString(),
                handsDetected: results.multiHandLandmarks ? results.multiHandLandmarks.length : 0,
                landmarks: results.multiHandLandmarks || []
            };
            
            document.getElementById('landmark-data').textContent = JSON.stringify(debugData, null, 2);
        }
    }

    setupDebugToggle() {
        const debugBtn = document.getElementById('debug-toggle');
        const debugPanel = document.getElementById('debug-panel');
        
        debugBtn.addEventListener('click', () => {
            if (debugPanel.style.display === 'none') {
                debugPanel.style.display = 'block';
                debugBtn.textContent = 'Hide Debug';
            } else {
                debugPanel.style.display = 'none';
                debugBtn.textContent = 'Show Debug';
            }
        });
    }

    updateStatus(elementId, text, className = '') {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
            element.className = 'value';
            if (className) {
                element.classList.add('status-' + className);
            }
        }
    }

    showErrorMessage(error) {
        const instructionText = document.getElementById('instruction-text');
        instructionText.textContent = 'Error: ' + error.message;
        instructionText.style.color = '#FF5722';
    }

    // ===== MILESTONE 2: GESTURE DETECTION METHODS =====

    /**
     * Detect basic gesture when both hands are positioned close together
     * @param {Array} hands - Array of hand landmarks (up to 2 hands)
     * @returns {Object} Gesture detection result with confidence and metrics
     */
    detectBasicGesture(hands) {
        if (!hands || hands.length !== 2) {
            return { 
                detected: false, 
                confidence: 0.0, 
                reason: 'Need exactly 2 hands' 
            };
        }
        
        const leftHand = hands[0];
        const rightHand = hands[1];
        
        // Calculate wrist-to-wrist distance (primary detection metric)
        const wristDistance = this.calculateDistance(leftHand[0], rightHand[0]);
        
        // Calculate hand center proximity (secondary metric)
        const leftCenter = this.calculateHandCenter(leftHand);
        const rightCenter = this.calculateHandCenter(rightHand);
        const centerDistance = this.calculateDistance(leftCenter, rightCenter);
        
        // Hand stability check (reduce false positives from movement)
        const stability = this.calculateHandStability(leftHand, rightHand);
        
        // Gesture detected if hands are close and stable
        const isClose = wristDistance < 0.25 && centerDistance < 0.20;
        const isStable = stability > 0.7;
        const detected = isClose && isStable;
        
        // Calculate confidence score (0.0 - 1.0)
        let confidence = 0.0;
        if (detected) {
            const proximityScore = Math.max(0, 1.0 - (wristDistance / 0.25));
            const stabilityScore = stability;
            confidence = (proximityScore * 0.7) + (stabilityScore * 0.3);
        }
        
        return {
            detected,
            confidence: Math.min(confidence, 1.0),
            metrics: {
                wristDistance,
                centerDistance,
                stability
            },
            reason: detected ? 'Hands positioned for gesture' : 'Hands too far apart or unstable'
        };
    }

    /**
     * Calculate Euclidean distance between two 3D points
     * @param {Object} point1 - First point with x, y, z coordinates
     * @param {Object} point2 - Second point with x, y, z coordinates
     * @returns {number} Distance between points
     */
    calculateDistance(point1, point2) {
        const dx = point1.x - point2.x;
        const dy = point1.y - point2.y;
        const dz = point1.z - point2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Calculate geometric center of hand from landmarks
     * @param {Array} landmarks - Array of 21 hand landmarks
     * @returns {Object} Center point with x, y, z coordinates
     */
    calculateHandCenter(landmarks) {
        let sumX = 0, sumY = 0, sumZ = 0;
        landmarks.forEach(landmark => {
            sumX += landmark.x;
            sumY += landmark.y;
            sumZ += landmark.z;
        });
        
        return {
            x: sumX / landmarks.length,
            y: sumY / landmarks.length,
            z: sumZ / landmarks.length
        };
    }

    /**
     * Calculate hand stability to reduce false positives from movement
     * @param {Array} leftHand - Left hand landmarks
     * @param {Array} rightHand - Right hand landmarks
     * @returns {number} Stability score (0.0 - 1.0, higher = more stable)
     */
    calculateHandStability(leftHand, rightHand) {
        // Store previous hand positions for stability calculation
        if (!this.previousHands) {
            this.previousHands = { left: leftHand, right: rightHand };
            return 0.5; // Neutral stability for first frame
        }
        
        // Calculate movement between frames
        const leftMovement = this.calculateHandMovement(leftHand, this.previousHands.left);
        const rightMovement = this.calculateHandMovement(rightHand, this.previousHands.right);
        
        // Update previous positions
        this.previousHands = { left: leftHand, right: rightHand };
        
        // Stability inverse of movement (less movement = more stable)
        const avgMovement = (leftMovement + rightMovement) / 2;
        return Math.max(0, 1.0 - (avgMovement * 10)); // Scale movement to 0-1
    }

    /**
     * Calculate movement between current and previous hand positions
     * @param {Array} currentHand - Current hand landmarks
     * @param {Array} previousHand - Previous hand landmarks
     * @returns {number} Average movement per landmark
     */
    calculateHandMovement(currentHand, previousHand) {
        if (!previousHand || !currentHand) return 1.0;
        
        let totalMovement = 0;
        for (let i = 0; i < Math.min(currentHand.length, previousHand.length); i++) {
            totalMovement += this.calculateDistance(currentHand[i], previousHand[i]);
        }
        
        return totalMovement / currentHand.length;
    }

    /**
     * Process gestures and update gesture state
     */
    processGestures() {
        if (this.currentHands.length === 2) {
            const gestureResult = this.detectBasicGesture(this.currentHands);
            
            // Update gesture state
            this.gestureState = {
                detected: gestureResult.detected,
                confidence: gestureResult.confidence,
                metrics: gestureResult.metrics,
                lastUpdate: Date.now()
            };
            
            // NEW: Trigger particle system if gesture detected with high confidence
            if (gestureResult.detected && gestureResult.confidence > 0.8) {
                const now = Date.now();
                
                // Prevent rapid retriggering (cooldown period)
                if (!this.gestureState.lastTrigger || (now - this.gestureState.lastTrigger > 3000)) {
                    this.triggerTigerConstellation();
                    this.gestureState.lastTrigger = now;
                }
            }
        } else {
            this.gestureState = {
                detected: false,
                confidence: 0,
                metrics: null,
                lastUpdate: Date.now()
            };
        }
        
        this.updateGestureStatus();
    }

    /**
     * Update gesture status in the UI
     */
    updateGestureStatus() {
        const gestureStatus = document.getElementById('gesture-status');
        const confidenceLevel = document.getElementById('confidence-level');
        
        if (!gestureStatus || !confidenceLevel) return; // Elements not yet added
        
        if (this.currentHands.length === 2 && this.gestureState) {
            if (this.gestureState.detected) {
                const confidence = Math.round(this.gestureState.confidence * 100);
                gestureStatus.textContent = `Basic (${confidence}%)`;
                gestureStatus.className = 'value status-success';
            } else {
                gestureStatus.textContent = this.gestureState.reason || 'Adjusting...';
                gestureStatus.className = 'value status-warning';
            }
            
            confidenceLevel.textContent = `${Math.round(this.gestureState.confidence * 100)}%`;
            confidenceLevel.className = this.gestureState.confidence > 0.8 ? 'value status-success' :
                                       this.gestureState.confidence > 0.5 ? 'value status-warning' :
                                       'value status-error';
        } else {
            gestureStatus.textContent = 'None';
            gestureStatus.className = 'value';
            confidenceLevel.textContent = '0%';
            confidenceLevel.className = 'value';
        }
    }
    
    /**
     * Trigger tiger constellation particle effect
     */
    triggerTigerConstellation() {
        if (!this.particleSystem) return;
        
        // Calculate spawn position (center of screen or between hands)
        let centerX = this.canvas.width / 2;
        let centerY = this.canvas.height / 2;
        
        if (this.currentHands.length === 2) {
            // Position constellation between the hands
            const leftCenter = this.calculateHandCenter(this.currentHands[0]);
            const rightCenter = this.calculateHandCenter(this.currentHands[1]);
            
            centerX = (leftCenter.x + rightCenter.x) / 2 * this.canvas.width;
            centerY = (leftCenter.y + rightCenter.y) / 2 * this.canvas.height;
        }
        
        // Spawn tiger constellation
        this.particleSystem.spawnTigerConstellation(centerX, centerY, 1.0);
        
        // Update UI
        this.updateStatus('gesture-status', 'Tiger Spawned!', 'success');
        
        console.log('🐅 Tiger constellation spawned at:', centerX, centerY);
    }
    
    /**
     * Setup keyboard shortcuts for testing and debugging
     */
    setupTestingShortcuts() {
        document.addEventListener('keydown', (event) => {
            if (event.key === 't' || event.key === 'T') {
                this.runTigerDetectionTests();
            } else if (event.key === 'c' || event.key === 'C') {
                this.calibrateTigerDetection();
            } else if (event.key === 'p' || event.key === 'P') {
                // Manual particle trigger for testing
                this.triggerTigerConstellation();
            } else if (event.key === 's' || event.key === 'S') {
                // Stop all particles
                if (this.particleSystem) {
                    this.particleSystem.stopAnimation();
                }
            }
        });
        
        console.log('Testing shortcuts enabled:');
        console.log('  T - Run Tiger detection tests');
        console.log('  C - Calibrate current hand position');  
        console.log('  P - Manual particle trigger');
        console.log('  S - Stop particles');
    }
    
    /**
     * Run basic gesture detection tests
     */
    runTigerDetectionTests() {
        console.log('=== Basic Gesture Detection Testing ===');
        
        // Test 1: No hands
        console.log('Test 1: No hands present');
        const noHandsResult = this.detectBasicGesture([]);
        console.assert(!noHandsResult.detected, 'Should not detect gesture with no hands');
        
        // Test 2: One hand only
        console.log('Test 2: Single hand present');
        if (this.currentHands.length >= 1) {
            const oneHandResult = this.detectBasicGesture([this.currentHands[0]]);
            console.assert(!oneHandResult.detected, 'Should not detect gesture with one hand');
        }
        
        // Test 3: Two hands with current positions
        console.log('Test 3: Current two-hand position');
        if (this.currentHands.length === 2) {
            const currentResult = this.detectBasicGesture(this.currentHands);
            console.log('Current detection result:', {
                detected: currentResult.detected,
                confidence: currentResult.confidence,
                metrics: currentResult.metrics
            });
        }
        
        console.log('=== Testing Complete ===');
    }
    
    /**
     * Calibrate gesture detection with current hand positions
     */
    calibrateTigerDetection() {
        if (this.currentHands.length !== 2) {
            console.log('Need exactly 2 hands visible for calibration');
            return;
        }
        
        const result = this.detectBasicGesture(this.currentHands);
        console.log('=== Basic Gesture Detection Calibration ===');
        console.log('Raw measurements:', result.metrics);
        console.log('Overall confidence:', result.confidence);
        console.log('Detection threshold: 0.8');
        console.log('Current status:', result.detected ? 'DETECTED' : 'NOT DETECTED');
        console.log('Reason:', result.reason);
    }
}

// ===== MILESTONE 2: PARTICLE SYSTEM CLASS =====

class ParticleSystem {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.isActive = false;
        this.maxParticles = 100;
        
        // Tiger silhouette template points (normalized coordinates)
        this.tigerTemplate = this.generateTigerSilhouette();
        
        // Animation properties
        this.animationId = null;
        this.lastTime = 0;
        
        this.setupCanvas();
    }
    
    setupCanvas() {
        // Make canvas full-screen overlay
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '10';
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }
    
    generateTigerSilhouette() {
        // Tiger head and body silhouette points (normalized 0-1 coordinates)
        // These will be scaled to screen center when particles spawn
        return [
            // Tiger head outline
            { x: 0.5, y: 0.3 }, { x: 0.52, y: 0.28 }, { x: 0.55, y: 0.27 },
            { x: 0.58, y: 0.29 }, { x: 0.6, y: 0.32 }, { x: 0.61, y: 0.35 },
            { x: 0.6, y: 0.38 }, { x: 0.58, y: 0.41 }, { x: 0.55, y: 0.43 },
            { x: 0.52, y: 0.44 }, { x: 0.5, y: 0.45 }, { x: 0.48, y: 0.44 },
            { x: 0.45, y: 0.43 }, { x: 0.42, y: 0.41 }, { x: 0.4, y: 0.38 },
            { x: 0.39, y: 0.35 }, { x: 0.4, y: 0.32 }, { x: 0.42, y: 0.29 },
            { x: 0.45, y: 0.27 }, { x: 0.48, y: 0.28 },
            
            // Tiger ears
            { x: 0.45, y: 0.25 }, { x: 0.43, y: 0.22 }, { x: 0.47, y: 0.24 },
            { x: 0.55, y: 0.25 }, { x: 0.57, y: 0.22 }, { x: 0.53, y: 0.24 },
            
            // Tiger body outline
            { x: 0.5, y: 0.45 }, { x: 0.48, y: 0.5 }, { x: 0.46, y: 0.55 },
            { x: 0.45, y: 0.6 }, { x: 0.44, y: 0.65 }, { x: 0.46, y: 0.7 },
            { x: 0.5, y: 0.72 }, { x: 0.54, y: 0.7 }, { x: 0.56, y: 0.65 },
            { x: 0.55, y: 0.6 }, { x: 0.54, y: 0.55 }, { x: 0.52, y: 0.5 },
            
            // Additional detail points for fuller silhouette
            { x: 0.47, y: 0.35 }, { x: 0.53, y: 0.35 }, // Eyes area
            { x: 0.5, y: 0.38 }, // Nose area
            { x: 0.48, y: 0.41 }, { x: 0.52, y: 0.41 }, // Mouth area
        ];
    }
    
    spawnTigerConstellation(centerX, centerY, scale = 1.0) {
        // Clear existing particles
        this.particles = [];
        
        // Calculate screen position and scale
        const screenCenterX = centerX || this.canvas.width / 2;
        const screenCenterY = centerY || this.canvas.height / 2;
        const particleScale = scale * Math.min(this.canvas.width, this.canvas.height) * 0.3;
        
        // Create particles from template
        this.tigerTemplate.forEach((point, index) => {
            // Convert normalized coordinates to screen coordinates
            const screenX = screenCenterX + (point.x - 0.5) * particleScale;
            const screenY = screenCenterY + (point.y - 0.5) * particleScale;
            
            // Add some random offset for organic feel
            const offsetX = (Math.random() - 0.5) * 20;
            const offsetY = (Math.random() - 0.5) * 20;
            
            const particle = {
                id: index,
                x: screenX + offsetX,
                y: screenY + offsetY,
                targetX: screenX,
                targetY: screenY,
                
                // Visual properties
                size: 3 + Math.random() * 4, // 3-7px radius
                color: this.getRandomTigerColor(),
                alpha: 0.0, // Start invisible, fade in
                
                // Animation properties
                velocityX: (Math.random() - 0.5) * 2,
                velocityY: (Math.random() - 0.5) * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.1,
                rotation: Math.random() * Math.PI * 2,
                
                // Lifecycle properties
                age: 0,
                maxAge: 5000 + Math.random() * 3000, // 5-8 seconds
                phase: 'spawning' // spawning -> floating -> dying
            };
            
            this.particles.push(particle);
        });
        
        // Start animation loop
        this.isActive = true;
        this.startAnimation();
    }
    
    getRandomTigerColor() {
        const tigerColors = [
            '#FF6B35',  // Orange
            '#FF8C42',  // Light Orange
            '#FF5722',  // Deep Orange
            '#FFD700',  // Gold
            '#FFA000',  // Amber
            '#2C1810',  // Dark Brown/Black stripes
        ];
        
        // Weighted selection (more orange tones)
        const weights = [0.3, 0.25, 0.2, 0.15, 0.08, 0.02];
        let random = Math.random();
        
        for (let i = 0; i < weights.length; i++) {
            random -= weights[i];
            if (random <= 0) return tigerColors[i];
        }
        
        return tigerColors[0]; // Fallback
    }
    
    startAnimation() {
        if (this.animationId) return; // Already animating
        
        const animate = (currentTime) => {
            if (!this.isActive) return;
            
            const deltaTime = currentTime - this.lastTime;
            this.lastTime = currentTime;
            
            this.updateParticles(deltaTime);
            this.renderParticles();
            
            // Continue animation if particles exist
            if (this.particles.length > 0) {
                this.animationId = requestAnimationFrame(animate);
            } else {
                this.animationId = null;
                this.isActive = false;
            }
        };
        
        this.lastTime = performance.now();
        this.animationId = requestAnimationFrame(animate);
    }
    
    updateParticles(deltaTime) {
        this.particles = this.particles.filter(particle => {
            // Update age
            particle.age += deltaTime;
            
            // Update lifecycle phase
            if (particle.age < 500) {
                particle.phase = 'spawning';
            } else if (particle.age < particle.maxAge - 1000) {
                particle.phase = 'floating';
            } else {
                particle.phase = 'dying';
            }
            
            // Update alpha based on phase
            switch (particle.phase) {
                case 'spawning':
                    particle.alpha = Math.min(1.0, particle.age / 500);
                    break;
                case 'floating':
                    particle.alpha = 1.0;
                    break;
                case 'dying':
                    const dyingProgress = (particle.age - (particle.maxAge - 1000)) / 1000;
                    particle.alpha = Math.max(0, 1.0 - dyingProgress);
                    break;
            }
            
            // Update position with gentle floating motion
            const time = particle.age * 0.001;
            particle.velocityX += Math.sin(time * 2 + particle.id) * 0.02;
            particle.velocityY += Math.cos(time * 1.5 + particle.id) * 0.02;
            
            // Apply velocity with damping
            particle.x += particle.velocityX;
            particle.y += particle.velocityY;
            particle.velocityX *= 0.98; // Damping
            particle.velocityY *= 0.98;
            
            // Gentle attraction back to target position
            const attractionStrength = 0.02;
            particle.velocityX += (particle.targetX - particle.x) * attractionStrength;
            particle.velocityY += (particle.targetY - particle.y) * attractionStrength;
            
            // Update rotation
            particle.rotation += particle.rotationSpeed;
            
            // Remove dead particles
            return particle.age < particle.maxAge;
        });
    }
    
    renderParticles() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Render each particle
        this.particles.forEach(particle => {
            if (particle.alpha <= 0) return;
            
            this.ctx.save();
            
            // Set alpha
            this.ctx.globalAlpha = particle.alpha;
            
            // Position and rotate
            this.ctx.translate(particle.x, particle.y);
            this.ctx.rotate(particle.rotation);
            
            // Draw particle
            this.ctx.beginPath();
            this.ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
            this.ctx.fillStyle = particle.color;
            this.ctx.fill();
            
            // Add glow effect for tiger particles
            if (particle.color.includes('#FF')) { // Orange tones
                this.ctx.shadowColor = particle.color;
                this.ctx.shadowBlur = particle.size * 2;
                this.ctx.fill();
            }
            
            this.ctx.restore();
        });
    }
    
    stopAnimation() {
        this.isActive = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.particles = [];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

// Initialize the application when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🥷 Naruto Gesture Constellation Generator - Milestone 2');
    console.log('Initializing MediaPipe hand tracking with gesture detection...');
    
    const tracker = new MediaPipeHandTracker();
});

// Add some helpful console messages for development
console.log(`
🎯 MILESTONE 2 SUCCESS CRITERIA:
✅ Basic gesture detection (hands close together)
✅ Particle system with tiger silhouette
✅ Real-time gesture confidence scoring
✅ Beautiful particle animations
✅ Gesture-triggered constellation spawning

🚀 NEXT STEPS:
- Phase 2C: Tiger hand sign specific recognition
- Advanced gesture analysis and scoring
- Enhanced particle effects and interactions

🥷 Testing Shortcuts Available:
- T - Run gesture detection tests
- C - Calibrate current hand position
- P - Manual particle trigger
- S - Stop all particles
`);
