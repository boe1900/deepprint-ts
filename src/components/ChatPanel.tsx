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
import { TooltipProvider } from '@/components/ui/tooltip';
import { briefErrorText } from '@/lib/brief-error-text';
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
  onApplyAndValidate: (nextCode: string, nextData?: Record<string, unknown>) => Promise<CompileFeedback>;
  onClose: () => void;
  onOpenSettings: () => void;
}

type UpdateTypstResult = CompileFeedback;

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
  const isRunning = status?.type === 'running';
  const isComplete = status?.type === 'complete';
  const isError = status?.type === 'incomplete' || result?.ok === false;
  let shortArgs: { files?: TemplateBundleFiles } | null = null;
  if (argsText) {
    try {
      shortArgs = JSON.parse(argsText) as { files?: TemplateBundleFiles };
    } catch {
      shortArgs = null;
    }
  }
  const codeLen = shortArgs?.files?.['template.typ']?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-(--thread-max-width) px-2 py-2">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 px-3 py-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-700 dark:text-slate-200">应用模板修改</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] ${isRunning
            ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            : isError
              ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300'
              : isComplete
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}>
            {isRunning ? '执行中' : isError ? '失败' : isComplete ? '完成' : '待执行'}
          </span>
        </div>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          template.typ 长度 {codeLen} 字符
        </p>
        {result?.error && (
          <p className="mt-1 text-red-600 dark:text-red-400" title={result.error}>
            {briefErrorText(result.error)}
          </p>
        )}
        {result?.diagnostics?.line && (
          <p className="mt-1 text-red-500 dark:text-red-400">
            行 {result.diagnostics.line}
            {result.diagnostics.column ? `, 列 ${result.diagnostics.column}` : ''}
            {result.diagnostics.snippet ? ` · ${result.diagnostics.snippet}` : ''}
          </p>
        )}
      </div>
    </div>
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
  const [lastCompileDiagnostics, setLastCompileDiagnostics] = useState<CompileFeedback['diagnostics'] | null>(null);
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
        const compileResult = await onApplyAndValidate(nextCode, nextData);
        if (compileResult.ok) {
          setAgentStatus('success');
          setHasFailedOnce(false);
          setLastCompileDiagnostics(null);
          autoToolLoopCountRef.current = 0;
          return compileResult;
        }

        setAgentStatus('error');
        setHasFailedOnce(true);
        setLastCompileDiagnostics(compileResult.diagnostics || {
          message: compileResult.error || '编译失败',
        });
        return { ok: false, error: compileResult.error || '编译失败' };
      },
    },
  }), [activeTemplateId, currentCode, currentData, hasFailedOnce, onApplyAndValidate]);

  const runtime = useChatRuntime({
    messages: initialMessages as any,
    transport: new AssistantChatTransport({
      api: '/api/generate',
      prepareSendMessagesRequest: async (options) => {
        if (String(options.trigger || '').includes('submit')) {
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
    <div className="w-[360px] h-full flex flex-col bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700/60 flex-shrink-0">
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

      {agentStatus === 'error' && lastCompileDiagnostics?.message && (
        <div
          className="px-4 py-2 text-[11px] text-red-600 dark:text-red-400 border-b border-red-100 dark:border-red-900/40 bg-red-50/70 dark:bg-red-950/20"
          title={lastCompileDiagnostics.message}
        >
          最近编译错误
          {lastCompileDiagnostics.line ? `（行 ${lastCompileDiagnostics.line}` : ''}
          {lastCompileDiagnostics.column ? `, 列 ${lastCompileDiagnostics.column}` : ''}
          {lastCompileDiagnostics.line ? '）' : ''}
          ：{lastCompileDiagnostics.message}
          {lastCompileDiagnostics.snippet ? ` · ${lastCompileDiagnostics.snippet}` : ''}
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
