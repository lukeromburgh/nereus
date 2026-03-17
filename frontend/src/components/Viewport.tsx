import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stage, OrbitControls } from '@react-three/drei';
import { useSimStore } from '../store/useSimStore';
import { HydrofoilResults } from '../HydrofoilResults';

export function Viewport() {
  const resultMeshPath = useSimStore((state) => state.resultMeshPath);
  
  // Use a fallback URL if testing or local path mapping
  // Needs to point to Django's MEDIA_URL
  const fullUrl = resultMeshPath ? `http://localhost:8000${resultMeshPath}` : null;

  return (
    <div className="w-full h-full">
      <Canvas shadows dpr={[1, 2]} camera={{ fov: 45 }}>
        <color attach="background" args={['#000000']} />
        
        <Suspense fallback={null}>
          <Stage environment="city" intensity={0.5}>
            {fullUrl ? (
              <HydrofoilResults url={fullUrl} />
            ) : (
              <mesh>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color="#334155" wireframe />
              </mesh>
            )}
          </Stage>
        </Suspense>
        
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
