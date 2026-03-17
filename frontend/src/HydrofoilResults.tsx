import { useGLTF } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

interface HydrofoilResultsProps {
  url: string;
}

function StlResults({ url }: HydrofoilResultsProps) {
  const geometry = useLoader(STLLoader, url);
  geometry.computeVertexNormals();

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial />
    </mesh>
  );
}

function GltfResults({ url }: HydrofoilResultsProps) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

export function HydrofoilResults({ url }: HydrofoilResultsProps) {
  const lowerUrl = url.toLowerCase();

  return (
    <group>
      {lowerUrl.endsWith('.stl') ? <StlResults url={url} /> : <GltfResults url={url} />}
    </group>
  );
}

// Make the active component pre-loader safe depending on rendering logic
// useGLTF.preload(url)
