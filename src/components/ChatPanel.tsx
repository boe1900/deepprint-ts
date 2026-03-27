import { useCallback, useMemo, useRef, useState } from 'react';
import { PanelRightClose, Sparkles } from 'lucide-react';
import { AssistantChatTransport, useChatRuntime } from '@assistant-ui/react-ai-sdk';
import {
  AssistantRuntimeProvider,
  makeAssistantTool,
  type ToolCallMessagePartComponent,
} from '@assistant-ui/react';
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import typstPackages from '../../typst-packages.json';
import { Thread } from '@/components/assistant-ui/thread';
import { TooltipProvider } from '@/components/ui/tooltip';
import { briefErrorText } from '@/lib/brief-error-text';
import type { CompileFeedback } from '@/components/TypstPreview';

const AVAILABLE_FONT_FAMILIES = [
  'Noto Sans SC',
  'Noto Serif SC',
  'Libertinus Sans',
  'Libertinus Serif',
  'DejaVu Sans Mono',
  'New Computer Modern Math',
  'Noto Emoji',
];

const AVAILABLE_PLUGIN_SPECS = (typstPackages as Array<{ name: string; version: string; description?: string }>)
  .map((pkg) => ({
    spec: `@preview/${pkg.name}:${pkg.version}`,
    description: pkg.description || '',
  }));

export interface ChatPanelProps {
  activeTemplateId: string;
  currentCode: string;
  currentData: Record<string, unknown>;
  initialMessages: Array<{ id?: string; role: string; parts: unknown[] }>;
  onPersistMessages: (templateId: string, messages: Array<{ role: string; parts: unknown[] }>) => Promise<void>;
  onApplyAndValidate: (nextCode: string, nextData?: Record<string, unknown>) => Promise<CompileFeedback>;
  onClose: () => void;
}

type UpdateTypstResult = CompileFeedback;

