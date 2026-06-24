import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  createDefaultLocalAIConfig,
  getLocalAIProviderLabel,
  isLocalAIConfigReady,
  normalizeLocalAIConfig,
  type LocalAIConfig,
  type LocalAIProviderType,
} from '@/lib/local-ai-config';

interface LocalAiSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: LocalAIConfig | null;
  onSave: (config: LocalAIConfig) => void;
  onClear: () => void;
}

const INPUT_CLASSNAME = 'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

export default function LocalAiSettingsDialog({
  open,
  onOpenChange,
  value,
  onSave,
  onClear,
}: LocalAiSettingsDialogProps) {
  const [draft, setDraft] = useState<LocalAIConfig>(createDefaultLocalAIConfig('google'));
  const [error, setError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(value ? normalizeLocalAIConfig(value) : createDefaultLocalAIConfig('google'));
    setError(null);
    setShowApiKey(false);
  }, [open, value]);

  const handleProviderChange = (providerType: LocalAIProviderType) => {
    setDraft((prev) => {
      if (prev.providerType === providerType) return prev;
      const nextDefaults = createDefaultLocalAIConfig(providerType);
      return {
        ...nextDefaults,
        apiKey: '',
      };
    });
    setError(null);
  };

  const handleSave = () => {
    const normalized = normalizeLocalAIConfig(draft);
    if (!normalized.apiKey) {
      setError('请填写 API Key');
      return;
    }
    if (!normalized.model) {
      setError('请填写模型名称');
      return;
    }
    if (normalized.providerType === 'openai') {
      if (!normalized.baseURL) {
        setError('OpenAI-compatible 需要填写 Base URL');
        return;
      }
      try {
        const parsed = new URL(normalized.baseURL);
        if (parsed.protocol !== 'https:') {
          setError('Base URL 必须使用 https');
          return;
        }
      } catch {
        setError('Base URL 格式不合法');
        return;
      }
    }

    onSave(normalized);
    onOpenChange(false);
  };

  const handleClear = () => {
    onClear();
    setDraft(createDefaultLocalAIConfig(draft.providerType));
    setError(null);
  };

  const isReady = isLocalAIConfigReady(draft as LocalAIConfig | null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            本地用户 Key 设置
          </DialogTitle>
          <DialogDescription>
            仅支持 Gemini 和 OpenAI-compatible。配置只保存在当前浏览器的 localStorage；
            真正发起 AI 请求时会临时随请求发送给服务器代理使用，不会写入数据库。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
            如果这是共享设备，建议使用专用 Key，并在使用结束后清除本地配置。
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Provider
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['google', 'openai'] as LocalAIProviderType[]).map((providerType) => {
                const active = draft.providerType === providerType;
                return (
                  <button
                    key={providerType}
                    type="button"
                    onClick={() => handleProviderChange(providerType)}
                    className={`rounded-xl border px-4 py-3 text-left transition-all ${active
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-500/70 dark:bg-blue-500/10 dark:text-blue-200'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                  >
                    <div className="font-semibold">
                      {getLocalAIProviderLabel(providerType)}
                    </div>
                    <p className="mt-1 text-xs opacity-80">
                      {providerType === 'google'
                        ? '适合 Gemini Key'
                        : '支持 OpenAI、DeepSeek、GLM、Ark 等兼容地址'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={draft.apiKey}
                  onChange={(event) => {
                    setDraft((prev) => ({ ...prev, apiKey: event.target.value }));
                    setError(null);
                  }}
                  placeholder={draft.providerType === 'google' ? 'AIza...' : 'sk-...'}
                  className={`${INPUT_CLASSNAME} pr-11`}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title={showApiKey ? '隐藏 Key' : '显示 Key'}
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Model
              </label>
              <input
                type="text"
                value={draft.model}
                onChange={(event) => {
                  setDraft((prev) => ({ ...prev, model: event.target.value }));
                  setError(null);
                }}
                placeholder={draft.providerType === 'google' ? 'gemini-flash-latest' : 'gpt-4o-mini'}
                className={INPUT_CLASSNAME}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {draft.providerType === 'openai' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  API 模式
                </label>
                <select
                  value={draft.apiMode}
                  onChange={(event) => {
                    setDraft((prev) => ({
                      ...prev,
                      apiMode: event.target.value === 'responses' ? 'responses' : 'chat',
                    }));
                    setError(null);
                  }}
                  className={INPUT_CLASSNAME}
                >
                  <option value="chat">chat</option>
                  <option value="responses">responses</option>
                </select>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                Gemini 走官方 SDK，不需要额外的 Base URL。
              </div>
            )}

            {draft.providerType === 'openai' && (
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Base URL
                </label>
                <input
                  type="url"
                  value={draft.baseURL}
                  onChange={(event) => {
                    setDraft((prev) => ({ ...prev, baseURL: event.target.value }));
                    setError(null);
                  }}
                  placeholder="https://api.openai.com/v1"
                  className={INPUT_CLASSNAME}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
            <div className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-100">
              <Sparkles size={16} />
              当前状态
            </div>
            <p className="mt-2">
              {isReady
                ? `${getLocalAIProviderLabel(draft.providerType)} 已准备就绪，AI 对话会优先使用这份本地配置。`
                : `${getLocalAIProviderLabel(draft.providerType)} 还未配置完成，填写 Key 后即可保存。`}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={handleClear}
            className="justify-center"
          >
            <Trash2 className="h-4 w-4" />
            清除本地配置
          </Button>

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleSave}
            >
              保存到当前浏览器
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
