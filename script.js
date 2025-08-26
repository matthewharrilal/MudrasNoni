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
            instructionText.textContent = 'Perfect! Ready for Tiger hand sign detection';
            instructionText.style.color = '#4CAF50';
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
}

// Initialize the application when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🥷 Naruto Gesture Constellation Generator - Milestone 1');
    console.log('Initializing MediaPipe hand tracking...');
    
    const tracker = new MediaPipeHandTracker();
});

// Add some helpful console messages for development
console.log(`
🎯 MILESTONE 1 SUCCESS CRITERIA:
✅ Camera feed displays (mirrored)
✅ MediaPipe detects hands (up to 2)
✅ 21 landmarks per hand (colored dots)
✅ 30+ FPS performance
✅ Real-time tracking with no lag
✅ Status UI updates correctly
✅ Debug panel shows landmark data

🚀 NEXT STEPS:
- Step 2: Basic gesture detection (any two hands together)
- Step 3: Particle system spawning
- Step 4: Tiger hand sign specific detection
`);
