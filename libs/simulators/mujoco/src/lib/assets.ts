import type { SimulationDepthSensor } from '@botlab/simulators-core';
import type { SimulationManifest } from '@botlab/simulators-core';

export function validateManifest(manifest: SimulationManifest): void {
  if (
    manifest.schemaVersion !== 1 ||
    manifest.mujocoVersion !== '3.11.0' ||
    !/^[a-f0-9]{40}$/.test(manifest.revision) ||
    !manifest.assets?.length ||
    !manifest.joints?.length
  )
    throw new Error('Unsupported or unresolved simulation manifest.');
  if (manifest.depthSensor) validateDepthSensor(manifest.depthSensor);
  const paths = new Set<string>();
  for (const asset of manifest.assets) {
    if (
      !asset.path ||
      asset.path.startsWith('/') ||
      asset.path
        .split('/')
        .some((part) => !part || part === '..' || part === '.') ||
      asset.path.includes('\\') ||
      paths.has(asset.path) ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      !Number.isSafeInteger(asset.bytes) ||
      asset.bytes <= 0 ||
      asset.bytes > 64 * 1024 * 1024
    )
      throw new Error('Invalid resource path, size or digest.');
    paths.add(asset.path);
  }
  if (!paths.has(manifest.scene))
    throw new Error('Scene is missing from the resource manifest.');
  const names = new Set<string>();
  for (const joint of manifest.joints) {
    if (
      names.has(joint.name) ||
      !joint.name ||
      ![
        joint.home,
        joint.min,
        joint.max,
        joint.kp,
        joint.kd,
        joint.effortLimit,
      ].every(Number.isFinite) ||
      joint.min >= joint.max ||
      joint.home < joint.min ||
      joint.home > joint.max ||
      joint.kp <= 0 ||
      joint.kd < 0 ||
      joint.effortLimit <= 0
    )
      throw new Error('Invalid or duplicate joint configuration.');
    names.add(joint.name);
  }
  const controller = manifest.controller;
  if (
    controller &&
    (!paths.has(controller.model) ||
      !Number.isSafeInteger(controller.decimation) ||
      controller.decimation < 1 ||
      controller.decimation > 100 ||
      controller.actionSize < 1 ||
      controller.actionSize > manifest.joints.length)
  )
    throw new Error('Invalid controller manifest.');
  const c = manifest.servoCurve;
  if (
    c &&
    (!Object.values(c).every((v) => Number.isFinite(v) && v > 0) ||
      c.continuous >= c.plateau ||
      c.cornerRpm >= c.cutoffRpm)
  )
    throw new Error('Invalid servo curve.');
}

export async function fetchSimulationAssets(
  manifest: SimulationManifest,
  signal?: AbortSignal,
): Promise<Record<string, Uint8Array>> {
  validateManifest(manifest);
  const entries = await Promise.all(
    manifest.assets.map(async (asset) => {
      const response = await fetch(asset.url, { signal });
      if (!response.ok)
        throw new Error(
          `Resource unavailable (${response.status}): ${asset.path}`,
        );
      const buffer = await response.arrayBuffer();
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)),
        (b) => b.toString(16).padStart(2, '0'),
      ).join('');
      if (buffer.byteLength !== asset.bytes || digest !== asset.sha256)
        throw new Error(`Resource verification failed: ${asset.path}`);
      return [asset.path, new Uint8Array(buffer)] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export function validateDepthSensor(sensor: SimulationDepthSensor) {
  if (
    (sensor.projection !== undefined &&
      !['angular', 'pinhole'].includes(sensor.projection)) ||
    (sensor.minRangeMeters !== undefined &&
      (!Number.isFinite(sensor.minRangeMeters) ||
        sensor.minRangeMeters < 0 ||
        sensor.minRangeMeters >= sensor.maxRangeMeters)) ||
    typeof sensor.id !== 'string' ||
    !sensor.id ||
    typeof sensor.site !== 'string' ||
    !sensor.site ||
    ![sensor.rows, sensor.columns].every(
      (n) => Number.isSafeInteger(n) && n > 0 && n <= 64,
    ) ||
    sensor.rows * sensor.columns > 4096 ||
    ![sensor.horizontalFovRadians, sensor.verticalFovRadians].every(
      (n) => Number.isFinite(n) && n > 0 && n < Math.PI,
    ) ||
    !Number.isFinite(sensor.maxRangeMeters) ||
    sensor.maxRangeMeters <= 0 ||
    sensor.maxRangeMeters > 100 ||
    !Number.isFinite(sensor.frequencyHz) ||
    sensor.frequencyHz <= 0 ||
    sensor.frequencyHz > 60
  )
    throw new Error('Invalid depth sensor configuration.');
}
