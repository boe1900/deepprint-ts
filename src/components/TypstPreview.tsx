import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AlertCircle, Eye, Loader2 } from 'lucide-react';
import { TypstDocument } from '@myriaddreamin/typst.react';
import { type TypstCompiler, createTypstCompiler, initOptions, preloadRemoteFonts } from '@myriaddreamin/typst.ts';
import { briefErrorText } from '@/lib/brief-error-text';
import {
  ensureWasmLoaded,
  listBundledPreviewPackages,
  sharedAccessModel,
  sharedPackageRegistry,
} from '@/lib/typst-universe';

TypstDocument.setWasmModuleInitOptions({
  getModule: () => ({
    module_or_path: fetch('/assets/typst_ts_renderer_bg.wasm').then((res) => res.arrayBuffer()),
  }),
  beforeBuild: [],
});

const FONT_FILES = [
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
  'NotoEmoji-VariableFont_wght.ttf',
];

export interface TypstPreviewRef {
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitToWidth: () => void;
  exportPdf: () => Promise<Uint8Array | null>;
  compileAndGetError: (
    nextCode?: string,
    nextData?: Record<string, unknown>,
    suppressUiError?: boolean,
  ) => Promise<CompileFeedback>;
}

export type CompileFeedback = {
  ok: boolean;
  error?: string;
  diagnostics?: {
    message: string;
    line?: number;
    column?: number;
    snippet?: string;
  };
};

interface TypstPreviewProps {
  code: string;
  data: Record<string, unknown>;
  onZoomChange?: (zoom: number) => void;
}

type FontBytes = Uint8Array<ArrayBufferLike>;