const UpdateTypstToolCard: ToolCallMessagePartComponent<Record<string, unknown>, UpdateTypstResult> = ({
  status,
  result,
  argsText,
}) => {
  const isRunning = status?.type === 'running';
  const isComplete = status?.type === 'complete';
  const isError = status?.type === 'incomplete' || result?.ok === false;
  let shortArgs: { typst_code?: string } | null = null;
  if (argsText) {
    try {
      shortArgs = JSON.parse(argsText) as { typst_code?: string };
    } catch {
      shortArgs = null;
    }
  }
  const codeLen = shortArgs?.typst_code?.length ?? 0;

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
          代码长度 {codeLen} 字符
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
  onPersistMessages,
  onApplyAndValidate,
  onClose,
}: ChatPanelProps) {
  const [agentStatus, setAgentStatus] = useState<'idle' | 'compiling' | 'repairing' | 'success' | 'error'>('idle');
  const [hasFailedOnce, setHasFailedOnce] = useState(false);
  const [lastCompileDiagnostics, setLastCompileDiagnostics] = useState<CompileFeedback['diagnostics'] | null>(null);
  const appliedByToolInTurnRef = useRef(false);
  const latestIntentRef = useRef<'chat' | 'edit'>('chat');
  const autoToolLoopCountRef = useRef(0);

  const inferIntentFromText = useCallback((text: string): 'chat' | 'edit' => {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return 'chat';
    const editKeywords = [
      '修改', '改成', '改下', '更新', '应用', '生成', '创建', '新建', '重写', '调整模板',
      'change', 'update', 'apply', 'generate', 'create', 'rewrite', 'refactor',
    ];
    return editKeywords.some((keyword) => normalized.includes(keyword)) ? 'edit' : 'chat';
  }, []);

  const extractLastUserText = useCallback((messages: any[] | undefined): string => {
    if (!Array.isArray(messages)) return '';
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message?.role !== 'user') continue;
      if (typeof message.content === 'string') return message.content;
      if (Array.isArray(message.parts)) {
        return message.parts
          .filter((part: any) => part?.type === 'text' && typeof part?.text === 'string')
          .map((part: any) => part.text)
          .join('\n');
      }
    }
    return '';
  }, []);

  const UpdateTypstTool = useMemo(() => makeAssistantTool({
    toolName: 'update_typst',
    description: '应用并编译 Typst 模版代码。每次修改都要调用该工具。',
    parameters: {
      type: 'object',
      properties: {
        typst_code: { type: 'string', description: '完整的 Typst 代码' },
        mock_data: {
          type: 'object',
          description: '与模板匹配的完整 mock 数据对象（必填）',
          additionalProperties: true,
        },
      },
      required: ['typst_code', 'mock_data'],
      additionalProperties: false,
    },
    disabled: !activeTemplateId,
    render: UpdateTypstToolCard,
    execute: async (args: Record<string, unknown>) => {
      if (latestIntentRef.current !== 'edit') {
        setAgentStatus('idle');
        return { ok: false, error: '当前是咨询对话，未执行模板修改。若要改模板，请明确说“请修改/生成模板”。' };
      }
      if (!activeTemplateId) {
        setAgentStatus('error');
        return { ok: false, error: '请先在左侧选择一个模版' };
      }

      const rawCode = typeof args.typst_code === 'string' ? args.typst_code : '';
      const fenced = rawCode.match(/```typst\s*([\s\S]*?)```/i) || rawCode.match(/```[a-zA-Z0-9_-]*\s*([\s\S]*?)```/i);
      const nextCode = (fenced?.[1] || rawCode).trim();
      const nextData = args.mock_data && typeof args.mock_data === 'object'
        ? (args.mock_data as Record<string, unknown>)
        : undefined;

      if (!nextCode.trim()) {
        setAgentStatus('error');
        return { ok: false, error: 'typst_code 不能为空' };
      }
      if (!nextData || Object.keys(nextData).length === 0) {
        setAgentStatus('error');
        return { ok: false, error: 'mock_data 不能为空，请同时返回与模板匹配的模拟数据' };
      }

      appliedByToolInTurnRef.current = true;
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
  }), [activeTemplateId, hasFailedOnce, onApplyAndValidate]);

  const runtime = useChatRuntime({
    messages: initialMessages as any,
    transport: new AssistantChatTransport({
      api: '/api/generate',
      prepareSendMessagesRequest: async (options) => {
        appliedByToolInTurnRef.current = false;
        if (String(options.trigger || '').includes('submit')) {
          autoToolLoopCountRef.current = 0;
        }
        const lastUserText = extractLastUserText(options.messages as any[]);
        latestIntentRef.current = inferIntentFromText(lastUserText);
        return {
          body: {
            ...(options.body || {}),
            id: options.id,
            messages: options.messages,
            trigger: options.trigger,
            messageId: options.messageId,
            metadata: options.requestMetadata,
            context: {
              template_id: activeTemplateId,
              base_typst: currentCode,
              base_data: currentData,
              intent: latestIntentRef.current,
              available_fonts: AVAILABLE_FONT_FAMILIES,
              available_plugins: AVAILABLE_PLUGIN_SPECS,
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
    onFinish: async ({ message, messages }) => {
      if (activeTemplateId) {
        const plainMessages = (messages || []).map((chatMessage: any) => ({
          role: String(chatMessage?.role || 'assistant'),
          parts: Array.isArray(chatMessage?.parts) ? chatMessage.parts : [],
        }));
        await onPersistMessages(activeTemplateId, plainMessages);
      }

      if (appliedByToolInTurnRef.current || !activeTemplateId) return;
      if (latestIntentRef.current !== 'edit') return;

      const textContent = (message.parts || [])
        .filter((part: any) => part?.type === 'text' && typeof part?.text === 'string')
        .map((part: any) => part.text)
        .join('\n');
      if (!textContent) return;

      const typstMatch = textContent.match(/```typst\s*([\s\S]*?)```/i);
      const nextCode = (typstMatch?.[1] || '').trim();
      if (!nextCode) return;

      const isLikelyTypst =
        nextCode.includes('#set ') ||
        nextCode.includes('#let ') ||
        nextCode.includes('#import ') ||
        nextCode.includes('sys.inputs') ||
        nextCode.includes('@preview/');
      if (!isLikelyTypst) return;

      setAgentStatus('compiling');
      const compileResult = await onApplyAndValidate(nextCode);
      if (compileResult.ok) {
        setAgentStatus('success');
        setLastCompileDiagnostics(null);
      } else {
        setAgentStatus('error');
        setLastCompileDiagnostics(compileResult.diagnostics || {
          message: compileResult.error || '编译失败',
        });
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
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">设计助手在线</p>
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
          onClick={onClose}
          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500"
        >
          <PanelRightClose size={18} />
        </button>
      </div>

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
            <UpdateTypstTool />
            <Thread
              inputDisabled={!activeTemplateId}
              inputDisabledReason="请先在左侧选择一个模版，再和 AI 讨论或修改"
            />
          </AssistantRuntimeProvider>
        </TooltipProvider>
      </div>
    </div>
  );
}
