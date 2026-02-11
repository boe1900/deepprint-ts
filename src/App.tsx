import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { api, ApiError, type FolderWithTemplates } from '@/lib/api-client';
import { TypstDocument } from '@myriaddreamin/typst.react';
import { type TypstCompiler, createTypstCompiler, preloadRemoteFonts, MemoryAccessModel, initOptions } from '@myriaddreamin/typst.ts';
import { DefaultChatTransport } from 'ai';
import Editor, { type OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import {
  Code2, Eye, Database, Save,
  PanelRightClose, PanelRight, Loader2,
  Sparkles, AlertCircle,
  ZoomIn, ZoomOut, RotateCcw, Maximize2,
  Sun, Moon, Monitor,
  Bold, Italic, Underline, Heading, List, ListOrdered, Code, Download, Lock
} from 'lucide-react';
import { useTheme, THEMES } from './hooks/useTheme';

// Assistant UI Integration
import { Thread } from '@/components/assistant-ui/thread';
import { useChatRuntime } from '@assistant-ui/react-ai-sdk';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { TooltipProvider } from '@/components/ui/tooltip';

// Auth
import { authClient } from '@/lib/auth-client';
import { LoginDialog } from '@/components/auth/login-dialog';

// New layout components
import TemplateTree from '@/components/TemplateTree';
import DataEditorDialog from '@/components/DataEditorDialog';
import { InputDialog } from '@/components/InputDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';

// =============================================================================
// 🌌 Typst Universe 插件预加载 (编译时静态分析)
// =============================================================================
// 使用 Vite 的 glob 功能在编译时扫描并打包所有文件
// eager: true - 同步加载，打包进 bundle
// query: '?raw' - 作为纯文本字符串导入

// 加载所有 .typ 源文件
const universeTypFiles = import.meta.glob('./universe/**/*.typ', {
  query: '?raw',
  import: 'default',
  eager: true
});

// 加载所有 typst.toml 包清单文件
const universeTomlFiles = import.meta.glob('./universe/**/typst.toml', {
  query: '?raw',
  import: 'default',
  eager: true
});

// 加载所有 .js 脚本文件 (如 cades 包需要的 qrcode.js)
const universeJsFiles = import.meta.glob('./universe/**/*.js', {
  query: '?raw',
  import: 'default',
  eager: true
});

// 加载所有 .wasm 二进制文件 (获取 URL，稍后异步 fetch)
const universeWasmUrls = import.meta.glob('./universe/**/*.wasm', {
  query: '?url',
  import: 'default',
  eager: true
});

// 合并文本文件并转换为虚拟路径映射
// 注意: 使用 /@memory/packages/ 前缀，这是 MemoryAccessModel 要求的格式
const universeTextPackages = Object.entries({ ...universeTypFiles, ...universeTomlFiles, ...universeJsFiles }).reduce<Record<string, string>>((acc, [filePath, content]) => {
  const match = filePath.match(/\.?\/universe\/(.+)$/);
  if (match) {
    const virtualPath = `/@memory/packages/${match[1]}`;
    acc[virtualPath] = content as string;
  }
  return acc;
}, {});

// 构建 WASM 文件的虚拟路径映射 (值是 URL，需要异步加载)
const universeWasmPaths = Object.entries(universeWasmUrls).reduce<Record<string, string>>((acc, [filePath, url]) => {
  const match = filePath.match(/\.?\/universe\/(.+)$/);
  if (match) {
    const virtualPath = `/@memory/packages/${match[1]}`;
    acc[virtualPath] = url as string;
  }
  return acc;
}, {});

// 异步加载所有 WASM 文件并返回合并后的包数据
let wasmLoadPromise: Promise<Record<string, Uint8Array>> | null = null;
async function loadWasmPackages() {
  // 只加载一次
  if (wasmLoadPromise) return wasmLoadPromise;

  wasmLoadPromise = (async () => {
    const wasmData: Record<string, Uint8Array> = {};
    for (const [virtualPath, url] of Object.entries(universeWasmPaths)) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          wasmData[virtualPath] = new Uint8Array(buffer);
          console.log(`📦 已加载 WASM: ${virtualPath}`);
        }
      } catch (err) {
        console.warn(`⚠️ 无法加载 WASM: ${virtualPath}`, err);
      }
    }
    return wasmData;
  })();

  return wasmLoadPromise;
}

// 初始包数据 (文本文件)，WASM 文件将在运行时异步合并
let universePackages = { ...universeTextPackages };

// 🌌 自定义 PackageRegistry - 从打包的 bundle 中解析 @preview 包
class BundledPackageRegistry {
  packages: Record<string, string | Uint8Array>;
  am: MemoryAccessModel;
  resolved: Set<string>;

  constructor(packages: Record<string, string | Uint8Array>, accessModel: MemoryAccessModel) {
    this.packages = packages;
    this.am = accessModel;
    this.resolved = new Set();
  }

  resolve(spec: { namespace: string; name: string; version: string }, _context: any) {
    // 只处理 preview 命名空间
    if (spec.namespace !== 'preview') {
      return undefined;
    }

    // 使用 /@memory/packages/ 前缀
    const packageDir = `/@memory/packages/preview/${spec.name}/${spec.version}`;

    // 检查是否已经解析过
    if (this.resolved.has(packageDir)) {
      return packageDir;
    }

    // 检查包是否存在于 bundle 中
    const tomlPath = `${packageDir}/typst.toml`;
    if (!this.packages[tomlPath]) {
      console.warn(`📦 包 @preview/${spec.name}:${spec.version} 未在本地 Universe 中找到`);
      return undefined;
    }

    // 将包文件注册到 AccessModel
    const encoder = new TextEncoder();
    for (const [path, content] of Object.entries(this.packages)) {
      if (path.startsWith(packageDir)) {
        // 将字符串内容转换为 Uint8Array
        const data = typeof content === 'string' ? encoder.encode(content) : content;
        this.am.insertFile(path, data, new Date());
      }
    }

    this.resolved.add(packageDir);
    console.log(`📦 已加载包: @preview/${spec.name}:${spec.version}`);
    return packageDir;
  }
}