const TypstPreview = forwardRef<TypstPreviewRef, TypstPreviewProps>(({
  code,
  data,
  onZoomChange,
}, ref) => {
  const [compiler, setCompiler] = useState<TypstCompiler | null>(null);
  const [artifact, setArtifact] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);

  const zoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.25, 3));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.25, 0.25));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
  }, []);

  const fitToWidth = useCallback(() => {
    if (!containerRef.current || !documentRef.current) return;

    const containerWidth = containerRef.current.clientWidth - 64;
    const documentWidth = documentRef.current.scrollWidth / zoom;
    if (documentWidth <= 0) return;

    const newZoom = Math.min(containerWidth / documentWidth, 2);
    setZoom(Math.max(newZoom, 0.25));
  }, [zoom]);

  const buildFullCodeWith = useCallback((nextCode: string, nextData: Record<string, unknown>) => {
    const dataCode = `#let data = json.decode("${JSON.stringify(nextData).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")\n`;
    return dataCode + nextCode;
  }, []);

  const buildFullCode = useCallback(() => {
    return buildFullCodeWith(code, data);
  }, [buildFullCodeWith, code, data]);

  const extractDiagnosticMeta = useCallback((rawDiagnostic: unknown): { message: string; line?: number; column?: number } => {
    const fallback = { message: '编译失败', line: undefined, column: undefined };
    if (typeof rawDiagnostic === 'string') {
      const lineColumnMatch = rawDiagnostic.match(/line\s+(\d+)(?:[:\s,]+column\s+(\d+))?/i);
      return {
        message: rawDiagnostic,
        line: lineColumnMatch?.[1] ? Number(lineColumnMatch[1]) : undefined,
        column: lineColumnMatch?.[2] ? Number(lineColumnMatch[2]) : undefined,
      };
    }
    if (!rawDiagnostic || typeof rawDiagnostic !== 'object') return fallback;

    const diagnostic = rawDiagnostic as Record<string, unknown>;
    const message = typeof diagnostic.message === 'string'
      ? diagnostic.message
      : JSON.stringify(diagnostic);
    const range = diagnostic.range as { start?: { line?: number; column?: number } } | undefined;
    const span = diagnostic.span as { start?: { line?: number; column?: number } } | undefined;
    const line = typeof diagnostic.line === 'number'
      ? diagnostic.line
      : typeof range?.start?.line === 'number'
        ? range.start.line
        : typeof span?.start?.line === 'number'
          ? span.start.line
          : undefined;
    const column = typeof diagnostic.column === 'number'
      ? diagnostic.column
      : typeof range?.start?.column === 'number'
        ? range.start.column
        : typeof span?.start?.column === 'number'
          ? span.start.column
          : undefined;
    return { message, line, column };
  }, []);

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

  const compileAndGetError = useCallback(async (
    nextCode?: string,
    nextData?: Record<string, unknown>,
    suppressUiError = false,
  ): Promise<CompileFeedback> => {
    if (!compiler) return { ok: false, error: '编译器未就绪' };
    try {
      const mainFilePath = '/main.typ';
      const sourceCode = nextCode ?? code;
      const fullCode = buildFullCodeWith(sourceCode, nextData ?? data);
      compiler.addSource(mainFilePath, fullCode);
      const compileResult = await compiler.compile({ mainFilePath });
      const artifactData = compileResult.result;
      if (artifactData && artifactData.length > 0) {
        setArtifact(artifactData);
        setError(null);
        return { ok: true };
      }
      const firstError = compileResult.diagnostics?.[0];
      const diagnosticMeta = extractDiagnosticMeta(firstError);
      const adjustedLine = typeof diagnosticMeta.line === 'number'
        ? Math.max(1, diagnosticMeta.line - 1)
        : undefined;
      const snippet = typeof adjustedLine === 'number'
        ? sourceCode.split('\n')[adjustedLine - 1]?.trim() || undefined
        : undefined;
      const errorMsg = diagnosticMeta.message || '编译失败';
      if (!suppressUiError) {
        setError(`编译错误: ${errorMsg}`);
      }
      return {
        ok: false,
        error: `编译错误: ${errorMsg}`,
        diagnostics: {
          message: errorMsg,
          line: adjustedLine,
          column: diagnosticMeta.column,
          snippet,
        },
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '编译失败';
      if (!suppressUiError) {
        setError(errorMsg);
      }
      return { ok: false, error: errorMsg };
    }
  }, [buildFullCodeWith, code, compiler, data, extractDiagnosticMeta]);

  useImperativeHandle(ref, () => ({
    zoom,
    zoomIn,
    zoomOut,
    resetZoom,
    fitToWidth,
    exportPdf,
    compileAndGetError,
  }), [zoom, zoomIn, zoomOut, resetZoom, fitToWidth, exportPdf, compileAndGetError]);

  useEffect(() => {
    onZoomChange?.(zoom);
  }, [onZoomChange, zoom]);

  useEffect(() => {
    let mounted = true;

    const loadFonts = async (): Promise<FontBytes[]> => {
      console.log(`正在加载 ${FONT_FILES.length} 个字体...`);
      const results = await Promise.all(FONT_FILES.map(async (file) => {
        try {
          const res = await fetch(`/fonts/${file}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = await res.arrayBuffer();
          return new Uint8Array(buffer);
        } catch (err) {
          console.error(`Failed to load font ${file}:`, err);
          return null;
        }
      }));

      const fontDataList = results.reduce<FontBytes[]>((acc, font) => {
        if (font) acc.push(font);
        return acc;
      }, []);
      console.log(`成功加载 ${fontDataList.length}/${FONT_FILES.length} 个字体`);
      return fontDataList;
    };

    const initCompiler = async () => {
      try {
        const comp = createTypstCompiler();
        const fontDataList = await loadFonts();
        await ensureWasmLoaded();
        await comp.init({
          getModule: () => ({
            module_or_path: fetch('/assets/typst_ts_web_compiler_bg.wasm').then((res) => res.arrayBuffer()),
          }),
          beforeBuild: [
            preloadRemoteFonts(fontDataList),
            initOptions.withAccessModel(sharedAccessModel),
            initOptions.withPackageRegistry(sharedPackageRegistry),
          ],
        });

        console.log('📦 Universe 包注册完成，可用包:', listBundledPreviewPackages());
        if (!mounted) return;
        setCompiler(comp);
        setLoading(false);
      } catch (err) {
        console.error('Failed to init compiler:', err);
        if (!mounted) return;
        setError(`引擎初始化失败: ${err instanceof Error ? err.message : String(err)}`);
        setLoading(false);
      }
    };

    initCompiler();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!compiler || !code) return;

    const compile = async () => {
      try {
        const fullCode = buildFullCode();
        const mainFilePath = '/main.typ';
        compiler.addSource(mainFilePath, fullCode);
        const compileResult = await compiler.compile({ mainFilePath });

        console.log('Compilation Result:', compileResult);
        const artifactData = compileResult.result;
        if (artifactData && artifactData.length > 0) {
          console.log('Artifact size:', artifactData.length);
          setArtifact(artifactData);
          setError(null);
          return;
        }

        console.warn('Artifact is empty!');
        if (compileResult.diagnostics && compileResult.diagnostics.length > 0) {
          compileResult.diagnostics.forEach((diagnostic, index) => {
            console.error(`编译错误 #${index + 1}:`, diagnostic);
          });
          const firstError = compileResult.diagnostics[0];
          const errorMsg = typeof firstError === 'string'
            ? firstError
            : (firstError.message || JSON.stringify(firstError));
          setError(`编译错误: ${errorMsg}`);
        }
      } catch (err) {
        console.error('Compile error:', err);
        setError(err instanceof Error ? err.message : '编译错误');
      }
    };

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
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-8"
        style={{
          backgroundImage: `
            radial-gradient(circle, rgba(0,0,0,0.05) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
        }}
      >
        {error && (
          <div
            className="fixed top-16 right-4 max-w-[680px] bg-red-100 text-red-600 p-3 rounded-lg shadow-lg text-xs flex items-center gap-2 z-50 border border-red-200"
            title={error}
          >
            <AlertCircle size={14} />
            <span className="line-clamp-2">{briefErrorText(error, 260)}</span>
          </div>
        )}

        {artifact && (
          <div className="flex justify-center">
            <div
              ref={documentRef}
              className="bg-white"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
                minWidth: '302px',
                display: 'inline-block',
                boxShadow: `
                  0 4px 6px -1px rgba(0, 0, 0, 0.1),
                  0 10px 15px -3px rgba(0, 0, 0, 0.1),
                  0 20px 25px -5px rgba(0, 0, 0, 0.1),
                  0 25px 50px -12px rgba(0, 0, 0, 0.25)
                `,
              }}
            >
              <TypstDocument fill="#ffffff" artifact={artifact} />
            </div>
          </div>
        )}

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

TypstPreview.displayName = 'TypstPreview';

export default TypstPreview;
