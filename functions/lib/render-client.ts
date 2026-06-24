import type { RenderFormat, TemplateBundleFiles } from './template-bundle';

export type RenderClientEnv = {
  TJR_RENDER_BASE_URL?: string
  TJR_RENDER_API_KEY?: string
}

export type RenderRequest = {
  files: TemplateBundleFiles
  data_json?: string
  format?: RenderFormat
  include_artifact_base64?: boolean
}

export type RenderCompileResult = {
  ok: true
  manifest: unknown
  artifact_id: string
  artifact_format: RenderFormat
  artifact_name: string
  artifact_mime_type: string
  artifact_path: string
  artifact_bytes: number
  artifact_sha256: string
  artifact_base64?: string
}

export type RenderValidateResult = {
  ok: true
  manifest: unknown
  compile_checked: boolean
  artifact_returned: false
}

const renderBaseUrl = (env: RenderClientEnv) => {
  const baseUrl = (env.TJR_RENDER_BASE_URL || '').replace(/\/+$/, '');
  if (!baseUrl) throw new Error('未配置 TJR_RENDER_BASE_URL');
  return baseUrl;
};

const callRender = async <T>(
  env: RenderClientEnv,
  path: '/debug/validate-files' | '/debug/compile-files',
  body: RenderRequest,
): Promise<T> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (env.TJR_RENDER_API_KEY) {
    headers.Authorization = `Bearer ${env.TJR_RENDER_API_KEY}`;
  }

  const response = await fetch(`${renderBaseUrl(env)}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || `Render service returned ${response.status}`);
  }
  return payload as T;
};

export const validateTemplateBundle = (
  env: RenderClientEnv,
  body: RenderRequest,
) => callRender<RenderValidateResult>(env, '/debug/validate-files', {
  ...body,
  format: body.format || 'png',
  include_artifact_base64: false,
});

export const compileTemplateBundle = (
  env: RenderClientEnv,
  body: RenderRequest,
) => callRender<RenderCompileResult>(env, '/debug/compile-files', {
  ...body,
  format: body.format || 'png',
});
