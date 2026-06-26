export type TemplateBundleFiles = Record<string, string>;

export type RenderFormat = 'png' | 'pdf';

const stripWrappingCodeFence = (source: string) => {
  const trimmed = source.trim();
  const match = trimmed.match(/^```(?:typst|typ)?\s*\n([\s\S]*?)\n```\s*$/i);
  return match?.[1] ?? source;
};

const normalizeTemplateSource = (source: string) => stripWrappingCodeFence(source).replace(/^\uFEFF/, '');

export const DEFAULT_TEMPLATE_BUNDLE_FILES: TemplateBundleFiles = {
  'manifest.json': JSON.stringify({
    kind: 'template_bundle',
    version: 'v1',
    id: 'deepprint-default',
    document_type: 'generic',
    mode: 'parametric',
    entry: 'template.typ',
    data: 'data.json',
    data_schema: 'data.schema.json',
    data_contract: 'generic.v1',
  }, null, 2),
  'template.typ': `#let data = json("data.json")

#set page(paper: "a5", margin: 18pt)
#set text(font: "Noto Sans SC", size: 10pt, lang: "zh")

#align(center)[
  #text(size: 18pt, weight: "bold")[DeepPrint]
  #v(8pt)
  #text(fill: gray)[用 AI 开始设计你的模板]
]
`,
  'data.schema.json': JSON.stringify({
    type: 'object',
    additionalProperties: true,
  }, null, 2),
  'data.json': JSON.stringify({
    title: 'DeepPrint',
  }, null, 2),
};

export const normalizeTemplateBundleFiles = (
  files: unknown,
  fallbackContent = '',
  fallbackData: Record<string, unknown> = {},
): TemplateBundleFiles => {
  if (files && typeof files === 'object' && !Array.isArray(files)) {
    const entries = Object.entries(files as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    if (entries.length > 0) {
      const normalized = Object.fromEntries(entries);
      if (typeof normalized['template.typ'] === 'string') {
        normalized['template.typ'] = normalizeTemplateSource(normalized['template.typ']);
      }
      return normalized;
    }
  }

  return {
    ...DEFAULT_TEMPLATE_BUNDLE_FILES,
    'template.typ': fallbackContent
      ? normalizeTemplateSource(fallbackContent)
      : DEFAULT_TEMPLATE_BUNDLE_FILES['template.typ'],
    'data.json': JSON.stringify(fallbackData, null, 2),
  };
};

export const parseBundleDataJson = (files: TemplateBundleFiles): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(files['data.json'] || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};
