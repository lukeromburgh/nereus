import React from 'react';
import { useGLTF } from '@react-three/drei';

interface HydrofoilResultsProps {
  url: string;
}

export function HydrofoilResults({ url }: HydrofoilResultsProps) {
  // Dynamically loads the PyVista GLTF output
  // Warning: Requires robust error boundaries if file unreadable!
  const { scene } = useGLTF(url); 

  return (
    <group>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <primitive object={scene} />
    </group>
  );
}

// Make the active component pre-loader safe depending on rendering logic
// useGLTF.preload(url)
