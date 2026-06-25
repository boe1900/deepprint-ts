import { useMemo, useRef, useState } from 'react';
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
import type { CompileFeedback } from '@/components/TypstPreview';
import { DEFAULT_TEMPLATE_BUNDLE_FILES, getBundleData, getBundleTemplate, toTemplateBundleFiles, type TemplateBundleFiles } from '@/lib/template-bundle';
import {
  getLocalAIProviderLabel,
  isLocalAIConfigReady,
  toRequestScopedAIConfig,
  type LocalAIConfig,
} from '@/lib/local-ai-config';

export interface ChatPanelProps {
  activeTemplateId: string;
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

export default function ChatPanel({
  activeTemplateId,
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

  // Single source of truth for the client-side tool: AssistantChatTransport
  // forwards this schema to /api/generate, then the browser executes it here.
  const toolkit = useMemo(() => defineToolkit({
    update_template_bundle: {
      type: 'frontend',
      description: '应用并编译完整 TemplateBundle files map。每次模板修改都要调用该工具。',
      parameters: {
        type: 'object',
        properties: {
          files: {
            type: 'object',
            description: '完整 TemplateBundle 文件映射，必须包含 manifest.json、template.typ、data.json、data.schema.json',
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

        const files = toTemplateBundleFiles(
          args.files,
          currentCode,
          currentData,
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
        const compileResult = await onApplyAndValidate(files);
        if (compileResult.ok) {
          setAgentStatus('success');
          setHasFailedOnce(false);
          autoToolLoopCountRef.current = 0;
          return compileResult;
        }

        setAgentStatus('error');
        setHasFailedOnce(true);
        return compileResult;
      },
    },
  }), [activeTemplateId, currentCode, currentData, hasFailedOnce, onApplyAndValidate]);

  const runtime = useChatRuntime({
    messages: initialMessages as any,
    transport: new AssistantChatTransport({
      api: '/api/generate',
      prepareSendMessagesRequest: async (options) => {
        if (options.trigger === 'submit-message' && options.messages.at(-1)?.role === 'user') {
          autoToolLoopCountRef.current = 0;
        }
        return {
          body: {
            ...(options.body || {}),
            id: options.id,
            messages: options.messages,
            trigger: options.trigger,
            messageId: options.messageId,
            metadata: options.requestMetadata,
            ai_config: requestScopedAiConfig,
            context: {
              template_id: activeTemplateId,
              base_typst: getBundleTemplate(toTemplateBundleFiles(undefined, currentCode, currentData)),
              base_data: getBundleData({
                ...DEFAULT_TEMPLATE_BUNDLE_FILES,
                'template.typ': currentCode,
                'data.json': JSON.stringify(currentData, null, 2),
              }),
            },
          },
        };
      },
    }),
    sendAutomaticallyWhen: ({ messages }) => {
      const shouldContinue = lastAssistantMessageIsCompleteWithToolCalls({ messages: messages as any });
      if (!shouldContinue) return false;
      autoToolLoopCountRef.current += 1;
      return autoToolLoopCountRef.current <= 4;
    },
    onFinish: async ({ messages }) => {
      if (activeTemplateId) {
        const plainMessages = (messages || []).map((chatMessage: any) => ({
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
