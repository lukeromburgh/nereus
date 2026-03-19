import { useEffect, useRef, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { BufferGeometry, DoubleSide } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { loadVTP } from "./lib/vtpLoader";

interface HydrofoilResultsProps {
  url: string;
  onLoad?: () => void;
}

function StlResults({ url, onLoad }: HydrofoilResultsProps) {
  const geometry = useLoader(STLLoader, url);
  geometry.computeVertexNormals();

  const didFire = useRef(false);
  useEffect(() => {
    if (!didFire.current && onLoad) {
      didFire.current = true;
      onLoad();
    }
  }, [onLoad]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial side={DoubleSide} />
    </mesh>
  );
}

function VtpResults({ url, onLoad }: HydrofoilResultsProps) {
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadVTP(url)
      .then((geom) => {
        if (!cancelled) {
          setGeometry(geom);
          onLoad?.();
        }
      })
      .catch((err) => {
        console.error("[VtpResults] Failed to load VTP:", url, err);
      });
    return () => {
      cancelled = true;
    };
  }, [url, onLoad]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color="#94a3b8"
        metalness={0.4}
        roughness={0.35}
        side={DoubleSide}
      />
    </mesh>
  );
}

function GltfResults({ url, onLoad }: HydrofoilResultsProps) {
  const { scene } = useGLTF(url);

  const didFire = useRef(false);
  useEffect(() => {
    if (!didFire.current && onLoad) {
      didFire.current = true;
      onLoad();
    }
  }, [onLoad]);

  return <primitive object={scene} />;
}

export function HydrofoilResults({ url, onLoad }: HydrofoilResultsProps) {
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.endsWith(".stl")) {
    return (
      <group>
        <StlResults url={url} onLoad={onLoad} />
      </group>
    );
  }
  if (lowerUrl.endsWith(".vtp")) {
    return (
      <group>
        <VtpResults url={url} onLoad={onLoad} />
      </group>
    );
  }
  return (
    <group>
      <GltfResults url={url} onLoad={onLoad} />
    </group>
  );
}

// Make the active component pre-loader safe depending on rendering logic
// useGLTF.preload(url)