// 🌌 模块级单例 - 避免组件重新挂载时重复加载包
const sharedAccessModel = new MemoryAccessModel();
const sharedPackageRegistry = new BundledPackageRegistry(universePackages, sharedAccessModel);

// 确保 WASM 文件已加载 (只加载一次)
let wasmLoaded = false;
async function ensureWasmLoaded() {
  if (wasmLoaded) return;

  const wasmData = await loadWasmPackages();
  // 合并 WASM 数据到 universePackages
  Object.assign(universePackages, wasmData);
  // 同时更新 PackageRegistry 的引用
  sharedPackageRegistry.packages = universePackages;
  wasmLoaded = true;

  if (Object.keys(wasmData).length > 0) {
    console.log('📦 WASM 文件合并完成:', Object.keys(wasmData));
  }
}

// 将 JSON 值转换为 Typst 字面量语法
const jsonToTypst = (value: any): string => {
  if (value === null || value === undefined) {
    return 'none';
  }
  if (typeof value === 'string') {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    const items = value.map(jsonToTypst).join(', ');
    return `(${items})`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([k, v]) => `${k}: ${jsonToTypst(v)}`)
      .join(', ');
    return `(${entries})`;
  }
  return String(value);
};

// 配置 Typst 渲染器 WASM 路径 (0.6.0 全局配置)
TypstDocument.setWasmModuleInitOptions({
  getModule: () => ({
    module_or_path: fetch('/assets/typst_ts_renderer_bg.wasm').then(res => res.arrayBuffer())
  }),
  beforeBuild: []
});

// Typst WASM 渲染器组件 - PDF 阅读器风格预览
export interface TypstPreviewRef {
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitToWidth: () => void;
  exportPdf: () => Promise<Uint8Array | null>;
}

const TypstPreview = forwardRef<
  TypstPreviewRef,
  { code: string; data: any; onZoomChange?: (zoom: number) => void }
