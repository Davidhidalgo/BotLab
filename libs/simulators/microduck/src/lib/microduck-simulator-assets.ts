export type MicroDuckSimulatorAssetKind =
  | 'browser-sandbox-source'
  | 'robot-model'
  | 'mesh'
  | 'policy'
  | 'policy-manifest'
  | 'runtime-wasm'
  | 'sound'
  | 'texture';

export type MicroDuckSimulatorAssetLicenseStatus =
  | 'verified'
  | 'pending-review'
  | 'restricted'
  | 'blocked';

export interface MicroDuckSimulatorAssetLicense {
  name?: string;
  url?: string;
  status: MicroDuckSimulatorAssetLicenseStatus;
  notes: string;
}

export interface MicroDuckSimulatorAssetSource {
  url: string;
  repositoryUrl?: string;
  revision: string;
  path?: string;
}

export interface MicroDuckSimulatorAssetCacheTarget {
  path: string;
  mediaType?: string;
}

export interface MicroDuckSimulatorAssetManifestEntry {
  id: string;
  label: string;
  kind: MicroDuckSimulatorAssetKind;
  required: boolean;
  source: MicroDuckSimulatorAssetSource;
  cache: MicroDuckSimulatorAssetCacheTarget;
  license: MicroDuckSimulatorAssetLicense;
  expectedSha256?: string;
  sizeBytes?: number;
}

export interface MicroDuckSimulatorAssetManifest {
  id: string;
  version: 1;
  simulatorId: 'microduck-official-sim';
  upstreamRevision: string;
  assets: MicroDuckSimulatorAssetManifestEntry[];
}

export interface MicroDuckSimulatorCachedAsset {
  id: string;
  sha256?: string;
}

export interface MicroDuckSimulatorAssetCacheStore {
  read(
    asset: MicroDuckSimulatorAssetManifestEntry
  ): Uint8Array | undefined | Promise<Uint8Array | undefined>;
  write(
    asset: MicroDuckSimulatorAssetManifestEntry,
    bytes: Uint8Array
  ): void | Promise<void>;
}

export interface MicroDuckSimulatorAssetDownloader {
  download(
    asset: MicroDuckSimulatorAssetManifestEntry
  ): Uint8Array | Promise<Uint8Array>;
}

export type MicroDuckSimulatorAssetHashFunction = (
  bytes: Uint8Array
) => string | Promise<string>;

export type MicroDuckSimulatorAssetCacheStatus =
  | 'ready'
  | 'missing'
  | 'stale'
  | 'pending-review'
  | 'blocked';

export interface MicroDuckSimulatorAssetCachePlanEntry {
  asset: MicroDuckSimulatorAssetManifestEntry;
  status: MicroDuckSimulatorAssetCacheStatus;
  message: string;
}

export interface MicroDuckSimulatorAssetCachePlan {
  manifestId: string;
  ready: boolean;
  loadable: boolean;
  entries: MicroDuckSimulatorAssetCachePlanEntry[];
}

export interface MicroDuckSimulatorAssetManifestValidationResult {
  valid: boolean;
  errors: string[];
}

export interface MicroDuckSimulatorAssetCacheSetupOptions {
  manifest: MicroDuckSimulatorAssetManifest;
  cache: MicroDuckSimulatorAssetCacheStore;
  downloader: MicroDuckSimulatorAssetDownloader;
  hashBytes: MicroDuckSimulatorAssetHashFunction;
}

export interface MicroDuckSimulatorAssetCacheSetupResult {
  plan: MicroDuckSimulatorAssetCachePlan;
  downloadedAssetIds: string[];
  skippedAssetIds: string[];
  errors: string[];
}

export interface MicroDuckBrowserAssetCacheStoreOptions {
  cacheName?: string;
  cacheBaseUrl?: string;
  cacheStorage?: CacheStorage;
}

export type MicroDuckSimulatorAssetFetchFunction = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

