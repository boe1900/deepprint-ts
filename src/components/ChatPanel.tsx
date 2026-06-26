import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelRightClose, Settings2, Sparkles } from 'lucide-react';
import { AssistantChatTransport, useChatRuntime } from '@assistant-ui/react-ai-sdk';
import {
  AssistantRuntimeProvider,
  Tools,
  defineToolkit,
  useAui,
  AuiProvider,
  type Toolkit,
  type ToolCallMessagePartComponent,
} from '@assistant-ui/react';
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { Thread } from '@/components/assistant-ui/thread';
import { ToolExecutionCard } from '@/components/assistant-ui/tool-execution-card';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { CompileFeedback } from '@/lib/typst-compile';
import { getBundleData, getBundleTemplate, mergeTemplateBundleState, toTemplateBundleFiles, type TemplateBundleFiles } from '@/lib/template-bundle';
import {
  applyTemplateBundlePatch,
  listTemplateBundlePatchFiles,
  type TemplateBundleEditResult,
} from '@/lib/template-edit';
import {
  getLocalAIProviderLabel,
  isLocalAIConfigReady,
  toRequestScopedAIConfig,
  type LocalAIConfig,
} from '@/lib/local-ai-config';

export interface ChatPanelProps {
  activeTemplateId: string;
  currentBundleFiles: TemplateBundleFiles;
  currentCode: string;
  currentData: Record<string, unknown>;
  initialMessages: Array<{ id?: string; role: string; parts: unknown[] }>;
  localAiConfig: LocalAIConfig | null;
  onPersistMessages: (templateId: string, messages: Array<{ role: string; parts: unknown[] }>) => Promise<void>;
  onApplyAndValidate: (files: TemplateBundleFiles) => Promise<CompileFeedback>;
  onClose: () => void;
  onOpenSettings: () => void;
}

type UpdateTypstResult = CompileFeedback;

type ReadTemplateFileResult = {
  ok: boolean;
  file?: string;
  totalLines?: number;
  startLine?: number;
  endLine?: number;
  content?: string;
  plainContent?: string;
  error?: string;
};

const TOOL_HISTORY_KEEP_MESSAGES = 12;
const MAX_TEXT_PART_CHARS = 1200;

const summarizeToolPart = (part: Record<string, unknown>) => {
  const type = typeof part.type === 'string' ? part.type : 'tool';
  const input = part.input && typeof part.input === 'object' ? part.input as Record<string, unknown> : {};
  const output = part.output && typeof part.output === 'object' ? part.output as Record<string, unknown> : undefined;
  const file = typeof input.file === 'string' ? input.file : typeof output?.file === 'string' ? output.file : undefined;
  const ok = typeof output?.ok === 'boolean' ? output.ok : undefined;
  const error = typeof output?.error === 'string' ? output.error : undefined;
  const changedFiles = Array.isArray(output?.changedFiles) ? output.changedFiles.filter((item): item is string => typeof item === 'string') : [];
  const fileCount = input.files && typeof input.files === 'object' ? Object.keys(input.files as Record<string, unknown>).length : undefined;
  const starterId = typeof input.starterId === 'string' ? input.starterId : undefined;

  return {
    type,
    ...(typeof part.toolCallId === 'string' ? { toolCallId: part.toolCallId } : {}),
    state: typeof part.state === 'string' ? part.state : undefined,
    input: {
      ...(file ? { file } : {}),
      ...(starterId ? { starterId } : {}),
      ...(fileCount !== undefined ? { fileCount } : {}),
    },
    output: {
      ...(ok !== undefined ? { ok } : {}),
      ...(error ? { error: error.slice(0, 600) } : {}),
      ...(changedFiles.length > 0 ? { changedFiles } : {}),
    },
  };
};

