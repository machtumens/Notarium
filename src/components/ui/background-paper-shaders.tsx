import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
// Custom shader material for advanced effects
const vertexShader = `
  uniform float time;
  uniform float intensity;
  varying vec2 vUv;
  varying vec3 vPosition;

  void main() {
    vUv = uv;
    vPosition = position;

    vec3 pos = position;
    pos.z += sin(pos.x * 8.0 + time * 0.5) * 0.15 * intensity;
    pos.z += cos(pos.y * 6.0 + time * 0.7) * 0.15 * intensity;
    pos.y += sin(pos.x * 5.0 + time * 0.3) * 0.08 * intensity;
    pos.x += cos(pos.y * 5.0 + time * 0.4) * 0.08 * intensity;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform float time;
  uniform float intensity;
  uniform vec3 color1;
  uniform vec3 color2;
  varying vec2 vUv;
  varying vec3 vPosition;

  void main() {
    vec2 uv = vUv;

    // Create flowing animated patterns
    float wave1 = sin(uv.x * 8.0 + time * 0.6) * cos(uv.y * 8.0 + time * 0.4);
    float wave2 = sin(uv.x * 12.0 - time * 0.5) * cos(uv.y * 12.0 + time * 0.7) * 0.5;
    float wave3 = sin(length(uv - 0.5) * 10.0 - time * 0.8) * 0.3;

    float pattern = wave1 + wave2 + wave3;

    // Mix colors with smooth transitions
    vec3 color = mix(color1, color2, pattern * 0.5 + 0.5);
    color = mix(color, color1 * 1.2, pow(abs(pattern), 1.5) * intensity * 0.3);

    // Softer, more visible glow
    float glow = 1.0 - length(uv - 0.5) * 1.2;
    glow = pow(max(glow, 0.0), 1.5);

    // More opacity for better visibility
    float alpha = glow * 0.9 * (0.8 + pattern * 0.2);

    gl_FragColor = vec4(color * 1.3, alpha);
  }
`;

export function ShaderPlane({
  position,
  color1 = '#ff5722',
  color2 = '#ffffff',
}: {
  position: [number, number, number];
  color1?: string;
  color2?: string;
}) {
  const mesh = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      intensity: { value: 1.0 },
      color1: { value: new THREE.Color(color1) },
      color2: { value: new THREE.Color(color2) },
    }),
    [color1, color2],
  );

  /* eslint-disable react-hooks/immutability -- react-three-fiber per-frame animation intentionally mutates shader uniforms and mesh rotation; behavior-preserving */
  useFrame((state) => {
    if (mesh.current) {
      uniforms.time.value = state.clock.elapsedTime;
      uniforms.intensity.value = 1.2 + Math.sin(state.clock.elapsedTime * 1.5) * 0.4;
      mesh.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
    }
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <mesh ref={mesh} position={position}>
      <planeGeometry args={[4, 4, 64, 64]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

export function EnergyRing({
  radius = 1,
  position = [0, 0, 0],
}: {
  radius?: number;
  position?: [number, number, number];
}) {
  const mesh = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.z = state.clock.elapsedTime;
      mesh.current.material.opacity = 0.5 + Math.sin(state.clock.elapsedTime * 3) * 0.3;
    }
  });

  return (
    <mesh ref={mesh} position={position}>
      <ringGeometry args={[radius * 0.8, radius, 32]} />
      <meshBasicMaterial color="#ff5722" transparent opacity={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}
