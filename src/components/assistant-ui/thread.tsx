import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/assistant-ui/attachment";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import {
  AuiIf,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  SuggestionPrimitive,
  ThreadPrimitive,
  groupPartByType,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  AlertCircleIcon,
  ChevronDownIcon,
  CheckCircle2Icon,
  LoaderIcon,
  SquareIcon,
} from "lucide-react";
import type { FC } from "react";

export const Thread: FC<{ inputDisabled?: boolean; inputDisabledReason?: string }> = ({
  inputDisabled = false,
  inputDisabledReason = "请先选择一个模版后再开始对话",
}) => {
  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container flex h-full flex-col bg-transparent text-sm text-slate-900 dark:text-slate-100"
      style={{
        ["--thread-max-width" as string]: "44rem",
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        className="aui-thread-viewport relative flex flex-1 flex-col overflow-x-hidden overflow-y-scroll scroll-smooth px-4 pt-4"
      >
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <ThreadWelcome />
        </AuiIf>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            EditComposer,
            AssistantMessage,
          }}
        />

        <ThreadPrimitive.ViewportFooter className="aui-thread-viewport-footer sticky bottom-0 mx-auto mt-auto flex w-full max-w-(--thread-max-width) flex-col gap-3 overflow-visible px-2 pb-4 md:pb-6">
          <ThreadScrollToBottom />
          {inputDisabled ? <DisabledComposer reason={inputDisabledReason} /> : <Composer />}
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="滚动到底部"
        variant="outline"
        className="aui-thread-scroll-to-bottom absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible bg-white/90 dark:bg-slate-900/90 border border-slate-200/70 dark:border-slate-700/60 shadow-sm hover:bg-white"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <div className="aui-thread-welcome-root mx-auto my-auto flex w-full max-w-(--thread-max-width) grow flex-col">
      <div className="aui-thread-welcome-center flex w-full grow flex-col items-center justify-center">
        <div className="aui-thread-welcome-message flex size-full flex-col justify-center px-4">
          <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in font-semibold text-lg duration-200">
            你好，我是 DeepPrint AI
          </h1>
          <p className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in text-slate-500 dark:text-slate-400 text-sm delay-75 duration-200">
            告诉我你要做的模板类型、尺寸和内容
          </p>
        </div>
      </div>
      <ThreadSuggestions />
    </div>
  );
};

const ThreadSuggestions: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestions grid w-full @md:grid-cols-2 gap-2 pb-4">
      <ThreadPrimitive.Suggestions
        components={{
          Suggestion: ThreadSuggestionItem,
        }}
      />
    </div>
  );
};

const ThreadSuggestionItem: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestion-display fade-in slide-in-from-bottom-2 @md:nth-[n+3]:block nth-[n+3]:hidden animate-in fill-mode-both duration-200">
      <SuggestionPrimitive.Trigger send asChild>
        <Button
          variant="ghost"
          className="aui-thread-welcome-suggestion h-auto w-full @md:flex-col flex-wrap items-start justify-start gap-1 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/50 px-4 py-3 text-left text-sm transition-colors hover:bg-white dark:hover:bg-slate-900"
        >
          <span className="aui-thread-welcome-suggestion-text-1 font-medium">
            <SuggestionPrimitive.Title />
          </span>
          <span className="aui-thread-welcome-suggestion-text-2 text-muted-foreground">
            <SuggestionPrimitive.Description />
          </span>
        </Button>
      </SuggestionPrimitive.Trigger>
    </div>
  );
};