const compactMessageParts = (parts: unknown[], keepToolDetails: boolean) => parts
  .map((part) => {
    if (!part || typeof part !== 'object') return part;
    const record = part as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : '';
    if (type === 'text' && typeof record.text === 'string' && record.text.length > MAX_TEXT_PART_CHARS) {
      return { ...record, text: `${record.text.slice(0, MAX_TEXT_PART_CHARS)}\n\n[历史消息已截断]` };
    }
    if (type.startsWith('tool-') && !keepToolDetails) {
      return summarizeToolPart(record);
    }
    return part;
  })
  .filter((part) => {
    if (!part || typeof part !== 'object') return true;
    const type = typeof (part as Record<string, unknown>).type === 'string' ? (part as Record<string, unknown>).type : '';
    return type !== 'step-start';
  });

const compactMessagesForHistory = (messages: any[], keepRecentToolDetails: boolean) => {
  const firstToolMessageToKeep = keepRecentToolDetails ? Math.max(0, messages.length - TOOL_HISTORY_KEEP_MESSAGES) : messages.length;
  return (messages || []).map((chatMessage: any, index) => ({
    ...chatMessage,
    parts: compactMessageParts(
      Array.isArray(chatMessage?.parts) ? chatMessage.parts : [],
      index >= firstToolMessageToKeep,
    ),
  }));
};

const compactMessagesForPersistence = (messages: any[]) => compactMessagesForHistory(messages, false).slice(-80);

const stripFilesFromCompileFeedback = (result: CompileFeedback): CompileFeedback => {
  const nextResult = { ...result };
  delete nextResult.files;
  delete nextResult.artifactBase64;
  return nextResult;
};

const hasFailedToolResult = (messages: any[]) => {
  for (const message of [...(messages || [])].reverse()) {
    const parts = Array.isArray(message?.parts) ? message.parts : [];
    for (const part of [...parts].reverse()) {
      if (!part || typeof part !== 'object') continue;
      const record = part as Record<string, unknown>;
      if (typeof record.type !== 'string' || !record.type.startsWith('tool-')) continue;
      const output = record.output;
      if (output && typeof output === 'object' && (output as Record<string, unknown>).ok === false) {
        return true;
      }
      return false;
    }
  }
  return false;
};

const getToolErrorText = (status: { type: string; error?: unknown } | undefined, result: UpdateTypstResult | undefined) => {
  const stepError = result?.steps?.find((step) => step.error)?.error;
  if (stepError) return stepError;
  if (result?.error) return result.error;
  if (status?.type !== 'incomplete' || status.error === undefined) return null;
  return typeof status.error === 'string' ? status.error : JSON.stringify(status.error);
};

const ToolkitProvider = ({ toolkit, children }: { toolkit: Toolkit; children: React.ReactNode }) => {
  const parent = useAui();
  const aui = useAui({ tools: Tools({ toolkit }) }, { parent });
  return <AuiProvider value={aui}>{children}</AuiProvider>;
};

