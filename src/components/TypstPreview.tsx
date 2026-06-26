import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AlertCircle, Eye, Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { briefErrorText } from '@/lib/brief-error-text';
import { bytesFromBase64, compileTemplateBundleForFeedback, type CompileFeedback } from '@/lib/typst-compile';
import { getBundleTemplate, mergeTemplateBundleState, type TemplateBundleFiles } from '@/lib/template-bundle';

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
    nextFiles?: TemplateBundleFiles,
  ) => Promise<CompileFeedback>;
}

interface TypstPreviewProps {
  bundleFiles: TemplateBundleFiles;
  code: string;
  data: Record<string, unknown>;
  onZoomChange?: (zoom: number) => void;
}

const TypstPreview = forwardRef<TypstPreviewRef, TypstPreviewProps>(({
  bundleFiles,
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
    nextFiles?: TemplateBundleFiles,
  ): Promise<CompileFeedback> => {
    const files = nextFiles ?? mergeTemplateBundleState(bundleFiles, nextCode ?? code, nextData ?? data);
    const sourceCode = getBundleTemplate(files);

    setLoading(true);
    const result = await compileTemplateBundleForFeedback(files, sourceCode, {
      format: 'png',
      includeArtifactBase64: true,
    });
    if (result.ok) {
      if (result.artifactBase64) {
        setArtifactUrl(`data:${result.artifactMimeType};base64,${result.artifactBase64}`);
      }
      setError(null);
    } else if (!suppressUiError && result.error) {
      setError(result.error);
    }

    setLoading(false);
    return result;
  }, [bundleFiles, code, data]);

  const exportPdf = useCallback(async (): Promise<Uint8Array | null> => {
    try {
      const files = mergeTemplateBundleState(bundleFiles, code, data);
      const result = await api.compileTemplateBundle(files, {
        format: 'pdf',
        include_artifact_base64: true,
      });
      return result.artifact_base64 ? bytesFromBase64(result.artifact_base64) : null;
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
      return null;
    }
  }, [bundleFiles, code, data]);

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
        {loading && !artifactUrl && (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <Loader2 className="animate-spin mr-2" size={20} />
            <span>编译中...</span>
          </div>
        )}

        {artifactUrl && (
          <div className="flex flex-col items-center gap-4">
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

        {!artifactUrl && error && !loading && (
          <div className="flex min-h-full items-center justify-center text-slate-500 dark:text-slate-300">
            <div
              className="mx-auto max-w-[680px] rounded-lg border border-red-200 bg-white/95 p-4 text-sm shadow-sm dark:border-red-900/50 dark:bg-slate-950/80"
              title={error}
            >
              <div className="flex items-start gap-3 text-red-700 dark:text-red-200">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">编译失败</p>
                  <p className="mt-1 text-xs leading-5 text-red-600 dark:text-red-200">
                    {briefErrorText(error, 520)}
                  </p>
                </div>
              </div>
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
