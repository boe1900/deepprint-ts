import type { TemplateBundleFiles } from '@/lib/template-bundle';

type PatchChunk = {
  file: string;
  anchor?: string;
  oldLines: string[];
  newLines: string[];
  isEndOfFile: boolean;
};

type PatchOperation =
  | {
    type: 'add';
    file: string;
    content: string;
  }
  | {
    type: 'delete';
    file: string;
  }
  | {
    type: 'update';
    file: string;
    moveTo?: string;
    chunks: PatchChunk[];
  };

export type TemplateBundleEditResult =
  | { ok: true; files: TemplateBundleFiles; changedFiles: string[] }
  | { ok: false; error: string };

type ParsedPatch =
  | { ok: true; operations: PatchOperation[] }
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

const filesEqual = (left: TemplateBundleFiles, right: TemplateBundleFiles) => {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
};

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

const validateBundlePatchPath = (file: string, lineNumber: number) => {
  if (!file) return `patch 第 ${lineNumber} 行缺少文件名`;
  if (file.startsWith('/') || /^[A-Za-z]:[\\/]/.test(file)) {
    return `patch 第 ${lineNumber} 行不能使用绝对路径：${file}`;
  }
  const parts = file.split(/[\\/]+/);
  if (parts.some((part) => part === '..')) {
    return `patch 第 ${lineNumber} 行不能使用 .. 路径：${file}`;
  }
  if (parts.some((part) => part === '')) {
    return `patch 第 ${lineNumber} 行包含无效路径：${file}`;
  }
  return null;
};

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

  const operations: PatchOperation[] = [];
  let file = '';
  let mode: 'none' | 'add' | 'update' = 'none';
  let moveTo: string | undefined;
  let addLines: string[] = [];
  let chunks: PatchChunk[] = [];
  let anchor: string | undefined;
  let oldLines: string[] = [];
  let newLines: string[] = [];
  let isEndOfFile = false;

  const flushChunk = () => {
    if (mode !== 'update' || !file || (oldLines.length === 0 && newLines.length === 0)) return;
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

  const flushOperation = () => {
    if (!file || mode === 'none') return;
    if (mode === 'add') {
      if (addLines.length === 0) {
        throw new Error(`Add File ${file} 至少需要一行 + 内容`);
      }
      operations.push({
        type: 'add',
        file,
        content: `${addLines.join('\n')}\n`,
      });
    } else {
      flushChunk();
      if (chunks.length === 0 && !moveTo) {
        throw new Error(`Update File ${file} 没有可应用的修改块`);
      }
      operations.push({
        type: 'update',
        file,
        ...(moveTo ? { moveTo } : {}),
        chunks,
      });
    }
    file = '';
    mode = 'none';
    moveTo = undefined;
    addLines = [];
    chunks = [];
    anchor = undefined;
    oldLines = [];
    newLines = [];
    isEndOfFile = false;
  };

  for (let index = 1; index < rawLines.length - 1; index += 1) {
    const line = rawLines[index];
    if (line.startsWith('*** Add File: ')) {
      try {
        flushOperation();
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      file = line.slice('*** Add File: '.length).trim();
      const pathError = validateBundlePatchPath(file, index + 1);
      if (pathError) return { ok: false, error: pathError };
      mode = 'add';
      continue;
    }
    if (line.startsWith('*** Delete File: ')) {
      try {
        flushOperation();
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      const deleteFile = line.slice('*** Delete File: '.length).trim();
      const pathError = validateBundlePatchPath(deleteFile, index + 1);
      if (pathError) return { ok: false, error: pathError };
      operations.push({ type: 'delete', file: deleteFile });
      continue;
    }
    if (line.startsWith('*** Update File: ')) {
      try {
        flushOperation();
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      file = line.slice('*** Update File: '.length).trim();
      const pathError = validateBundlePatchPath(file, index + 1);
      if (pathError) return { ok: false, error: pathError };
      mode = 'update';
      continue;
    }
    if (line.startsWith('*** Move to: ')) {
      if (!file || mode !== 'update') {
        return { ok: false, error: `patch 第 ${index + 1} 行必须先声明 *** Update File 才能移动文件` };
      }
      if (chunks.length > 0 || oldLines.length > 0 || newLines.length > 0) {
        return { ok: false, error: `patch 第 ${index + 1} 行的 *** Move to 必须紧跟在 *** Update File 后` };
      }
      moveTo = line.slice('*** Move to: '.length).trim();
      const pathError = validateBundlePatchPath(moveTo, index + 1);
      if (pathError) return { ok: false, error: pathError };
      continue;
    }
    if (!file) {
      return { ok: false, error: `patch 第 ${index + 1} 行必须先声明文件操作` };
    }
    if (mode === 'add') {
      if (!line.startsWith('+')) {
        return { ok: false, error: `Add File ${file} 的内容行必须以 + 开头` };
      }
      addLines.push(line.slice(1));
      continue;
    }
    if (mode !== 'update') {
      return { ok: false, error: `patch 第 ${index + 1} 行处于无效状态` };
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

  try {
    flushOperation();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (operations.length === 0) {
    return { ok: false, error: 'patch 中没有可应用的文件操作' };
  }
  return { ok: true, operations };
};

export const listTemplateBundlePatchFiles = (patch: string) => {
  const parsed = parseTemplateBundlePatch(patch);
  if (!parsed.ok) return parsed;
  return {
    ok: true as const,
    files: Array.from(new Set(parsed.operations.flatMap((operation) => {
      if (operation.type === 'update' && operation.moveTo) return [operation.file, operation.moveTo];
      return [operation.file];
    }))),
  };
};

const applyUpdateChunks = (
  baseFiles: TemplateBundleFiles,
  file: string,
  chunks: PatchChunk[],
): { ok: true; content: string } | { ok: false; error: string } => {
  const content = baseFiles[file];
  if (typeof content !== 'string') {
    return { ok: false, error: `找不到文件 ${file}` };
  }

  let nextContent = content;
  let priorStart = 0;

  for (const chunk of chunks) {
    const lines = nextContent.split('\n');
    const anchorIndex = chunk.anchor ? findAnchorIndex(lines, chunk.anchor, priorStart) : priorStart;
    if (anchorIndex < 0) {
      return { ok: false, error: `patch 无法在 ${file} 中找到上下文锚点：${chunk.anchor}` };
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
          `patch 无法应用到 ${file}。`,
          chunk.anchor ? `锚点：${chunk.anchor}` : '锚点：无',
          chunk.oldLines.length > 0 ? `未匹配到旧行：\n${chunk.oldLines.map((line) => `  ${line}`).join('\n')}` : '空旧行块需要有效锚点才能插入。',
          `当前文件：${fileSummary(file, nextContent)}`,
        ].join('\n'),
      };
    }

    const nextLines = [
      ...lines.slice(0, matchIndex),
      ...chunk.newLines,
      ...lines.slice(matchIndex + chunk.oldLines.length),
    ];
    nextContent = nextLines.join('\n');
    priorStart = matchIndex + chunk.newLines.length;
  }

  return { ok: true, content: nextContent };
};

export const applyTemplateBundlePatch = (
  baseFiles: TemplateBundleFiles,
  patch: string,
): TemplateBundleEditResult => {
  const parsed = parseTemplateBundlePatch(patch);
  if (!parsed.ok) return parsed;

  const nextFiles: TemplateBundleFiles = { ...baseFiles };
  const changedFiles = new Set<string>();

  for (const operation of parsed.operations) {
    if (operation.type === 'add') {
      if (nextFiles[operation.file] !== operation.content) {
        nextFiles[operation.file] = operation.content;
        changedFiles.add(operation.file);
      }
      continue;
    }

    if (operation.type === 'delete') {
      if (typeof nextFiles[operation.file] !== 'string') {
        return { ok: false, error: `找不到文件 ${operation.file}` };
      }
      delete nextFiles[operation.file];
      changedFiles.add(operation.file);
      continue;
    }

    const updateResult = applyUpdateChunks(nextFiles, operation.file, operation.chunks);
    if (!updateResult.ok) return updateResult;

    if (operation.moveTo) {
      delete nextFiles[operation.file];
      nextFiles[operation.moveTo] = updateResult.content;
      changedFiles.add(operation.file);
      changedFiles.add(operation.moveTo);
      continue;
    }

    if (nextFiles[operation.file] !== updateResult.content) {
      nextFiles[operation.file] = updateResult.content;
      changedFiles.add(operation.file);
    }
  }

  if (changedFiles.size === 0 || filesEqual(nextFiles, baseFiles)) {
    return { ok: false, error: 'Original and edited files match exactly. Failed to apply patch.' };
  }

  return {
    ok: true,
    files: nextFiles,
    changedFiles: Array.from(changedFiles),
  };
};