const UpdateTypstToolCard: ToolCallMessagePartComponent<Record<string, unknown>, UpdateTypstResult> = ({
  status,
  result,
  argsText,
}) => {
  const statusType = status?.type ?? 'complete';
  let shortArgs: { files?: TemplateBundleFiles } | null = null;
  if (argsText) {
    try {
      shortArgs = JSON.parse(argsText) as { files?: TemplateBundleFiles };
    } catch {
      shortArgs = null;
    }
  }
  const files = shortArgs?.files && typeof shortArgs.files === 'object' ? shortArgs.files : undefined;
  const argsReady = Boolean(files);
  const fileCount = files ? Object.keys(files).length : 0;
  const errorText = getToolErrorText(status, result);
  const isRunning = statusType === 'running';
  const compileFailed = statusType === 'incomplete' || result?.ok === false;
  const compileSucceeded = result?.ok === true;
  const isDraftingArgs = isRunning && !argsReady && result === undefined;
  const isExecutingTool = isRunning && argsReady && result === undefined;
  const badgeTone = compileFailed
    ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300'
    : compileSucceeded
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      : isExecutingTool
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
        : isDraftingArgs
          ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  const badgeLabel = compileFailed
    ? '编译失败'
    : compileSucceeded
      ? '编译通过'
      : isExecutingTool
        ? '编译预览中'
        : isDraftingArgs
          ? '生成参数中'
          : statusType === 'requires-action'
            ? '等待确认'
            : '待执行';
  const argsDetail = argsReady
    ? `${fileCount} 个文件已生成`
    : argsText
      ? `正在流式接收工具参数，已接收 ${argsText.length} 字符`
      : '等待模型生成完整 files map';
  const steps = result?.steps ?? [];

  return (
    <ToolExecutionCard
      title="应用模板修改"
      badgeLabel={badgeLabel}
      badgeTone={badgeTone}
      prepareStep={{
        label: '生成工具参数',
        detail: argsDetail,
        state: argsReady ? 'done' : isDraftingArgs ? 'active' : 'pending',
      }}
      runningStep={isExecutingTool ? {
        label: '调用工具',
        detail: '正在执行模板编译',
        state: 'active',
      } : undefined}
      steps={steps}
      errorText={errorText}
    />
  );
};

const PatchTemplateBundleToolCard: ToolCallMessagePartComponent<Record<string, unknown>, UpdateTypstResult> = ({
  status,
  result,
  argsText,
}) => {
  const statusType = status?.type ?? 'complete';
  let shortArgs: { patch?: string } | null = null;
  if (argsText) {
    try {
      shortArgs = JSON.parse(argsText) as { patch?: string };
    } catch {
      shortArgs = null;
    }
  }
  const patchLength = shortArgs?.patch?.length ?? 0;
  const parsedFiles = typeof shortArgs?.patch === 'string' ? listTemplateBundlePatchFiles(shortArgs.patch) : null;
  const fileSummaryText = parsedFiles?.ok ? parsedFiles.files.join(', ') : '等待可解析 patch';
  const argsReady = Boolean(typeof shortArgs?.patch === 'string' && patchLength > 0);
  const errorText = getToolErrorText(status, result);
  const isRunning = statusType === 'running';
  const compileFailed = statusType === 'incomplete' || result?.ok === false;
  const compileSucceeded = result?.ok === true;
  const isDraftingArgs = isRunning && !argsReady && result === undefined;
  const isExecutingTool = isRunning && argsReady && result === undefined;
  const badgeTone = compileFailed
    ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300'
    : compileSucceeded
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      : isExecutingTool
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  const badgeLabel = compileFailed
    ? '编译失败'
    : compileSucceeded
      ? '编译通过'
      : isExecutingTool
        ? '编译补丁中'
        : isDraftingArgs
          ? '生成补丁中'
          : statusType === 'requires-action'
            ? '等待确认'
            : '待执行';
  const argsDetail = argsReady
    ? `${fileSummaryText}，${patchLength} 字符`
    : argsText
      ? `正在流式接收 patch，已接收 ${argsText.length} 字符`
      : '等待模型生成结构化 patch';
  const steps = result?.steps ?? [];

  return (
    <ToolExecutionCard
      title="应用结构化补丁"
      badgeLabel={badgeLabel}
      badgeTone={badgeTone}
      prepareStep={{
        label: '生成 patch',
        detail: argsDetail,
        state: argsReady ? 'done' : isDraftingArgs ? 'active' : 'pending',
      }}
      runningStep={isExecutingTool ? {
        label: '调用工具',
        detail: '正在应用 patch 并编译',
        state: 'active',
      } : undefined}
      steps={steps}
      errorText={errorText}
    />
  );
};

