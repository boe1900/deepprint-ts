import { api, type RenderFormat } from '@/lib/api-client';
import type { TemplateBundleFiles } from '@/lib/template-bundle';

export type CompileFeedbackStep = {
  label: string;
  detail: string;
  state: 'pending' | 'active' | 'done' | 'error';
  error?: string;
};

export type CompileFeedback = {
  ok: boolean;
  error?: string;
  files?: TemplateBundleFiles;
  steps?: CompileFeedbackStep[];
  diagnostics?: {
    message: string;
    line?: number;
    column?: number;
    snippet?: string;
  };
  artifactBase64?: string;
  artifactMimeType?: string;
};

export const bytesFromBase64 = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export const extractDiagnostics = (message: string, source: string): CompileFeedback['diagnostics'] => {
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

export const compileTemplateBundleForFeedback = async (
  files: TemplateBundleFiles,
  sourceCode: string,
  options: {
    format?: RenderFormat;
    includeArtifactBase64?: boolean;
  } = {},
): Promise<CompileFeedback> => {
  try {
    const result = await api.compileTemplateBundle(files, {
      format: options.format ?? 'png',
      include_artifact_base64: options.includeArtifactBase64 ?? false,
    });

    return {
      ok: true,
      artifactBase64: result.artifact_base64,
      artifactMimeType: result.artifact_mime_type,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : '编译失败';
    return {
      ok: false,
      error: errorMsg,
      diagnostics: extractDiagnostics(errorMsg, sourceCode),
    };
  }
};