const MICRODUCK_RL_REVISION = '53b8971b61baf5b7f3c16d135dd7cac37623de4b';
const MICRODUCK_POLICIES_REVISION = '088524a64e2557dc453256b6071dbb9d23888802';
const MICRODUCK_BROWSER_SIMULATOR_REVISION =
  '023172c8a7d629b5258d90364c13bafe013abbfa';
const MICRODUCK_BROWSER_CACHE_NAME = 'botlab-microduck-official-sim-assets';
const MICRODUCK_BROWSER_CACHE_BASE_URL = 'https://botlab.local/cache/';

export const microDuckSimulatorAssetManifest: MicroDuckSimulatorAssetManifest =
  {
    id: 'microduck-official-sim-assets-2026-09-11',
    version: 1,
    simulatorId: 'microduck-official-sim',
    upstreamRevision: MICRODUCK_RL_REVISION,
    assets: [
      {
        id: 'microduck-rl-mjcf-models',
        label: 'MicroDuck MuJoCo robot models',
        kind: 'robot-model',
        required: true,
        source: {
          url: `https://github.com/pollen-robotics/microduck_rl/tree/${MICRODUCK_RL_REVISION}/src/mjlab_microduck/robot/microduck`,
          repositoryUrl: 'https://github.com/pollen-robotics/microduck_rl',
          revision: MICRODUCK_RL_REVISION,
          path: 'src/mjlab_microduck/robot/microduck',
        },
        cache: {
          path: 'microduck/official-sim/models/microduck',
        },
        license: {
          name: 'Apache-2.0 repository; 3D model files reported as CC BY-SA-NC',
          url: `https://github.com/pollen-robotics/microduck_rl/blob/${MICRODUCK_RL_REVISION}/LICENSE`,
          status: 'pending-review',
          notes:
            'The upstream README says source is Apache-2.0 and 3D model files are CC BY-SA-NC. BotLab must review exact model and mesh terms before caching these assets.',
        },
      },
      {
        id: 'microduck-official-policy-manifest',
        label: 'MicroDuck official policy manifest',
        kind: 'policy-manifest',
        required: true,
        source: {
          url: `https://huggingface.co/pollen-robotics/microduck-policies/resolve/${MICRODUCK_POLICIES_REVISION}/manifest.json`,
          repositoryUrl:
            'https://huggingface.co/pollen-robotics/microduck-policies',
          revision: MICRODUCK_POLICIES_REVISION,
          path: 'manifest.json',
        },
        cache: {
          path: 'microduck/official-sim/policies/manifest.json',
          mediaType: 'application/json',
        },
        license: {
          status: 'pending-review',
          notes:
            'Policy artifact license and redistribution terms need explicit review before BotLab downloads or stores ONNX policy files.',
        },
      },
      {
        id: 'microduck-browser-sandbox-source',
        label: 'MicroDuck browser sandbox source',
        kind: 'browser-sandbox-source',
        required: false,
        source: {
          url: `https://huggingface.co/spaces/pollen-robotics/microduck-simulator/tree/${MICRODUCK_BROWSER_SIMULATOR_REVISION}`,
          repositoryUrl:
            'https://huggingface.co/spaces/pollen-robotics/microduck-simulator',
          revision: MICRODUCK_BROWSER_SIMULATOR_REVISION,
          path: 'app/src/game',
        },
        cache: {
          path: 'microduck/official-sim/browser-sandbox-source',
        },
        license: {
          status: 'pending-review',
          notes:
            'The official browser sandbox source is readable from Hugging Face Spaces. BotLab still needs exact redistribution and vendoring review before caching or packaging it.',
        },
      },
    ],
  };

