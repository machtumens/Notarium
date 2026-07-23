import { Canvas } from '@react-three/fiber';
import { ShaderPlane } from './background-paper-shaders';

/**
 * Deferred WebGL background scene for the Subjects page.
 *
 * Extracted into its own module so it can be loaded via React.lazy — this keeps
 * the Three.js / @react-three/fiber bundle out of the initial render path so the
 * subject cards paint first and the shader scene streams in afterward.
 */
export default function SubjectsShaderScene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 3.5], fov: 75 }}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.5} />
      <ShaderPlane position={[0, 0, 0]} color1="#6366f1" color2="#8b5cf6" />
      <ShaderPlane position={[1.5, 0.8, -0.5]} color1="#ec4899" color2="#f97316" />
      <ShaderPlane position={[-1.5, -0.8, -0.5]} color1="#3b82f6" color2="#06b6d4" />
      <ShaderPlane position={[0, -1.2, -1]} color1="#8b5cf6" color2="#d946ef" />
    </Canvas>
  );
}
