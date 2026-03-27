import { MemoryAccessModel } from '@myriaddreamin/typst.ts';

const universeTypFiles = import.meta.glob('../universe/**/*.typ', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const universeTomlFiles = import.meta.glob('../universe/**/typst.toml', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const universeJsFiles = import.meta.glob('../universe/**/*.js', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const universeWasmUrls = import.meta.glob('../universe/**/*.wasm', {
  query: '?url',
  import: 'default',
  eager: true,
});

const toVirtualPackagePath = (filePath: string) => {
  const match = filePath.match(/universe\/(.+)$/);
  if (!match) return null;
  return `/@memory/packages/${match[1]}`;
};

const universeTextPackages = Object.entries({
  ...universeTypFiles,
  ...universeTomlFiles,
  ...universeJsFiles,
}).reduce<Record<string, string>>((acc, [filePath, content]) => {
  const virtualPath = toVirtualPackagePath(filePath);
  if (virtualPath) {
    acc[virtualPath] = content as string;
  }
  return acc;
}, {});

const universeWasmPaths = Object.entries(universeWasmUrls).reduce<Record<string, string>>((acc, [filePath, url]) => {
  const virtualPath = toVirtualPackagePath(filePath);
  if (virtualPath) {
    acc[virtualPath] = url as string;
  }
  return acc;
}, {});

class BundledPackageRegistry {
  packages: Record<string, string | Uint8Array>;
  am: MemoryAccessModel;
  resolved: Set<string>;

  constructor(packages: Record<string, string | Uint8Array>, accessModel: MemoryAccessModel) {
    this.packages = packages;
    this.am = accessModel;
    this.resolved = new Set();
  }

  resolve(spec: { namespace: string; name: string; version: string }, _context: unknown) {
    if (spec.namespace !== 'preview') {
      return undefined;
    }

    const packageDir = `/@memory/packages/preview/${spec.name}/${spec.version}`;
    if (this.resolved.has(packageDir)) {
      return packageDir;
    }

    const tomlPath = `${packageDir}/typst.toml`;
    if (!this.packages[tomlPath]) {
      console.warn(`📦 包 @preview/${spec.name}:${spec.version} 未在本地 Universe 中找到`);
      return undefined;
    }

    const encoder = new TextEncoder();
    for (const [path, content] of Object.entries(this.packages)) {
      if (!path.startsWith(packageDir)) continue;
      const data = typeof content === 'string' ? encoder.encode(content) : content;
      this.am.insertFile(path, data, new Date());
    }

    this.resolved.add(packageDir);
    console.log(`📦 已加载包: @preview/${spec.name}:${spec.version}`);
    return packageDir;
  }
}

export const universePackages: Record<string, string | Uint8Array> = {
  ...universeTextPackages,
};

export const sharedAccessModel = new MemoryAccessModel();
export const sharedPackageRegistry = new BundledPackageRegistry(universePackages, sharedAccessModel);

let wasmLoadPromise: Promise<Record<string, Uint8Array>> | null = null;
let wasmLoaded = false;

const loadWasmPackages = async () => {
  if (wasmLoadPromise) return wasmLoadPromise;

  wasmLoadPromise = (async () => {
    const wasmData: Record<string, Uint8Array> = {};
    for (const [virtualPath, url] of Object.entries(universeWasmPaths)) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const buffer = await response.arrayBuffer();
        wasmData[virtualPath] = new Uint8Array(buffer);
        console.log(`📦 已加载 WASM: ${virtualPath}`);
      } catch (err) {
        console.warn(`⚠️ 无法加载 WASM: ${virtualPath}`, err);
      }
    }
    return wasmData;
  })();

  return wasmLoadPromise;
};

export const ensureWasmLoaded = async () => {
  if (wasmLoaded) return;

  const wasmData = await loadWasmPackages();
  Object.assign(universePackages, wasmData);
  sharedPackageRegistry.packages = universePackages;
  wasmLoaded = true;

  if (Object.keys(wasmData).length > 0) {
    console.log('📦 WASM 文件合并完成:', Object.keys(wasmData));
  }
};

export const listBundledPreviewPackages = () => (
  Object.keys(universePackages)
    .filter((path) => path.endsWith('typst.toml'))
    .map((path) => path.replace('/@memory/packages/', '@').replace('/typst.toml', '').replace('/', ':'))
);
