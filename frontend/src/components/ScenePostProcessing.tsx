/**
 * ScenePostProcessing — Selective Bloom for high-pressure areas and
 * SSAO for geometry depth perception.
 *
 * Uses @react-three/postprocessing EffectComposer with performance-tuned
 * settings that maintain 60fps on mid-range GPUs.
 */
import { EffectComposer, Bloom, N8AO } from "@react-three/postprocessing";
import { useSimStore } from "../store/useSimStore";

function BloomEffect() {
  return (
    <Bloom
      intensity={0.35}
      luminanceThreshold={0.6}
      luminanceSmoothing={0.4}
      mipmapBlur
      radius={0.7}
    />
  );
}

function SSAOEffect() {
  return <N8AO aoRadius={0.5} intensity={1.5} distanceFalloff={0.5} halfRes />;
}

export function ScenePostProcessing() {
  const enableBloom = useSimStore((s) => s.enableBloom);
  const enableSSAO = useSimStore((s) => s.enableSSAO);

  if (!enableBloom && !enableSSAO) return null;

  return (
    <EffectComposer multisampling={0}>
      {enableBloom ? <BloomEffect /> : <></>}
      {enableSSAO ? <SSAOEffect /> : <></>}
    </EffectComposer>
  );
}
