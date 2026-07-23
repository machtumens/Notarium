import { useEffect, useRef } from 'react';

interface ThreeJSGlobals {
  Camera: new () => unknown;
  Scene: new () => unknown;
  PlaneGeometry: new (width: number, height: number) => unknown;
  ShaderMaterial: new (params: {
    uniforms: unknown;
    vertexShader: string;
    fragmentShader: string;
  }) => unknown;
  Mesh: new (geometry: unknown, material: unknown) => { position: { z: number } };
  WebGLRenderer: new (params?: { antialias?: boolean }) => unknown;
  Vector2: new () => { x: number; y: number };
}

declare global {
  interface Window {
    THREE: ThreeJSGlobals;
  }
}

interface SceneRef {
  camera: unknown;
  scene: unknown;
  renderer: unknown;
  uniforms: unknown;
  animationId: number | null;
}

export function ShaderAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRef>({
    camera: null,
    scene: null,
    renderer: null,
    uniforms: null,
    animationId: null,
  });

  useEffect(() => {
    // Load Three.js dynamically
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/89/three.min.js';
    script.onload = () => {
      if (containerRef.current && window.THREE) {
        // eslint-disable-next-line react-hooks/immutability -- stable component function referenced by the script onload callback; behavior-preserving
        initThreeJS();
      }
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup
      if (sceneRef.current.animationId) {
        cancelAnimationFrame(sceneRef.current.animationId);
      }
      if (sceneRef.current.renderer) {
        sceneRef.current.renderer.dispose();
      }
      document.head.removeChild(script);
    };
  }, []);

  const initThreeJS = () => {
    if (!containerRef.current || !window.THREE) return;

    const THREE = window.THREE;
    const container = containerRef.current;

    // Clear any existing content
    container.innerHTML = '';

    // Initialize camera
    const camera = new THREE.Camera();
    camera.position.z = 1;

    // Initialize scene
    const scene = new THREE.Scene();

    // Create geometry
    const geometry = new THREE.PlaneBufferGeometry(2, 2);

    // Define uniforms
    const uniforms = {
      time: { type: 'f', value: 1.0 },
      resolution: { type: 'v2', value: new THREE.Vector2() },
    };

    // Vertex shader
    const vertexShader = `
      void main() {
        gl_Position = vec4( position, 1.0 );
      }
    `;

    // Optimized fragment shader (reduced loop iterations for better performance)
    const fragmentShader = `
      #define TWO_PI 6.2831853072
      #define PI 3.14159265359

      precision mediump float; // Use medium precision for better performance
      uniform vec2 resolution;
      uniform float time;

      float random (in float x) {
          return fract(sin(x)*1e4);
      }
      float random (vec2 st) {
          return fract(sin(dot(st.xy,
                               vec2(12.9898,78.233)))*
              43758.5453123);
      }

      varying vec2 vUv;

      void main(void) {
        vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);

        vec2 fMosaicScal = vec2(4.0, 2.0);
        vec2 vScreenSize = vec2(256.0, 256.0);
        uv.x = floor(uv.x * vScreenSize.x / fMosaicScal.x) / (vScreenSize.x / fMosaicScal.x);
        uv.y = floor(uv.y * vScreenSize.y / fMosaicScal.y) / (vScreenSize.y / fMosaicScal.y);

        float t = time*0.06+random(uv.x)*0.4;
        float lineWidth = 0.0008;

        vec3 color = vec3(0.0);
        // Reduced iterations from 3x5 to 2x3 for better performance
        for(int j = 0; j < 2; j++){
          for(int i=0; i < 3; i++){
            color[j] += lineWidth*float(i*i) / abs(fract(t - 0.01*float(j)+float(i)*0.01)*1.0 - length(uv));
          }
        }
        // Fill blue channel with simplified calculation
        color[2] = color[0] * 0.8;

        gl_FragColor = vec4(color[2],color[1],color[0],1.0);
      }
    `;

    // Create material
    const material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
    });

    // Create mesh and add to scene
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Initialize renderer with performance optimizations
    const renderer = new THREE.WebGLRenderer({
      antialias: false, // Disable antialiasing for better performance
      alpha: true,
      powerPreference: 'low-power', // Use low-power mode
    });
    // Limit pixel ratio to improve performance on high-DPI displays
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    // Store references
    sceneRef.current = {
      camera,
      scene,
      renderer,
      uniforms,
      animationId: null,
    };

    // Initial size setup
    const setSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setSize(width, height);
      uniforms.resolution.value.x = renderer.domElement.width;
      uniforms.resolution.value.y = renderer.domElement.height;
    };

    setSize();

    // Handle resize with throttling
    let resizeTimeout: NodeJS.Timeout;
    const onWindowResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        setSize();
      }, 100);
    };

    window.addEventListener('resize', onWindowResize, false);

    // Animation loop with frame rate throttling for better performance
    let lastFrameTime = 0;
    const targetFPS = 30; // Throttle to 30fps instead of 60fps
    const frameInterval = 1000 / targetFPS;

    const animate = (currentTime: number) => {
      sceneRef.current.animationId = requestAnimationFrame(animate);

      const deltaTime = currentTime - lastFrameTime;

      // Only render if enough time has passed (throttle to 30fps)
      if (deltaTime >= frameInterval) {
        lastFrameTime = currentTime - (deltaTime % frameInterval);
        uniforms.time.value += 0.05;
        renderer.render(scene, camera);
      }
    };

    animate(0);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    />
  );
}