>(({ code, data, onZoomChange }, ref) => {
  const [compiler, setCompiler] = useState<TypstCompiler | null>(null);
  const [artifact, setArtifact] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 缩放状态
  const [zoom, setZoom] = useState(1); // 100% = 1
  const containerRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);

  // 缩放控制函数
  const zoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.25, 3)); // 最大 300%
  }, []);

  const zoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.25, 0.25)); // 最小 25%
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1); // 重置为 100%
  }, []);

  const fitToWidth = useCallback(() => {
    if (!containerRef.current || !documentRef.current) return;

    // 获取容器可用宽度（减去 padding）
    const containerWidth = containerRef.current.clientWidth - 64; // 32px padding each side
    // 获取文档原始宽度
    const documentWidth = documentRef.current.scrollWidth / zoom;

    if (documentWidth > 0) {
      const newZoom = Math.min(containerWidth / documentWidth, 2); // 最大适应到 200%
      setZoom(Math.max(newZoom, 0.25));
    }
  }, [zoom]);

  const buildFullCode = useCallback(() => {
    // 使用 Typst 内置的 json.decode 解析 JSON 字符串，比手动拼接字符串更健壮
    const dataCode = `#let data = json.decode("${JSON.stringify(data).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")\n`;
    return dataCode + code;
  }, [code, data]);

  const exportPdf = useCallback(async (): Promise<Uint8Array | null> => {
    if (!compiler || !code) return null;
    try {
      const mainFilePath = '/main.typ';
      const fullCode = buildFullCode();
      compiler.addSource(mainFilePath, fullCode);
      const compileResult = await compiler.compile({ mainFilePath, format: 'pdf' });
      const pdfData = compileResult.result;
      if (!pdfData || pdfData.length === 0) {
        if (compileResult.diagnostics && compileResult.diagnostics.length > 0) {
          const firstError = compileResult.diagnostics[0];
          const errorMsg = typeof firstError === 'string'
            ? firstError
            : (firstError.message || JSON.stringify(firstError));
          setError(`编译错误: ${errorMsg}`);
        }
        return null;
      }
      setError(null);
      return pdfData;
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
      return null;
    }
  }, [buildFullCode, code, compiler]);

  useImperativeHandle(ref, () => ({
    zoom,
    zoomIn,
    zoomOut,
    resetZoom,
    fitToWidth,
    exportPdf,
  }), [zoom, zoomIn, zoomOut, resetZoom, fitToWidth, exportPdf]);

  useEffect(() => {
    onZoomChange?.(zoom);
  }, [onZoomChange, zoom]);

  // 初始化编译器
  useEffect(() => {
    let mounted = true;
    const initCompiler = async () => {
      try {
        const comp = createTypstCompiler();

        // 加载字体
        let fontDataList: Uint8Array[] = [];
        try {
          const fontFiles = [
            'DejaVuSansMono-Bold.ttf',
            'DejaVuSansMono.ttf',
            'LibertinusSans-Bold.otf',
            'LibertinusSans-Italic.otf',
            'LibertinusSans-Regular.otf',
            'LibertinusSerif-Bold.otf',
            'LibertinusSerif-BoldItalic.otf',
            'LibertinusSerif-Italic.otf',
            'LibertinusSerif-Regular.otf',
            'NewCMMath-Book.otf',
            'NotoSansSC-Bold.ttf',
            'NotoSansSC-Regular.ttf',
            'NotoSerifSC-Bold.ttf',
            'NotoSerifSC-Regular.ttf',
            "NotoEmoji-VariableFont_wght.ttf"
          ];

          console.log(`正在加载 ${fontFiles.length} 个字体...`);

          const fontPromises = fontFiles.map(async (file) => {
            try {
              const res = await fetch(`/fonts/${file}`);
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const buffer = await res.arrayBuffer();
              return new Uint8Array(buffer);
            } catch (e) {
              console.error(`Failed to load font ${file}:`, e);
              return null;
            }
          });

          const results = await Promise.all(fontPromises);
          fontDataList = results.filter(f => f !== null);
          console.log(`成功加载 ${fontDataList.length}/${fontFiles.length} 个字体`);

        } catch (fontErr) {
          console.error('Fatal error loading fonts:', fontErr);
        }

        // 确保 WASM 文件已加载 (如 jogs.wasm)
        await ensureWasmLoaded();

        // 使用模块级共享实例
        await comp.init({
          getModule: () => ({
            module_or_path: fetch('/assets/typst_ts_web_compiler_bg.wasm').then(res => res.arrayBuffer())
          }),
          beforeBuild: [
            preloadRemoteFonts(fontDataList),
            initOptions.withAccessModel(sharedAccessModel),
            initOptions.withPackageRegistry(sharedPackageRegistry)
          ]
        });

        console.log('📦 Universe 包注册完成，可用包:', Object.keys(universePackages).filter(p => p.endsWith('typst.toml')).map(p => p.replace('/@memory/packages/', '@').replace('/typst.toml', '').replace('/', ':')));

        if (mounted) {
          setCompiler(comp);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to init compiler:', err);
        if (mounted) {
          setError(`引擎初始化失败: ${err instanceof Error ? err.message : String(err)}`);
          setLoading(false);
        }
      }
    };

    initCompiler();
    return () => { mounted = false; };
  }, []);

  // 编译代码
  useEffect(() => {
    if (!compiler || !code) return;

    const compile = async () => {
      try {
        const fullCode = buildFullCode();

        // 编译
        const mainFilePath = '/main.typ';
        compiler.addSource(mainFilePath, fullCode);
        const compileResult = await compiler.compile({
          mainFilePath
        });

        console.log('Compilation Result:', compileResult);
        const artifactData = compileResult.result;

        if (artifactData && artifactData.length > 0) {
          console.log('Artifact size:', artifactData.length);
          setArtifact(artifactData);
          setError(null);
        } else {
          console.warn('Artifact is empty!');
          if (compileResult.diagnostics && compileResult.diagnostics.length > 0) {
            // 详细打印每个诊断信息
            compileResult.diagnostics.forEach((d, i) => {
              console.error(`编译错误 #${i + 1}:`, d);
            });
            // 将第一个错误显示给用户
            const firstError = compileResult.diagnostics[0];
            const errorMsg = typeof firstError === 'string'
              ? firstError
              : (firstError.message || JSON.stringify(firstError));
            setError(`编译错误: ${errorMsg}`);
          }
        }
      } catch (err) {
        console.error('Compile error:', err);
        setError(err instanceof Error ? err.message : '编译错误');
      }
    };

    // 防抖处理
    const timer = setTimeout(compile, 300);
    return () => clearTimeout(timer);
  }, [compiler, code, buildFullCode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-200 dark:bg-slate-800 text-gray-500 dark:text-gray-400">
        <Loader2 className="animate-spin mr-2" size={20} />
        <span>加载 Typst 引擎...</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-200 dark:bg-slate-800">
      {/* 预览区域 - 可滚动 */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-8"
        style={{
          backgroundImage: `
            radial-gradient(circle, rgba(0,0,0,0.05) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px'
        }}
      >
        {/* 错误提示 */}
        {error && (
          <div className="fixed top-16 right-4 bg-red-100 text-red-600 p-3 rounded-lg shadow-lg text-xs flex items-center gap-2 z-50 border border-red-200">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* 文档容器 - 纸张效果 */}
        {artifact && (
          <div className="flex justify-center">
            <div
              ref={documentRef}
              className="bg-white"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
                // 给文档一个基础宽度，80mm ≈ 302px (at 96 DPI)
                minWidth: '302px',
                // 使用 inline-block 让容器能根据内容自适应
                display: 'inline-block',
                // 纸张阴影效果
                boxShadow: `
                  0 4px 6px -1px rgba(0, 0, 0, 0.1),
                  0 10px 15px -3px rgba(0, 0, 0, 0.1),
                  0 20px 25px -5px rgba(0, 0, 0, 0.1),
                  0 25px 50px -12px rgba(0, 0, 0, 0.25)
                `
              }}
            >
              <TypstDocument
                fill="#ffffff"
                artifact={artifact}
              />
            </div>
          </div>
        )}

        {/* 无内容时的占位 */}
        {!artifact && !error && (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center">
              <Eye size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-sm">等待编译...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// 默认 Typst 代码
const DEFAULT_CODE = `
// DeepPrint Default Template
// 优化：使用 A5 纸张，视觉更紧凑；边距适中
#set page(paper: "a5", margin: (x: 1.5cm, y: 1.5cm))
#set text(font: "Noto Sans SC", size: 10pt, lang: "zh")

// 1. 安全获取数据
//#let data = json.decode(sys.inputs.data)

// 定义一些辅助颜色和样式
#let primary-color = rgb("#2563eb")
#let bg-color = rgb("#eff6ff")
#let code-block(content) = rect(
  fill: luma(245),
  stroke: luma(220),
  inset: 8pt,
  radius: 4pt,
  width: 100%,
  text(font: "Cascadia Code", size: 8pt, fill: luma(80), content)
)

// 2. 页面布局
#align(center)[
  // --- 顶部 Header ---
  #block(inset: (bottom: 1em))[
    #text(2.2em, weight: "black", fill: primary-color)[DeepPrint]
    #h(0.5em)
    #text(1.2em, weight: "bold", fill: gray)[智能打印模版]
  ]

  // --- 核心引导卡片 ---
  #rect(
    width: 100%,
    radius: 8pt,
    stroke: none,
    fill: bg-color,
    inset: 1.5em
  )[
    #set align(left)
    #grid(
      columns: (auto, 1fr),
      gutter: 1em,
      // 左侧图标（用emoji代替）
      text(2.5em)[🚀],
      // 右侧文字
      [
        #text(1.2em, weight: "bold", fill: primary-color)[模版已就绪] \
        #v(0.5em)
        这是一个全新的空白画布。您可以直接在此处编写 Typst 代码，或者呼叫 *DeepPrint AI 助手* 帮您生成。
      ]
    )
  ]

  #v(2em)

  // --- 功能展示区 (让画面不那么空) ---
  #grid(
    columns: (1fr, 1fr),
    gutter: 1em,
    [
      #set align(left)
      #text(weight: "bold", fill: luma(100))[📝 常用指令示例]
      #v(0.5em)
      - 生成 *销售出库单*
      - 设计 *100x150 面单*
      - 添加 *二维码* 和 *Logo*
      - 绑定 *JSON 数据*
    ],
    [
      #set align(left)
      #text(weight: "bold", fill: luma(100))[📊 数据绑定预览]
      #v(0.5em)
      // 模拟一个简单的数据展示，让用户知道数据去哪了
      #code-block(
        if data.keys().len() == 0 [
          // 空数据时的占位
          { "message": "No Data" }
        ] else [
          // 有数据时显示 Keys
          #data
        ]
      )
    ]
  )
  
  #v(2fr) // 撑开空间，把页脚推到底部

  // --- 页脚 ---
  #line(length: 100%, stroke: 0.5pt + gray)
  #v(0.5em)
  #text(0.8em, fill: gray)[
    DeepPrint Studio · 现在的纸张大小是 A5
  ]
]
`;

// 默认数据
const DEFAULT_DATA = {
  "order_id": "ORD-20268888",
  "time": "2026-02-04 12:30",
  "total": "128.00",
  "items": [
    {
      "name": "拿铁咖啡",
      "price": 28.00
    },
    {
      "name": "海盐芝士蛋糕",
      "price": 35.00
    },
    {
      "name": "经典意式肉酱面",
      "price": 45.00
    },
    {
      "name": "鲜榨橙汁",
      "price": 20.00
    }
  ]
};

// =============================================================================
// 🤖 ChatPanel - AI 对话面板 (使用 assistant-ui)
// =============================================================================
interface ChatPanelProps {
  onCodeExtracted: (code: string) => void;
  onClose: () => void;
}

const ChatPanel = ({ onCodeExtracted, onClose }: ChatPanelProps) => {
  // 从 AI 响应中提取 Typst 代码
  const extractTypstCode = useCallback((content: string) => {
    // 提取 ```typst ... ``` 代码块
    const match = content.match(/```typst\n([\s\S]*?)```/);
    if (match) {
      onCodeExtracted(match[1].trim());
    }
  }, [onCodeExtracted]);

  // 使用 useChatRuntime 连接到后端 API
  const runtime = useChatRuntime({
    transport: new DefaultChatTransport({ api: '/api/generate' }),
    onFinish: ({ message }) => {
      // AI 完成后，提取 Typst 代码
      if (message.role === 'assistant') {
        // 从 message.parts 提取文本内容
        const textContent = message.parts
          ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
          .map(part => part.text)
          .join('') || '';
        if (textContent) {
          extractTypstCode(textContent);
        }
      }
    },
  });

  return (
    <div className="w-[360px] h-full flex flex-col bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700/60 flex-shrink-0">
      {/* Header */}
      <div className="h-14 flex-shrink-0 border-b border-slate-200/70 dark:border-slate-700/60 flex items-center px-4 gap-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
        <div className="w-9 h-9 bg-slate-900 dark:bg-white rounded-xl flex items-center justify-center text-white dark:text-slate-900 shadow-sm">
          <Sparkles size={18} />
        </div>
        <div>
          <h1 className="font-bold text-sm text-slate-900 dark:text-white">DeepPrint AI</h1>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">设计助手在线</p>
        </div>
        <button
          onClick={onClose}
          className="ml-auto p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500"
        >
          <PanelRightClose size={18} />
        </button>
      </div>

      {/* Thread (assistant-ui) */}
      <div className="flex-1 min-h-0">
        <TooltipProvider>
          <AssistantRuntimeProvider runtime={runtime}>
            <Thread />
          </AssistantRuntimeProvider>
        </TooltipProvider>
      </div>
    </div>
  );
};

export default function DeepPrintStudio() {
  // Typst 代码和数据状态
  const [code, setCode] = useState(DEFAULT_CODE);
  const [data, setData] = useState<Record<string, unknown>>(DEFAULT_DATA);

  // UI 状态
  const [showChat, setShowChat] = useState(true);
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [previewZoom, setPreviewZoom] = useState(1);
  const [showDataModal, setShowDataModal] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState('');

  // API 数据状态
  const [folders, setFolders] = useState<FolderWithTemplates[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 新建弹窗状态
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createDialogMode, setCreateDialogMode] = useState<'folder' | 'template'>('folder');
  const [createTargetFolderId, setCreateTargetFolderId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // 重命名弹窗状态
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameDialogMode, setRenameDialogMode] = useState<'folder' | 'template'>('folder');
  const [renameTargetId, setRenameTargetId] = useState('');
  const [renameDefaultValue, setRenameDefaultValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteDialogMode, setDeleteDialogMode] = useState<'folder' | 'template'>('folder');
  const [deleteTargetId, setDeleteTargetId] = useState('');
  const [deleteTargetName, setDeleteTargetName] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [deleteBlockedMessage, setDeleteBlockedMessage] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [showBlankDialog, setShowBlankDialog] = useState(false);
  const [blankFolderId, setBlankFolderId] = useState('');
  const [blankError, setBlankError] = useState('');
  const [returnToBlankAfterCreateFolder, setReturnToBlankAfterCreateFolder] = useState(false);

  // TypstPreview ref for zoom controls
  const previewRef = useRef<TypstPreviewRef>(null);

  // Auth
  const [session, setSession] = useState<{ user: { id?: string | null; name?: string | null; email?: string | null; image?: string | null; createdAt?: string | Date | null } } | null>(null);
  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      setSession(data);
    }).catch(() => {
      setSession(null);
    });
  }, []);

  // 登录后加载分组列表
  const loadFolders = useCallback(async () => {
    setIsLoadingFolders(true);
    try {
      const data = await api.getFolders();
      setFolders(data);
    } catch {
      // 未登录或网络错误时保持空列表
      setFolders([]);
    } finally {
      setIsLoadingFolders(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user) {
      loadFolders();
    } else {
      setFolders([]);
    }
  }, [session, loadFolders]);

  const isAuthed = !!session?.user;
  const hasActiveTemplate = !!activeTemplateId;

  // 选择模版 → 从 API 加载详情
  const handleSelectTemplate = useCallback(async (id: string) => {
    setActiveTemplateId(id);
    try {
      const detail = await api.getTemplate(id);
      setCode(detail.content || DEFAULT_CODE);
      setData(detail.mock_data && Object.keys(detail.mock_data).length > 0 ? detail.mock_data : DEFAULT_DATA);
    } catch (err) {
      console.error('加载模版失败:', err);
    }
  }, []);

  // 保存当前模版
  const handleSave = useCallback(async () => {
    if (!activeTemplateId) return;
    setIsSaving(true);
    try {
      await api.updateTemplate(activeTemplateId, { content: code, mock_data: data });
    } catch (err) {
      console.error('保存失败:', err);
      alert('保存失败，请检查网络连接或登录状态');
    } finally {
      setIsSaving(false);
    }
  }, [activeTemplateId, code, data]);

  // 打开新建分组弹窗
  const handleCreateFolder = useCallback(() => {
    setCreateDialogMode('folder');
    setCreateTargetFolderId('');
    setCreateError('');
    setShowCreateDialog(true);
  }, []);

  // 打开新建模版弹窗
  const handleCreateTemplate = useCallback((folderId: string) => {
    setCreateDialogMode('template');
    setCreateTargetFolderId(folderId);
    setCreateError('');
    setShowCreateDialog(true);
  }, []);

  // 预留：热门模板选择上线后，恢复一键套用逻辑
  // const handleQuickStart = useCallback(() => {
  //   const allTemplates = folders.flatMap(f => f.templates);
  //   if (allTemplates.length > 0) {
  //     handleSelectTemplate(allTemplates[0].id);
  //     return;
  //   }
  //   if (folders.length > 0) {
  //     setCreateDialogMode('template');
  //     setCreateTargetFolderId(folders[0].id);
  //     setShowCreateDialog(true);
  //     return;
  //   }
  //   setCreateDialogMode('folder');
  //   setCreateTargetFolderId('');
  //   setShowCreateDialog(true);
  // }, [folders, handleSelectTemplate]);

  const handleCreateBlankTemplate = useCallback(() => {
    setBlankError('');
    if (folders.length > 0) {
      setBlankFolderId(folders[0].id);
    } else {
      setBlankFolderId('');
    }
    setShowBlankDialog(true);
  }, [folders]);

  const handleCreateBlankConfirm = useCallback(async (name: string) => {
    const nextName = name.trim();
    if (!nextName) {
      setBlankError('名称不能为空');
      return;
    }
    if (!blankFolderId) {
      setBlankError('请先选择分组');
      return;
    }
    setIsCreating(true);
    try {
      const targetFolder = folders.find(f => f.id === blankFolderId);
      const hasDuplicate = targetFolder?.templates?.some(t => t.name.trim().toLowerCase() === nextName.toLowerCase());
      if (hasDuplicate) {
        setBlankError('同一分组下模版名称不能重复');
        return;
      }
      const newTemplate = await api.createTemplate(blankFolderId, nextName);
      handleSelectTemplate(newTemplate.id);
      await loadFolders();
      setShowBlankDialog(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setBlankError('同一分组下模版名称不能重复');
        } else if (err.status === 400) {
          setBlankError(err.message || '名称不合法');
        } else {
          setBlankError(err.message || '创建失败，请稍后再试');
        }
      } else {
        setBlankError(err instanceof Error ? err.message : '创建失败，请稍后再试');
      }
    } finally {
      setIsCreating(false);
    }
  }, [blankFolderId, folders, handleSelectTemplate, loadFolders]);

  // 弹窗确认回调
  const handleCreateConfirm = useCallback(async (name: string) => {
    const nextName = name.trim();
    if (!nextName) {
      setCreateError('名称不能为空');
      return;
    }
    setIsCreating(true);
    try {
      if (createDialogMode === 'folder') {
        const createdFolder = await api.createFolder(nextName);
        await loadFolders();
        if (returnToBlankAfterCreateFolder) {
          setReturnToBlankAfterCreateFolder(false);
          setBlankFolderId(createdFolder.id);
          setShowBlankDialog(true);
          setShowCreateDialog(false);
          return;
        }
      } else {
        const targetFolder = folders.find(f => f.id === createTargetFolderId);
        const hasDuplicate = targetFolder?.templates?.some(t => t.name.trim().toLowerCase() === nextName.toLowerCase());
        if (hasDuplicate) {
          setCreateError('同一分组下模版名称不能重复');
          return;
        }
        const newTemplate = await api.createTemplate(createTargetFolderId, nextName);
        handleSelectTemplate(newTemplate.id);
      }
      await loadFolders();
      setShowCreateDialog(false);
    } catch (err) {
      console.error(`创建${createDialogMode === 'folder' ? '分组' : '模版'}失败:`, err);
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setCreateError(createDialogMode === 'folder' ? '分组名称不能重复' : '同一分组下模版名称不能重复');
        } else if (err.status === 400) {
          setCreateError(err.message || '名称不合法');
        } else {
          setCreateError(err.message || '创建失败，请稍后再试');
        }
      }
    } finally {
      setIsCreating(false);
    }
  }, [createDialogMode, createTargetFolderId, loadFolders, handleSelectTemplate, returnToBlankAfterCreateFolder]);

  const handleRenameFolder = useCallback((id: string, name: string) => {
    setRenameDialogMode('folder');
    setRenameTargetId(id);
    setRenameDefaultValue(name);
    setRenameError('');
    setShowRenameDialog(true);
  }, []);

  const handleRenameTemplate = useCallback((id: string, name: string) => {
    setRenameDialogMode('template');
    setRenameTargetId(id);
    setRenameDefaultValue(name);
    setRenameError('');
    setShowRenameDialog(true);
  }, []);

  const handleRenameConfirm = useCallback(async (name: string) => {
    const nextName = name.trim();
    if (!nextName) {
      setRenameError('名称不能为空');
      return;
    }
    setIsRenaming(true);
    try {
      if (renameDialogMode === 'folder') {
        await api.updateFolder(renameTargetId, { name: nextName });
      } else {
        const targetFolder = folders.find(f => f.templates.some(t => t.id === renameTargetId));
        const hasDuplicate = targetFolder?.templates?.some(t =>
          t.id !== renameTargetId && t.name.trim().toLowerCase() === nextName.toLowerCase()
        );
        if (hasDuplicate) {
          setRenameError('同一分组下模版名称不能重复');
          return;
        }
        await api.updateTemplate(renameTargetId, { name: nextName });
      }
      await loadFolders();
      setShowRenameDialog(false);
    } catch (err) {
      console.error(`重命名${renameDialogMode === 'folder' ? '分组' : '模版'}失败:`, err);
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setRenameError(renameDialogMode === 'folder' ? '分组名称不能重复' : '同一分组下模版名称不能重复');
        } else if (err.status === 400) {
          setRenameError(err.message || '名称不合法');
        } else {
          setRenameError(err.message || '操作失败');
        }
      } else {
        setRenameError(err instanceof Error ? err.message : '操作失败');
      }
    } finally {
      setIsRenaming(false);
    }
  }, [renameDialogMode, renameTargetId, loadFolders]);

  const handleDeleteFolder = useCallback((id: string) => {
    const target = folders.find(f => f.id === id);
    if (target && target.templates.length > 0) {
      setDeleteDialogMode('folder');
      setDeleteTargetId(id);
      setDeleteTargetName(target.name);
      setDeleteBlocked(true);
      setDeleteBlockedMessage('该分组下存在模版，无法删除。请先移动或删除分组内的模版。');
      setShowDeleteDialog(true);
      return;
    }
    setDeleteDialogMode('folder');
    setDeleteTargetId(id);
    setDeleteTargetName(target?.name ?? '');
    setDeleteBlocked(false);
    setDeleteBlockedMessage('');
    setShowDeleteDialog(true);
  }, [folders]);

  const handleDeleteTemplate = useCallback((id: string) => {
    const target = folders.flatMap(f => f.templates).find(t => t.id === id);
    setDeleteDialogMode('template');
    setDeleteTargetId(id);
    setDeleteTargetName(target?.name ?? '');
    setDeleteBlocked(false);
    setDeleteBlockedMessage('');
    setShowDeleteDialog(true);
  }, [folders]);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteBlocked) {
      setShowDeleteDialog(false);
      return;
    }
    setIsDeleting(true);
    try {
      if (deleteDialogMode === 'folder') {
        await api.deleteFolder(deleteTargetId);
      } else {
        await api.deleteTemplate(deleteTargetId);
        if (activeTemplateId === deleteTargetId) {
          setActiveTemplateId('');
          setCode(DEFAULT_CODE);
          setData(DEFAULT_DATA);
        }
      }
      await loadFolders();
      setShowDeleteDialog(false);
    } catch (err) {
      console.error(`删除${deleteDialogMode === 'folder' ? '分组' : '模版'}失败:`, err);
      alert(err instanceof Error ? err.message : '删除失败');
    } finally {
      setIsDeleting(false);
    }
  }, [activeTemplateId, deleteBlocked, deleteDialogMode, deleteTargetId, loadFolders]);

  const sanitizeFilename = useCallback((name: string) => {
    return name.replace(/[\\/:*?"<>|]/g, '_');
  }, []);

  const handleExportPdf = useCallback(async () => {
    if (!previewRef.current) return;
    setIsExportingPdf(true);
    try {
      const pdfBytes = await previewRef.current.exportPdf();
      if (!pdfBytes || pdfBytes.length === 0) {
        alert('导出失败，请检查模板是否有编译错误');
        return;
      }
      const activeTemplate = folders.flatMap(f => f.templates).find(t => t.id === activeTemplateId);
      const baseName = sanitizeFilename(activeTemplate?.name || 'typst-export');
      const safeBytes = new Uint8Array(pdfBytes);
      const blob = new Blob([safeBytes.buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('导出 PDF 失败:', err);
      alert('导出失败，请稍后再试');
    } finally {
      setIsExportingPdf(false);
    }
  }, [activeTemplateId, folders, sanitizeFilename]);

  // 主题
  const { theme, resolvedTheme, cycleTheme } = useTheme();
  const ThemeIcon = theme === THEMES.SYSTEM ? Monitor : (theme === THEMES.LIGHT ? Sun : Moon);
  const themeLabel = theme === THEMES.SYSTEM ? '跟随系统' : (theme === THEMES.LIGHT ? '浅色' : '深色');

  // AI 代码回调
  const handleCodeExtracted = useCallback((extractedCode: string) => {
    setCode(extractedCode);
  }, []);

  // Monaco 编辑器 ref
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
  }, []);

  // 快捷插入：包裹选中文本
  const wrapSelection = useCallback((prefix: string, suffix: string = prefix) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;
    const selectedText = model.getValueInRange(selection);
    const newText = `${prefix}${selectedText}${suffix}`;
    editor.executeEdits('toolbar', [{ range: selection, text: newText, forceMoveMarkers: true }]);
    if (!selectedText) {
      const position = editor.getPosition();
      if (position) {
        editor.setPosition({ lineNumber: position.lineNumber, column: position.column - suffix.length });
      }
    }
    editor.focus();
  }, []);

  // 快捷插入：行首添加前缀
  const prefixLine = useCallback((prefix: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const position = editor.getPosition();
    const model = editor.getModel();
    if (!position || !model) return;
    const lineContent = model.getLineContent(position.lineNumber);
    if (lineContent.startsWith(prefix)) {
      editor.executeEdits('toolbar', [{
        range: { startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: prefix.length + 1 },
        text: '', forceMoveMarkers: true
      }]);
    } else {
      editor.executeEdits('toolbar', [{
        range: { startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: 1 },
        text: prefix, forceMoveMarkers: true
      }]);
    }
    editor.focus();
  }, []);

  return (
    <div className="flex h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-white overflow-hidden transition-colors">

      {/* ─── 左侧栏：模版资源管理器 ─── */}
      <TemplateTree
        groups={folders}
        isLoading={isLoadingFolders}
        activeTemplateId={activeTemplateId}
        onSelectTemplate={handleSelectTemplate}
        onCreateFolder={handleCreateFolder}
        onCreateTemplate={handleCreateTemplate}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onRenameTemplate={handleRenameTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        user={session?.user}
        onLogin={() => setShowLoginDialog(true)}
        onCycleTheme={cycleTheme}
        themeLabel={themeLabel}
        ThemeIcon={ThemeIcon}
        isAuthed={isAuthed}
      />

      {/* ─── 中间栏：预览 + 代码 ─── */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-100 dark:bg-slate-800/30 relative overflow-hidden">

        {/* 工具栏 */}
        <div className="h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between px-5 z-10 shadow-sm shrink-0">
          {/* 左侧信息 */}
          <div className="flex items-center gap-4">
            {/* Tab 切换：预览 / 代码 */}
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <button
                onClick={() => isAuthed && setActiveTab('preview')}
                disabled={!isAuthed}
                title={!isAuthed ? '登录后可使用' : undefined}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${activeTab === 'preview'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  } ${!isAuthed ? 'opacity-50 cursor-not-allowed hover:text-slate-500 dark:hover:text-slate-400' : ''}`}
              >
                <Eye size={14} /> 预览
              </button>
              <button
                onClick={() => isAuthed && setActiveTab('code')}
                disabled={!isAuthed}
                title={!isAuthed ? '登录后可使用' : undefined}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${activeTab === 'code'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  } ${!isAuthed ? 'opacity-50 cursor-not-allowed hover:text-slate-500 dark:hover:text-slate-400' : ''}`}
              >
                <Code2 size={14} /> 代码
              </button>
            </div>

            <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

            {/* 缩放控制 - 仅在预览模式显示 */}
            {activeTab === 'preview' && hasActiveTemplate && (
              <div className="flex items-center gap-1">
                <button onClick={() => previewRef.current?.zoomOut()} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="缩小">
                  <ZoomOut size={15} />
                </button>
                <div className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[11px] text-slate-500 dark:text-slate-400 min-w-[48px] text-center font-mono tabular-nums">
                  {Math.round(previewZoom * 100)}%
                </div>
                <button onClick={() => previewRef.current?.zoomIn()} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="放大">
                  <ZoomIn size={15} />
                </button>
                <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-0.5" />
                <button onClick={() => previewRef.current?.resetZoom()} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="重置 100%">
                  <RotateCcw size={14} />
                </button>
                <button onClick={() => previewRef.current?.fitToWidth()} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="适应宽度">
                  <Maximize2 size={14} />
                </button>
              </div>
            )}

            {/* 快捷格式化按钮 - 仅在 Code 模式显示 */}
            {activeTab === 'code' && (
              <div className="flex items-center gap-0.5">
                <button onClick={() => wrapSelection('*')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="加粗">
                  <Bold size={15} />
                </button>
                <button onClick={() => wrapSelection('_')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="斜体">
                  <Italic size={15} />
                </button>
                <button onClick={() => wrapSelection('#underline[', ']')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="下划线">
                  <Underline size={15} />
                </button>
                <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1" />
                <button onClick={() => prefixLine('= ')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="标题">
                  <Heading size={15} />
                </button>
                <button onClick={() => prefixLine('- ')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="列表">
                  <List size={15} />
                </button>
                <button onClick={() => prefixLine('+ ')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="有序列表">
                  <ListOrdered size={15} />
                </button>
                <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1" />
                <button onClick={() => wrapSelection('$')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="公式">
                  <span className="text-sm font-serif">Σ</span>
                </button>
                <button onClick={() => wrapSelection('```\n', '\n```')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="代码块">
                  <Code size={15} />
                </button>
              </div>
            )}
          </div>

          {/* 右侧操作 */}
          <div className="flex items-center gap-3">
            {hasActiveTemplate && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {isSaving ? '保存中...' : '保存'}
              </button>
            )}

            <button
              onClick={() => setShowDataModal(true)}
              disabled={!hasActiveTemplate}
              className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-all"
            >
              <Database size={14} className="text-green-600 dark:text-green-400" /> 模拟数据
            </button>

            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf || activeTab !== 'preview' || !hasActiveTemplate}
              className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-all"
              title={!hasActiveTemplate ? '请选择或新建模版后导出' : (activeTab !== 'preview' ? '切换到预览后可导出' : '导出 PDF')}
            >
              {isExportingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} className="text-slate-500 dark:text-slate-400" />}
              {isExportingPdf ? '导出中...' : '导出 PDF'}
            </button>

            {/* 展开/折叠 AI 面板 */}
            {!showChat && (
              <button
                onClick={() => setShowChat(true)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                title="展开 AI 对话"
              >
                <PanelRight size={18} />
              </button>
            )}
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-hidden relative">
          {/* 预览 Tab */}
          {activeTab === 'preview' && (
            <div className="w-full h-full bg-slate-200 dark:bg-slate-800">
              {hasActiveTemplate ? (
                <TypstPreview
                  ref={previewRef}
                  code={code}
                  data={data}
                  onZoomChange={setPreviewZoom}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="max-w-[520px] text-center px-6">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-white/60 dark:border-slate-700/60 shadow-sm flex items-center justify-center">
                      <Sparkles size={22} className="text-slate-500 dark:text-slate-300" />
                    </div>
                    <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">先选一个模板开始</h2>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      选择一个模板，我们会帮你自动填好结构，快速进入编辑。
                    </p>
                    <div className="mt-5 flex items-center justify-center gap-3">
                      <button
                        disabled
                        title="热门模板选择，敬请期待"
                        className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold shadow-sm opacity-50 cursor-not-allowed"
                      >
                        热门模板选择，敬请期待
                      </button>
                      <button
                        onClick={handleCreateBlankTemplate}
                        className="px-4 py-2 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-white"
                      >
                        从空白开始
                      </button>
                    </div>
                    <p className="mt-4 text-xs text-slate-400">
                      也可以在左侧新建或选择模板
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 代码 Tab */}
          {activeTab === 'code' && (
            hasActiveTemplate ? (
              <Editor
                height="100%"
                defaultLanguage="markdown"
                theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                value={code}
                onChange={(value) => setCode(value || '')}
                onMount={handleEditorMount}
                options={{
                  fontSize: 14,
                  fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  padding: { top: 16 },
                  scrollBeyondLastLine: false,
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-50 dark:bg-slate-900">
                <div className="max-w-[520px] text-center px-6">
                  <div className="mx-auto w-16 h-16 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center">
                    <Code2 size={22} className="text-slate-500 dark:text-slate-300" />
                  </div>
                  <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">先选模板再开始编辑</h2>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    选择一个模板或新建一个空白模板后，代码编辑器会在这里出现。
                  </p>
                  <div className="mt-5 flex items-center justify-center gap-3">
                    <button
                      disabled
                      title="热门模板选择，敬请期待"
                      className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold shadow-sm opacity-50 cursor-not-allowed"
                    >
                      热门模板选择，敬请期待
                    </button>
                    <button
                      onClick={handleCreateBlankTemplate}
                      className="px-4 py-2 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-white"
                    >
                      从空白开始
                    </button>
                  </div>
                </div>
              </div>
            )
          )}

          {!isAuthed && (
            <div className="absolute inset-0 bg-white/60 dark:bg-slate-900/70 backdrop-blur-sm z-10 flex items-center justify-center">
              <div className="max-w-[420px] w-[86%] bg-white/90 dark:bg-slate-900/90 border border-white/70 dark:border-slate-700/60 shadow-xl rounded-2xl p-6 text-center">
                <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 text-white flex items-center justify-center shadow-sm">
                  <Lock size={18} />
                </div>
                <h2 className="mt-4 text-base font-bold text-slate-900 dark:text-white">登录后开始制作</h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  登录后可保存模板、导出 PDF，并使用更多功能。
                </p>
                <button
                  onClick={() => setShowLoginDialog(true)}
                  className="mt-4 w-full px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                >
                  使用 GitHub 登录
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="h-7 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700/60 px-4 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
          <span>Typst WASM Engine v0.6</span>
          <span>{code.length} chars</span>
        </div>
      </main>

      {/* ─── 右侧栏：AI 对话 ─── */}
      <div className={showChat ? '' : 'hidden'}>
        <ChatPanel
          onCodeExtracted={handleCodeExtracted}
          onClose={() => setShowChat(false)}
        />
      </div>

      {/* 模拟数据弹窗 */}
      <DataEditorDialog
        open={showDataModal}
        onOpenChange={setShowDataModal}
        data={data}
        onSave={setData}
        resolvedTheme={resolvedTheme}
      />

      {/* 登录对话框 */}
      <LoginDialog open={showLoginDialog} onOpenChange={setShowLoginDialog} />

      {/* 新建分组 / 模版弹窗 */}
      <InputDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) setCreateError('');
        }}
        title={createDialogMode === 'folder' ? '新建业务分组' : '新建模版'}
        description={createDialogMode === 'folder' ? '分组用于组织和管理你的模版' : '在当前分组中创建一个新的模版'}
        placeholder={createDialogMode === 'folder' ? '例如：餐饮业务' : '例如：收银小票'}
        defaultValue={createDialogMode === 'template' ? '未命名模版' : ''}
        confirmLabel={createDialogMode === 'folder' ? '新建分组' : '新建模版'}
        isLoading={isCreating}
        errorMessage={createError}
        onValueChange={() => setCreateError('')}
        onConfirm={handleCreateConfirm}
      />

      <InputDialog
        open={showRenameDialog}
        onOpenChange={(open) => {
          setShowRenameDialog(open);
          if (!open) setRenameError('');
        }}
        title={renameDialogMode === 'folder' ? '重命名业务分组' : '重命名模版'}
        description={renameDialogMode === 'folder' ? '修改分组名称' : '修改模版名称'}
        placeholder={renameDialogMode === 'folder' ? '例如：餐饮业务' : '例如：收银小票'}
        defaultValue={renameDefaultValue}
        confirmLabel="重命名"
        isLoading={isRenaming}
        errorMessage={renameError}
        onValueChange={() => setRenameError('')}
        onConfirm={handleRenameConfirm}
      />

      <InputDialog
        open={showBlankDialog}
        onOpenChange={(open) => {
          setShowBlankDialog(open);
          if (!open) setBlankError('');
        }}
        title="选择分组并创建模版"
        description="将空白模板放入指定分组，方便后续管理"
        placeholder="例如：收银小票"
        defaultValue="未命名模版"
        confirmLabel="创建模版"
        isLoading={isCreating}
        errorMessage={blankError}
        onValueChange={() => setBlankError('')}
        confirmDisabled={!blankFolderId}
        selectLabel="放入分组"
        selectValue={blankFolderId}
        selectOptions={folders.map(f => ({ value: f.id, label: f.name }))}
        selectPlaceholder={folders.length > 0 ? '请选择分组' : '暂无分组'}
        onSelectChange={(value) => {
          setBlankFolderId(value);
          setBlankError('');
        }}
        selectActionLabel="新建分组"
        onSelectAction={() => {
          setShowBlankDialog(false);
          setCreateDialogMode('folder');
          setCreateTargetFolderId('');
          setCreateError('');
          setReturnToBlankAfterCreateFolder(true);
          setShowCreateDialog(true);
        }}
        onConfirm={handleCreateBlankConfirm}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={deleteDialogMode === 'folder' ? '删除业务分组' : '删除模版'}
        description={deleteBlocked
          ? deleteBlockedMessage
          : (deleteDialogMode === 'folder'
            ? `确定要删除分组“${deleteTargetName || '未命名分组'}”吗？此操作不可恢复。`
            : `确定要删除模版“${deleteTargetName || '未命名模版'}”吗？此操作不可恢复。`)}
        confirmLabel={deleteBlocked ? '知道了' : '删除'}
        cancelLabel="取消"
        showCancel={!deleteBlocked}
        variant={deleteBlocked ? 'default' : 'danger'}
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