export function validateMicroDuckSimulatorAssetManifest(
  manifest: MicroDuckSimulatorAssetManifest
): MicroDuckSimulatorAssetManifestValidationResult {
  const errors: string[] = [];
  const assetIds = new Set<string>();

  if (manifest.simulatorId !== 'microduck-official-sim') {
    errors.push(
      `Manifest ${manifest.id} targets ${manifest.simulatorId}, expected microduck-official-sim.`
    );
  }

  for (const asset of manifest.assets) {
    if (assetIds.has(asset.id)) {
      errors.push(`Manifest ${manifest.id} has duplicate asset ${asset.id}.`);
    }

    assetIds.add(asset.id);

    if (!isHttpUrl(asset.source.url)) {
      errors.push(`Asset ${asset.id} source URL must be http(s).`);
    }

    if (!asset.source.revision) {
      errors.push(`Asset ${asset.id} must include an upstream revision.`);
    }

    if (!asset.cache.path || asset.cache.path.startsWith('/')) {
      errors.push(`Asset ${asset.id} cache path must be relative.`);
    }

    if (asset.expectedSha256 && !isSha256(asset.expectedSha256)) {
      errors.push(
        `Asset ${asset.id} expectedSha256 must be a SHA-256 hex digest.`
      );
    }

    if (asset.license.status === 'blocked' && asset.required) {
      errors.push(`Required asset ${asset.id} cannot use a blocked license.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function createMicroDuckSimulatorAssetCachePlan(
  manifest: MicroDuckSimulatorAssetManifest,
  cachedAssets: MicroDuckSimulatorCachedAsset[] = []
): MicroDuckSimulatorAssetCachePlan {
  const cachedAssetsById = new Map(
    cachedAssets.map((asset) => [asset.id, asset])
  );
  const entries = manifest.assets.map((asset) =>
    createCachePlanEntry(asset, cachedAssetsById.get(asset.id))
  );

  return {
    manifestId: manifest.id,
    ready: entries.every((entry) => entry.status === 'ready'),
    loadable: entries.every((entry) => entry.status !== 'blocked'),
    entries,
  };
}

export async function inspectMicroDuckSimulatorAssetCache(
  manifest: MicroDuckSimulatorAssetManifest,
  cache: MicroDuckSimulatorAssetCacheStore,
  hashBytes: MicroDuckSimulatorAssetHashFunction
): Promise<MicroDuckSimulatorAssetCachePlan> {
  const maybeCachedAssets = await Promise.all(
    manifest.assets.map(async (asset) => {
      const bytes = await cache.read(asset);

      if (!bytes) {
        return undefined;
      }

      return {
        id: asset.id,
        sha256: await hashBytes(bytes),
      };
    })
  );

  return createMicroDuckSimulatorAssetCachePlan(
    manifest,
    maybeCachedAssets.filter((asset) => asset !== undefined)
  );
}

export async function setupMicroDuckSimulatorAssetCache(
  options: MicroDuckSimulatorAssetCacheSetupOptions
): Promise<MicroDuckSimulatorAssetCacheSetupResult> {
  const validation = validateMicroDuckSimulatorAssetManifest(options.manifest);

  if (!validation.valid) {
    return {
      plan: createMicroDuckSimulatorAssetCachePlan(options.manifest),
      downloadedAssetIds: [],
      skippedAssetIds: options.manifest.assets.map((asset) => asset.id),
      errors: validation.errors,
    };
  }

  const initialPlan = await inspectMicroDuckSimulatorAssetCache(
    options.manifest,
    options.cache,
    options.hashBytes
  );
  const downloadedAssetIds: string[] = [];
  const skippedAssetIds: string[] = [];
  const errors: string[] = [];

  for (const entry of initialPlan.entries) {
    if (entry.status === 'ready') {
      skippedAssetIds.push(entry.asset.id);
      continue;
    }

    if (entry.status !== 'missing' && entry.status !== 'stale') {
      skippedAssetIds.push(entry.asset.id);
      continue;
    }

    try {
      const bytes = await options.downloader.download(entry.asset);
      const sha256 = await options.hashBytes(bytes);

      if (sha256 !== entry.asset.expectedSha256) {
        errors.push(
          `Downloaded asset ${entry.asset.id} has SHA-256 ${sha256}, expected ${entry.asset.expectedSha256}.`
        );
        skippedAssetIds.push(entry.asset.id);
        continue;
      }

      await options.cache.write(entry.asset, bytes);
      downloadedAssetIds.push(entry.asset.id);
    } catch (error) {
      errors.push(
        `Failed to cache asset ${entry.asset.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      skippedAssetIds.push(entry.asset.id);
    }
  }

  return {
    plan: await inspectMicroDuckSimulatorAssetCache(
      options.manifest,
      options.cache,
      options.hashBytes
    ),
    downloadedAssetIds,
    skippedAssetIds,
    errors,
  };
}

export function createMicroDuckBrowserAssetCacheStore(
  options: MicroDuckBrowserAssetCacheStoreOptions = {}
): MicroDuckSimulatorAssetCacheStore {
  return {
    async read(asset) {
      const response = await (
        await openMicroDuckBrowserCache(options)
      ).match(createMicroDuckBrowserAssetCacheRequest(asset, options));

      if (!response) {
        return undefined;
      }

      return new Uint8Array(await response.arrayBuffer());
    },
    async write(asset, bytes) {
      await (
        await openMicroDuckBrowserCache(options)
      ).put(
        createMicroDuckBrowserAssetCacheRequest(asset, options),
        new Response(bytes, {
          headers: {
            'content-type': asset.cache.mediaType ?? 'application/octet-stream',
            'x-botlab-asset-id': asset.id,
          },
        })
      );
    },
  };
}

export function createMicroDuckFetchAssetDownloader(
  fetchAsset: MicroDuckSimulatorAssetFetchFunction = globalThis.fetch.bind(
    globalThis
  )
): MicroDuckSimulatorAssetDownloader {
  return {
    async download(asset) {
      const response = await fetchAsset(asset.source.url);

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} while downloading ${asset.source.url}.`
        );
      }

      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

export async function sha256MicroDuckSimulatorAssetBytes(
  bytes: Uint8Array,
  crypto: Crypto = globalThis.crypto
): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function createCachePlanEntry(
  asset: MicroDuckSimulatorAssetManifestEntry,
  cachedAsset?: MicroDuckSimulatorCachedAsset
): MicroDuckSimulatorAssetCachePlanEntry {
  if (
    asset.license.status === 'blocked' ||
    asset.license.status === 'restricted'
  ) {
    return {
      asset,
      status: 'blocked',
      message: `${asset.label} is blocked until licensing is cleared.`,
    };
  }

  if (asset.license.status === 'pending-review' || !asset.expectedSha256) {
    return {
      asset,
      status: 'pending-review',
      message: `${asset.label} needs license review and a pinned SHA-256 before caching.`,
    };
  }

  if (!cachedAsset) {
    return {
      asset,
      status: 'missing',
      message: `${asset.label} is not present in the simulator asset cache.`,
    };
  }

  if (cachedAsset.sha256 !== asset.expectedSha256) {
    return {
      asset,
      status: 'stale',
      message: `${asset.label} is cached with a hash that does not match the manifest.`,
    };
  }

  return {
    asset,
    status: 'ready',
    message: `${asset.label} is cached and verified.`,
  };
}

function isHttpUrl(value: string) {
  return value.startsWith('https://') || value.startsWith('http://');
}

function isSha256(value: string) {
  return /^[a-f0-9]{64}$/i.test(value);
}

async function openMicroDuckBrowserCache(
  options: MicroDuckBrowserAssetCacheStoreOptions
) {
  const cacheStorage = options.cacheStorage ?? globalThis.caches;

  if (!cacheStorage) {
    throw new Error('Browser Cache Storage is not available.');
  }

  return cacheStorage.open(options.cacheName ?? MICRODUCK_BROWSER_CACHE_NAME);
}

function createMicroDuckBrowserAssetCacheRequest(
  asset: MicroDuckSimulatorAssetManifestEntry,
  options: MicroDuckBrowserAssetCacheStoreOptions
) {
  return new Request(
    new URL(
      asset.cache.path,
      options.cacheBaseUrl ?? MICRODUCK_BROWSER_CACHE_BASE_URL
    ).toString()
  );
}
