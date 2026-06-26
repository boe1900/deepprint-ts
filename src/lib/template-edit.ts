import type { TemplateBundleFiles } from '@/lib/template-bundle';

type PatchChunk = {
  file: string;
  anchor?: string;
  oldLines: string[];
  newLines: string[];
  isEndOfFile: boolean;
};

export type TemplateBundleEditResult =
  | { ok: true; files: TemplateBundleFiles; changedFiles: string[] }
  | { ok: false; error: string };

type ParsedPatch =
  | { ok: true; chunks: PatchChunk[] }
  | { ok: false; error: string };

const hashText = (content: string) => {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const fileSummary = (file: string, content: string) => `${file}: length=${content.length}, lines=${content.split('\n').length}, hash=${hashText(content)}`;

const normalizeLoose = (value: string) => value
  .trim()
  .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
  .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
  .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
  .replace(/[\u00A0\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000]/g, ' ');

const linesMatchAt = (
  lines: string[],
  pattern: string[],
  index: number,
  mode: 'exact' | 'trimEnd' | 'trim' | 'loose',
) => {
  for (let offset = 0; offset < pattern.length; offset += 1) {
    const line = lines[index + offset];
    const expected = pattern[offset];
    if (mode === 'exact' && line !== expected) return false;
    if (mode === 'trimEnd' && line.trimEnd() !== expected.trimEnd()) return false;
    if (mode === 'trim' && line.trim() !== expected.trim()) return false;
    if (mode === 'loose' && normalizeLoose(line) !== normalizeLoose(expected)) return false;
  }
  return true;
};

const seekSequence = (
  lines: string[],
  pattern: string[],
  startIndex: number,
  isEndOfFile = false,
) => {
  if (pattern.length === 0) {
    return Math.max(0, Math.min(startIndex, lines.length));
  }
  if (pattern.length > lines.length) {
    return -1;
  }

  const start = isEndOfFile && lines.length >= pattern.length
    ? lines.length - pattern.length
    : Math.max(0, Math.min(startIndex, lines.length - pattern.length));
  const modes: Array<'exact' | 'trimEnd' | 'trim' | 'loose'> = ['exact', 'trimEnd', 'trim', 'loose'];

  for (const mode of modes) {
    for (let index = start; index <= lines.length - pattern.length; index += 1) {
      if (linesMatchAt(lines, pattern, index, mode)) return index;
    }
  }

  return -1;
};

const findAnchorIndex = (lines: string[], anchor: string, startIndex: number) => {
  const normalized = anchor.trim();
  if (!normalized) return Math.max(0, startIndex);
  return seekSequence(lines, [normalized], startIndex);
};

const splitPatchLines = (text: string) => text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

const parseTemplateBundlePatch = (patch: string): ParsedPatch => {
  if (typeof patch !== 'string' || patch.trim() === '') {
    return { ok: false, error: 'apply_template_bundle_patch 缺少 patch' };
  }
  if (patch.includes('```')) {
    return { ok: false, error: 'patch 必须是原始补丁文本，不能包含 Markdown 代码围栏' };
  }

  const rawLines = splitPatchLines(patch.trim());
  if (rawLines[0]?.trim() !== '*** Begin Patch') {
    return { ok: false, error: "patch 第一行必须是 '*** Begin Patch'" };
  }
  if (rawLines.at(-1)?.trim() !== '*** End Patch') {
    return { ok: false, error: "patch 最后一行必须是 '*** End Patch'" };
  }

  const chunks: PatchChunk[] = [];
  let file = '';
  let anchor: string | undefined;
  let oldLines: string[] = [];
  let newLines: string[] = [];
  let isEndOfFile = false;

  const flushChunk = () => {
    if (!file || (oldLines.length === 0 && newLines.length === 0)) return;
    chunks.push({
      file,
      anchor,
      oldLines,
      newLines,
      isEndOfFile,
    });
    anchor = undefined;
    oldLines = [];
    newLines = [];
    isEndOfFile = false;
  };

  for (let index = 1; index < rawLines.length - 1; index += 1) {
    const line = rawLines[index];
    if (line.startsWith('*** Update File: ')) {
      flushChunk();
      file = line.slice('*** Update File: '.length).trim();
      if (!file) {
        return { ok: false, error: `patch 第 ${index + 1} 行缺少文件名` };
      }
      continue;
    }
    if (line.startsWith('*** Add File: ') || line.startsWith('*** Delete File: ') || line.startsWith('*** Move to: ')) {
      return { ok: false, error: '当前模板补丁只支持 *** Update File；新增、删除或移动文件请使用 update_template_bundle' };
    }
    if (!file) {
      return { ok: false, error: `patch 第 ${index + 1} 行必须先声明 *** Update File` };
    }
    if (line === '@@' || line.startsWith('@@ ')) {
      flushChunk();
      const nextAnchor = line === '@@' ? '' : line.slice(3).trim();
      anchor = nextAnchor || undefined;
      continue;
    }
    if (line === '*** End of File') {
      isEndOfFile = true;
      continue;
    }
    const marker = line[0];
    const value = line.slice(1);
    if (marker === ' ') {
      oldLines.push(value);
      newLines.push(value);
      continue;
    }
    if (marker === '-') {
      oldLines.push(value);
      continue;
    }
    if (marker === '+') {
      newLines.push(value);
      continue;
    }
    return { ok: false, error: `patch 第 ${index + 1} 行必须以空格、+、-、@@ 或 *** 标记开头` };
  }

  flushChunk();
  if (chunks.length === 0) {
    return { ok: false, error: 'patch 中没有可应用的修改块' };
  }
  return { ok: true, chunks };
};

export const listTemplateBundlePatchFiles = (patch: string) => {
  const parsed = parseTemplateBundlePatch(patch);
  if (!parsed.ok) return parsed;
  return {
    ok: true as const,
    files: Array.from(new Set(parsed.chunks.map((chunk) => chunk.file))),
  };
};

export const applyTemplateBundlePatch = (
  baseFiles: TemplateBundleFiles,
  patch: string,
): TemplateBundleEditResult => {
  const parsed = parseTemplateBundlePatch(patch);
  if (!parsed.ok) return parsed;

  const nextFiles: TemplateBundleFiles = { ...baseFiles };
  const changedFiles = new Set<string>();
  const searchStartByFile = new Map<string, number>();

  for (const chunk of parsed.chunks) {
    const content = nextFiles[chunk.file];
    if (typeof content !== 'string') {
      return { ok: false, error: `找不到文件 ${chunk.file}` };
    }

    const lines = content.split('\n');
    const priorStart = searchStartByFile.get(chunk.file) ?? 0;
    const anchorIndex = chunk.anchor ? findAnchorIndex(lines, chunk.anchor, priorStart) : priorStart;
    if (anchorIndex < 0) {
      return { ok: false, error: `patch 无法在 ${chunk.file} 中找到上下文锚点：${chunk.anchor}` };
    }

    const searchStart = chunk.anchor ? anchorIndex + 1 : anchorIndex;
    let matchIndex = seekSequence(lines, chunk.oldLines, searchStart, chunk.isEndOfFile);
    if (matchIndex < 0 && chunk.anchor) {
      matchIndex = seekSequence(lines, chunk.oldLines, anchorIndex, chunk.isEndOfFile);
    }
    if (matchIndex < 0) {
      return {
        ok: false,
        error: [
          `patch 无法应用到 ${chunk.file}。`,
          chunk.anchor ? `锚点：${chunk.anchor}` : '锚点：无',
          chunk.oldLines.length > 0 ? `未匹配到旧行：\n${chunk.oldLines.map((line) => `  ${line}`).join('\n')}` : '空旧行块需要有效锚点才能插入。',
          `当前文件：${fileSummary(chunk.file, content)}`,
        ].join('\n'),
      };
    }

    const nextLines = [
      ...lines.slice(0, matchIndex),
      ...chunk.newLines,
      ...lines.slice(matchIndex + chunk.oldLines.length),
    ];
    const nextContent = nextLines.join('\n');
    nextFiles[chunk.file] = nextContent;
    changedFiles.add(chunk.file);
    searchStartByFile.set(chunk.file, matchIndex + chunk.newLines.length);
  }

  if (changedFiles.size === 0 || Object.keys(nextFiles).every((file) => nextFiles[file] === baseFiles[file])) {
    return { ok: false, error: 'Original and edited files match exactly. Failed to apply patch.' };
  }

  return {
    ok: true,
    files: nextFiles,
    changedFiles: Array.from(changedFiles),
  };
};
