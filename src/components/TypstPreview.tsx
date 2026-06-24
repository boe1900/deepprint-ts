import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AlertCircle, Eye, Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { briefErrorText } from '@/lib/brief-error-text';
import { toTemplateBundleFiles } from '@/lib/template-bundle';

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

const bytesFromBase64 = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const extractDiagnostics = (message: string, source: string): CompileFeedback['diagnostics'] => {
  const lineMatch = message.match(/line\s+(\d+)(?:[:\s,]+column\s+(\d+))?/i);
  const line = lineMatch?.[1] ? Number(lineMatch[1]) : undefined;
  const column = lineMatch?.[2] ? Number(lineMatch[2]) : undefined;
  return {
    message,
    line,
    column,
    snippet: line ? source.split('\n')[line - 1]?.trim() : undefined,
  };
};

const TypstPreview = forwardRef<TypstPreviewRef, TypstPreviewProps>(({
  code,
  data,
  onZoomChange,
}, ref) => {
  const [artifactUrl, setArtifactUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);

  const zoomIn = useCallback(() => setZoom((prev) => Math.min(prev + 0.25, 3)), []);
  const zoomOut = useCallback(() => setZoom((prev) => Math.max(prev - 0.25, 0.25)), []);
  const resetZoom = useCallback(() => setZoom(1), []);

  const fitToWidth = useCallback(() => {
    if (!containerRef.current || !documentRef.current) return;
    const containerWidth = containerRef.current.clientWidth - 64;
    const documentWidth = documentRef.current.scrollWidth / zoom;
    if (documentWidth <= 0) return;
    setZoom(Math.max(Math.min(containerWidth / documentWidth, 2), 0.25));
  }, [zoom]);

  const compileAndGetError = useCallback(async (
    nextCode?: string,
    nextData?: Record<string, unknown>,
    suppressUiError = false,
  ): Promise<CompileFeedback> => {
    const sourceCode = nextCode ?? code;
    const files = toTemplateBundleFiles(undefined, sourceCode, nextData ?? data);

    try {
      setLoading(true);
      const result = await api.compileTemplateBundle(files, {
        format: 'png',
        include_artifact_base64: true,
      });
      if (result.artifact_base64) {
        setArtifactUrl(`data:${result.artifact_mime_type};base64,${result.artifact_base64}`);
      }
      setError(null);
      return { ok: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '编译失败';
      if (!suppressUiError) setError(errorMsg);
      return {
        ok: false,
        error: errorMsg,
        diagnostics: extractDiagnostics(errorMsg, sourceCode),
      };
    } finally {
      setLoading(false);
    }
  }, [code, data]);

  const exportPdf = useCallback(async (): Promise<Uint8Array | null> => {
    try {
      const files = toTemplateBundleFiles(undefined, code, data);
      const result = await api.compileTemplateBundle(files, {
        format: 'pdf',
        include_artifact_base64: true,
      });
      return result.artifact_base64 ? bytesFromBase64(result.artifact_base64) : null;
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
      return null;
    }
  }, [code, data]);

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
    const timer = window.setTimeout(() => {
      void compileAndGetError(undefined, undefined, false);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [compileAndGetError]);

  return (
    <div className="w-full h-full flex flex-col bg-slate-200 dark:bg-slate-800">
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-8"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.05) 1px, transparent 1px)',
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

        {loading && !artifactUrl && (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <Loader2 className="animate-spin mr-2" size={20} />
            <span>编译中...</span>
          </div>
        )}

        {artifactUrl && (
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
              <img src={artifactUrl} alt="Typst preview" className="block max-w-none" />
            </div>
          </div>
        )}

        {!artifactUrl && !error && !loading && (
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