const ReadTemplateFileToolCard: ToolCallMessagePartComponent<Record<string, unknown>, ReadTemplateFileResult> = ({
  status,
  result,
  argsText,
}) => {
  const statusType = status?.type ?? 'complete';
  let shortArgs: { file?: string; startLine?: number; endLine?: number } | null = null;
  if (argsText) {
    try {
      shortArgs = JSON.parse(argsText) as { file?: string; startLine?: number; endLine?: number };
    } catch {
      shortArgs = null;
    }
  }
  const isRunning = statusType === 'running';
  const failed = statusType === 'incomplete' || result?.ok === false;
  const succeeded = result?.ok === true;
  const badgeTone = failed
    ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300'
    : succeeded
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      : isRunning
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  const badgeLabel = failed
    ? '读取失败'
    : succeeded
      ? '读取完成'
      : isRunning
        ? '读取中'
        : '待执行';
  const target = shortArgs?.file
    ? `${shortArgs.file}${shortArgs.startLine ? `:${shortArgs.startLine}-${shortArgs.endLine ?? shortArgs.startLine}` : ''}`
    : '等待模型选择文件';
  const errorText = result?.error
    ?? (status?.type === 'incomplete' && status.error !== undefined
      ? (typeof status.error === 'string' ? status.error : JSON.stringify(status.error))
      : null);

  return (
    <ToolExecutionCard
      title="读取模板文件"
      badgeLabel={badgeLabel}
      badgeTone={badgeTone}
      prepareStep={{
        label: '定位文件',
        detail: target,
        state: shortArgs?.file ? 'done' : isRunning ? 'active' : 'pending',
      }}
      steps={result?.ok ? [{
        label: '读取内容',
        detail: `${result.file} 共 ${result.totalLines} 行，返回 ${result.startLine}-${result.endLine} 行`,
        state: 'done' as const,
      }] : []}
      errorText={errorText}
    />
  );
};

const readBundleFileLines = (
  files: TemplateBundleFiles,
  file: string,
  startLine?: number,
  endLine?: number,
): ReadTemplateFileResult => {
  const content = files[file];
  if (typeof content !== 'string') {
    return { ok: false, error: `找不到文件 ${file}` };
  }
  const lines = content.split('\n');
  const totalLines = lines.length;
  const start = Math.max(1, Math.min(startLine ?? 1, totalLines));
  const end = Math.max(start, Math.min(endLine ?? Math.min(start + 119, totalLines), totalLines));
  const width = String(end).length;
  const numbered = lines
    .slice(start - 1, end)
    .map((line, index) => `${String(start + index).padStart(width, ' ')} | ${line}`)
    .join('\n');
  const plainContent = lines.slice(start - 1, end).join('\n');
  return {
    ok: true,
    file,
    totalLines,
    startLine: start,
    endLine: end,
    content: numbered,
    plainContent,
  };
};

