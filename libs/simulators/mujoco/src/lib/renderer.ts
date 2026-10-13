import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RenderGeometry, SimulationFrame } from '@botlab/simulators-core';

export function createSimulationRenderer(
  container: HTMLElement,
  description: RenderGeometry[],
  options: { rearView?: boolean } = {},
) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor('#101824');
  container.replaceChildren(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Simulación física del robot');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.005, 50);
  camera.up.set(0, 0, 1);
  camera.position.set(options.rearView ? -0.65 : 0.65, -0.7, 0.5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0.08);
  controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xddeeff, 0x6b7580, 2));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(2, -3, 5);
  scene.add(light);
  const meshes = new Map<number, THREE.Mesh>();
  const floorGrids = new Map<number, THREE.GridHelper>();
  for (const geom of description) {
    if (geom.rgba[3] === 0) continue;
    let geometry: THREE.BufferGeometry;
    const [x, y, z] = geom.size;
    if (geom.mesh) {
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(geom.mesh.vertices, 3),
      );
      geometry.setIndex(geom.mesh.indices);
      geometry.computeVertexNormals();
    } else if (geom.type === 0)
      geometry = new THREE.PlaneGeometry(x * 2 || 20, y * 2 || 20);
    else if (geom.type === 6)
      geometry = new THREE.BoxGeometry(x * 2, y * 2, z * 2);
    else if (geom.type === 2) geometry = new THREE.SphereGeometry(x, 20, 16);
    else if (geom.type === 3) {
      geometry = new THREE.CapsuleGeometry(x, y * 2, 8, 16);
      geometry.rotateX(Math.PI / 2);
    } else if (geom.type === 5) {
      geometry = new THREE.CylinderGeometry(x, x, y * 2, 20);
      geometry.rotateX(Math.PI / 2);
    } else if (geom.type === 4) {
      geometry = new THREE.SphereGeometry(1, 20, 16);
      geometry.scale(x, y, z);
    } else continue;
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(
        ...(geom.rgba.slice(0, 3) as [number, number, number]),
      ),
      roughness: 0.65,
      metalness: 0.12,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    meshes.set(geom.id, mesh);
    scene.add(mesh);
    if (geom.type === 0 && x === 0 && y === 0) {
      const grid = new THREE.GridHelper(10, 100, '#354154', '#354154');
      grid.geometry.rotateX(Math.PI / 2);
      grid.matrixAutoUpdate = false;
      grid.material.transparent = true;
      grid.material.opacity = 0.35;
      floorGrids.set(geom.id, grid);
      scene.add(grid);
    }
  }
  const resize = new ResizeObserver(() => {
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(Math.max(width, 1), Math.max(height, 1));
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  });
  resize.observe(container);
  let animation = 0;
  const previousRoot = new THREE.Vector3();
  function render() {
    controls.update();
    renderer.render(scene, camera);
    animation = requestAnimationFrame(render);
  }
  render();
  return {
    update(frame: SimulationFrame) {
      if (frame.rootPosition.length === 3) {
        const next = new THREE.Vector3(
          frame.rootPosition[0],
          frame.rootPosition[1],
          0,
        );
        const delta = next.clone().sub(previousRoot);
        camera.position.add(delta);
        controls.target.add(delta);
        previousRoot.copy(next);
      }
      for (const [id, mesh] of meshes) {
        const r = frame.geomRotations.slice(id * 9, id * 9 + 9);
        const p = frame.geomPositions.slice(id * 3, id * 3 + 3);
        mesh.matrix.set(
          r[0],
          r[1],
          r[2],
          p[0],
          r[3],
          r[4],
          r[5],
          p[1],
          r[6],
          r[7],
          r[8],
          p[2],
          0,
          0,
          0,
          1,
        );
        const grid = floorGrids.get(id);
        if (grid && frame.rootPosition.length === 3) {
          // Follow an infinite physics plane without moving its world-aligned grid.
          const delta = frame.rootPosition.map((value, i) => value - p[i]);
          const u = delta[0] * r[0] + delta[1] * r[3] + delta[2] * r[6];
          const v = delta[0] * r[1] + delta[1] * r[4] + delta[2] * r[7];
          grid.matrix
            .copy(mesh.matrix)
            .multiply(
              new THREE.Matrix4().makeTranslation(
                Math.round(u),
                Math.round(v),
                0.001,
              ),
            );
          mesh.matrix.multiply(new THREE.Matrix4().makeTranslation(u, v, 0));
        }
      }
    },
    dispose() {
      cancelAnimationFrame(animation);
      resize.disconnect();
      controls.dispose();
      for (const mesh of meshes.values()) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      for (const grid of floorGrids.values()) {
        grid.geometry.dispose();
        grid.material.dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