const Composer: FC = () => {
  return (
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      <ComposerPrimitive.AttachmentDropzone className="aui-composer-attachment-dropzone flex w-full flex-col rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 px-1 pt-2 outline-none transition-shadow has-[textarea:focus-visible]:border-blue-500/60 has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-blue-500/20 data-[dragging=true]:border-blue-500/60 data-[dragging=true]:border-dashed data-[dragging=true]:bg-blue-50/60 dark:data-[dragging=true]:bg-slate-800/60">
        <ComposerAttachments />
        <ComposerPrimitive.Input
          placeholder="描述你要做的模板（用途、尺寸、字段）"
          className="aui-composer-input mb-1 max-h-32 min-h-14 w-full resize-none bg-transparent px-4 pt-2 pb-3 text-[13px] outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:ring-0"
          rows={1}
          autoFocus
          aria-label="Message input"
        />
        <ComposerAction />
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

const DisabledComposer: FC<{ reason: string }> = ({ reason }) => {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 px-4 py-3">
      <p className="text-[12px] text-slate-500 dark:text-slate-400">{reason}</p>
      <div className="mt-2 h-9 w-full rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/40 px-3 flex items-center text-[12px] text-slate-400 dark:text-slate-500">
        对话输入已禁用
      </div>
    </div>
  );
};

const ComposerAction: FC = () => {
  return (
    <div className="aui-composer-action-wrapper relative mx-2 mb-2 flex items-center justify-between">
      <ComposerAddAttachment />
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="发送"
            side="bottom"
            type="submit"
            variant="default"
            size="icon"
            className="aui-composer-send size-8 rounded-full bg-slate-900 text-white hover:bg-slate-800"
            aria-label="Send message"
          >
            <ArrowUpIcon className="aui-composer-send-icon size-4" />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <Button
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-cancel size-8 rounded-full bg-slate-900 text-white hover:bg-slate-800"
            aria-label="Stop generating"
          >
            <SquareIcon className="aui-composer-cancel-icon size-3 fill-current" />
          </Button>
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantMessageParts: FC = () => {
  return (
    <MessagePrimitive.GroupedParts
      groupBy={groupPartByType({
        reasoning: ["group-process", "group-reasoning"],
        "tool-call": ["group-process", "group-tool"],
        "standalone-tool-call": [],
      })}
      indicator="no-text"
    >
      {({ part, children }) => {
        switch (part.type) {
          case "text":
            return <MarkdownText />;
          case "group-process":
            return <AgentProcess status={part.status.type}>{children}</AgentProcess>;
          case "group-reasoning":
          case "group-tool":
            return <div className="space-y-2">{children}</div>;
          case "tool-call":
            return part.toolUI ?? <ToolFallback {...part} />;
          case "indicator":
            return <AgentIndicator />;
          default:
            return null;
        }
      }}
    </MessagePrimitive.GroupedParts>
  );
};

const AgentProcess: FC<{ children: React.ReactNode; status: string }> = ({ children, status }) => {
  const Icon = status === "running"
    ? LoaderIcon
    : status === "incomplete"
      ? AlertCircleIcon
      : CheckCircle2Icon;

  return (
    <div className="my-2 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-950/30">
      <div className="flex items-center gap-2 border-b border-slate-200/70 dark:border-slate-700/60 px-3 py-2 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
        <Icon className={`size-3.5 ${status === "running" ? "animate-spin text-slate-400" : "text-slate-500 dark:text-slate-300"}`} />
        <span>执行过程</span>
        <ChevronDownIcon className="ml-auto size-3.5 text-slate-400" />
      </div>
      <div className="px-1 py-1">{children}</div>
    </div>
  );
};

const AgentIndicator: FC = () => {
  return (
    <div className="mt-2 flex items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400">
      <LoaderIcon className="size-3.5 animate-spin" />
      <span>AI 正在继续处理...</span>
    </div>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="aui-assistant-message-root fade-in slide-in-from-bottom-1 relative mx-auto w-full max-w-(--thread-max-width) animate-in py-3 duration-150"
      data-role="assistant"
    >
      <div className="aui-assistant-message-content wrap-break-word rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/60 px-4 py-3 text-[13px] text-foreground leading-6 shadow-sm">
        <AssistantMessageParts />
        <MessageError />
      </div>

      <div className="aui-assistant-message-footer mt-1 ml-2 flex" />
    </MessagePrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="aui-user-message-root fade-in slide-in-from-bottom-1 mx-auto grid w-full max-w-(--thread-max-width) animate-in auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 py-3 duration-150 [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <UserMessageAttachments />

      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content wrap-break-word rounded-2xl bg-slate-900 text-[13px] text-white dark:bg-slate-100 dark:text-slate-900 px-4 py-2.5 shadow-sm">
          <MessagePrimitive.Parts />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root className="aui-edit-composer-wrapper mx-auto flex w-full max-w-(--thread-max-width) flex-col px-2 py-3">
      <ComposerPrimitive.Root className="aui-edit-composer-root ml-auto flex w-full max-w-[85%] flex-col rounded-2xl bg-slate-100 dark:bg-slate-800">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input min-h-14 w-full resize-none bg-transparent p-4 text-foreground text-sm outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-3 mb-3 flex items-center gap-2 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm">
              取消
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm">更新</Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};