export default function ChatPanel({
  activeTemplateId,
  currentBundleFiles,
  currentCode,
  currentData,
  initialMessages,
  localAiConfig,
  onPersistMessages,
  onApplyAndValidate,
  onClose,
  onOpenSettings,
}: ChatPanelProps) {
  const [agentStatus, setAgentStatus] = useState<'idle' | 'compiling' | 'repairing' | 'success' | 'error'>('idle');
  const [hasFailedOnce, setHasFailedOnce] = useState(false);
  const autoToolLoopCountRef = useRef(0);
  const hasLocalAiConfig = isLocalAIConfigReady(localAiConfig);
  const requestScopedAiConfig = hasLocalAiConfig ? toRequestScopedAIConfig(localAiConfig) : undefined;
  const providerLabel = hasLocalAiConfig
    ? `${getLocalAIProviderLabel(localAiConfig.providerType)} · 本地用户 Key`
    : '未配置本地 AI';
  const workspaceSnapshotRef = useRef<TemplateBundleFiles>(mergeTemplateBundleState(currentBundleFiles, currentCode, currentData));
  const isApplyingToolRef = useRef(false);

  useEffect(() => {
    if (isApplyingToolRef.current) {
      return;
    }
    workspaceSnapshotRef.current = mergeTemplateBundleState(currentBundleFiles, currentCode, currentData);
  }, [currentBundleFiles, currentCode, currentData]);

  const applyEditAndCompile = useCallback(async (
    editResult: TemplateBundleEditResult,
    failureDetail: string,
  ): Promise<CompileFeedback> => {
    if (!editResult.ok) {
      setAgentStatus('error');
      setHasFailedOnce(true);
      return {
        ok: false,
        error: editResult.error,
        steps: [{ label: '应用编辑', detail: failureDetail, state: 'error' as const, error: editResult.error }],
      };
    }

    setAgentStatus(hasFailedOnce ? 'repairing' : 'compiling');
    isApplyingToolRef.current = true;
    workspaceSnapshotRef.current = editResult.files;
    let compileResult: CompileFeedback;
    try {
      compileResult = await onApplyAndValidate(editResult.files);
    } finally {
      isApplyingToolRef.current = false;
    }
    workspaceSnapshotRef.current = compileResult.files ?? editResult.files;
    const mergedResult = {
      ...compileResult,
      steps: [{
        label: '应用编辑',
        detail: `已修改 ${editResult.changedFiles.join(', ')}`,
        state: 'done' as const,
      }, ...(compileResult.steps ?? [])],
    };
    if (compileResult.ok) {
      setAgentStatus('success');
      setHasFailedOnce(false);
      autoToolLoopCountRef.current = 0;
      return stripFilesFromCompileFeedback(mergedResult);
    }

    setAgentStatus('error');
    setHasFailedOnce(true);
    return stripFilesFromCompileFeedback(mergedResult);
  }, [hasFailedOnce, onApplyAndValidate]);

  // Single source of truth for the client-side tool: AssistantChatTransport
  // forwards this schema to /api/generate, then the browser executes it here.
  const toolkit = useMemo(() => defineToolkit({
    update_template_bundle: {
      type: 'frontend',
      description: '应用并编译完整 TemplateBundle files map。仅用于首次生成、切换模板类型、或大范围重构；修复编译错误和小范围修改必须优先用 read_template_bundle_file + apply_template_bundle_patch。',
      parameters: {
        type: 'object',
        properties: {
          files: {
            type: 'object',
            description: '完整 TemplateBundle 文件映射，必须包含 manifest.json、template.typ、data.json、data.schema.json。template.typ 必须是原始 Typst 源码，不要包 Markdown 代码围栏。已有模板只需要局部修复时不要整份重写，必须改用 read_template_bundle_file + apply_template_bundle_patch。Typst 内容块 [...] 里函数/变量要写 #text/#str/#data；函数参数/code mode 里不要写 #align/#text；不要把 none 传给 text(fill)；窄小票金额/键值 grid 右列用固定宽度，不要用 auto。',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['files'],
        additionalProperties: false,
      },
      render: UpdateTypstToolCard,
      execute: async (args: Record<string, unknown>) => {
        if (!activeTemplateId) {
          setAgentStatus('error');
          return { ok: false, error: '请先在左侧选择一个模版' };
        }

        const baseFiles = workspaceSnapshotRef.current;
        const files = toTemplateBundleFiles(
          args.files,
          getBundleTemplate(baseFiles),
          getBundleData(baseFiles),
        );
        const nextCode = getBundleTemplate(files).trim();
        const nextData = getBundleData(files);

        if (!nextCode.trim()) {
          setAgentStatus('error');
          return { ok: false, error: 'template.typ 不能为空' };
        }
        if (!nextData || Object.keys(nextData).length === 0) {
          setAgentStatus('error');
          return { ok: false, error: 'data.json 不能为空，请同时返回与模板匹配的模拟数据' };
        }

        setAgentStatus(hasFailedOnce ? 'repairing' : 'compiling');
        isApplyingToolRef.current = true;
        let compileResult: CompileFeedback;
        try {
          compileResult = await onApplyAndValidate(files);
        } finally {
          isApplyingToolRef.current = false;
        }
        workspaceSnapshotRef.current = compileResult.files ?? files;
        isApplyingToolRef.current = false;
        if (compileResult.ok) {
          setAgentStatus('success');
          setHasFailedOnce(false);
          autoToolLoopCountRef.current = 0;
          return stripFilesFromCompileFeedback(compileResult);
        }

        setAgentStatus('error');
        setHasFailedOnce(true);
        return stripFilesFromCompileFeedback(compileResult);
      },
    },
    apply_template_bundle_patch: {
      type: 'frontend',
      description: 'Codex-like 结构化 patch 工具，适合一次修改同一文件或多个文件中的若干小块。patch 始终应用到当前 TemplateBundle，通过上下文匹配定位。格式：*** Begin Patch / *** Update File: path / @@ optional anchor / 空格上下文行 / - 删除行 / + 新增行 / *** End Patch。不要包 Markdown 代码围栏。',
      parameters: {
        type: 'object',
        properties: {
          patch: {
            type: 'string',
            description: '原始结构化 patch 文本，不要包含 Markdown 代码围栏。只支持 *** Update File，不支持新增/删除/移动文件。',
          },
        },
        required: ['patch'],
        additionalProperties: false,
      },
      render: PatchTemplateBundleToolCard,
      execute: async (args: Record<string, unknown>) => {
        if (!activeTemplateId) {
          setAgentStatus('error');
          return { ok: false, error: '请先在左侧选择一个模版' };
        }
        const patch = typeof args.patch === 'string' ? args.patch : '';
        const parsedFiles = listTemplateBundlePatchFiles(patch);
        if (!parsedFiles.ok) {
          setAgentStatus('error');
          return {
            ok: false,
            error: parsedFiles.error,
            steps: [{ label: '应用编辑', detail: 'patch 解析失败', state: 'error' as const, error: parsedFiles.error }],
          };
        }

        const editResult = applyTemplateBundlePatch(workspaceSnapshotRef.current, patch);
        return applyEditAndCompile(editResult, 'patch 应用失败');
      },
    },
    read_template_bundle_file: {
      type: 'frontend',
      description: '读取当前 TemplateBundle 的文件内容，返回带行号文本 content 和不带行号的 plainContent。局部编辑前用它确认当前内容和上下文。可读取 template.typ、data.json、data.schema.json、manifest.json。',
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: '要读取的文件路径，例如 template.typ、data.json、data.schema.json、manifest.json',
          },
          startLine: {
            type: 'number',
            description: '可选：从第几行开始，1-based',
          },
          endLine: {
            type: 'number',
            description: '可选：读到第几行，1-based；不传默认最多返回 120 行',
          },
        },
        required: ['file'],
        additionalProperties: false,
      },
      render: ReadTemplateFileToolCard,
      execute: async (args: Record<string, unknown>) => {
        const file = typeof args.file === 'string' ? args.file : '';
        const startLine = Number.isInteger(args.startLine) ? args.startLine as number : undefined;
        const endLine = Number.isInteger(args.endLine) ? args.endLine as number : undefined;
        return readBundleFileLines(workspaceSnapshotRef.current, file, startLine, endLine);
      },
    },
  }), [activeTemplateId, applyEditAndCompile, hasFailedOnce, onApplyAndValidate]);

  const runtime = useChatRuntime({
    messages: initialMessages as any,
    transport: new AssistantChatTransport({
      api: '/api/generate',
      prepareSendMessagesRequest: async (options) => {
        if (options.trigger === 'submit-message' && options.messages.at(-1)?.role === 'user') {
          autoToolLoopCountRef.current = 0;
        }
        const currentFiles = workspaceSnapshotRef.current;
        return {
          body: {
            ...(options.body || {}),
            id: options.id,
            messages: compactMessagesForHistory(options.messages as any[], true),
            trigger: options.trigger,
            messageId: options.messageId,
            metadata: options.requestMetadata,
            ai_config: requestScopedAiConfig,
            context: {
              template_id: activeTemplateId,
              base_typst: getBundleTemplate(currentFiles),
              base_data: getBundleData(currentFiles),
              bundle_files: currentFiles,
            },
          },
        };
      },
    }),
    sendAutomaticallyWhen: ({ messages }) => {
      const shouldContinue = lastAssistantMessageIsCompleteWithToolCalls({ messages: messages as any });
      if (!shouldContinue) return false;
      autoToolLoopCountRef.current += 1;
      return autoToolLoopCountRef.current <= 8;
    },
    onFinish: async ({ messages }) => {
      if (hasFailedToolResult(messages as any[])) {
        setAgentStatus('error');
        setHasFailedOnce(true);
      }
      if (activeTemplateId) {
        const plainMessages = compactMessagesForPersistence(messages || []).map((chatMessage: any) => ({
          role: String(chatMessage?.role || 'assistant'),
          parts: Array.isArray(chatMessage?.parts) ? chatMessage.parts : [],
        }));
        await onPersistMessages(activeTemplateId, plainMessages);
      }
    },
  });

  return (
    <div className="w-[460px] h-full flex flex-col bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700/60 flex-shrink-0">
      <div className="h-14 flex-shrink-0 border-b border-slate-200/70 dark:border-slate-700/60 flex items-center px-4 gap-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
        <div className="w-9 h-9 bg-slate-900 dark:bg-white rounded-xl flex items-center justify-center text-white dark:text-slate-900 shadow-sm">
          <Sparkles size={18} />
        </div>
        <div>
          <h1 className="font-bold text-sm text-slate-900 dark:text-white">DeepPrint AI</h1>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{providerLabel}</p>
        </div>
        <span className={`ml-auto mr-2 px-2 py-0.5 rounded-full text-[10px] font-medium ${agentStatus === 'compiling'
          ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          : agentStatus === 'repairing'
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
            : agentStatus === 'success'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
              : agentStatus === 'error'
                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
          }`}>
          {agentStatus === 'compiling' && '编译中'}
          {agentStatus === 'repairing' && '修复中'}
          {agentStatus === 'success' && '已完成'}
          {agentStatus === 'error' && '编译失败'}
          {agentStatus === 'idle' && '待命'}
        </span>
        <button
          onClick={onOpenSettings}
          className={`p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 ${hasLocalAiConfig
            ? 'text-emerald-500 dark:text-emerald-400'
            : 'text-slate-400 dark:text-slate-500'
            }`}
          title={hasLocalAiConfig ? '本地 AI 已配置' : '配置本地 AI'}
        >
          <Settings2 size={18} />
        </button>
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500"
        >
          <PanelRightClose size={18} />
        </button>
      </div>

      {!hasLocalAiConfig && (
        <div className="border-b border-amber-100 bg-amber-50/80 px-4 py-3 text-[12px] text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-100">
          <p className="font-medium">还没配置本地 AI Key</p>
          <p className="mt-1 text-[11px] opacity-90">
            当前仅支持 Gemini 和 OpenAI-compatible。配置会保存在当前浏览器，真正请求时再临时发送给服务器代理使用。
          </p>
          <button
            onClick={onOpenSettings}
            className="mt-2 rounded-lg bg-amber-900 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-amber-800 dark:bg-amber-200 dark:text-amber-950 dark:hover:bg-amber-100"
          >
            配置本地 AI
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <TooltipProvider>
          <AssistantRuntimeProvider runtime={runtime}>
            <ToolkitProvider toolkit={toolkit}>
              <Thread
                inputDisabled={!activeTemplateId || !hasLocalAiConfig}
                inputDisabledReason={!activeTemplateId
                  ? '请先在左侧选择一个模版，再和 AI 讨论或修改'
                  : '请先配置本地 AI Key，再和 AI 讨论或修改'}
              />
            </ToolkitProvider>
          </AssistantRuntimeProvider>
        </TooltipProvider>
      </div>
    </div>
  );
}
