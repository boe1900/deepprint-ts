import { type RefObject } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import {
  Bold,
  Code,
  Code2,
  Database,
  Download,
  Eye,
  Heading,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Lock,
  Maximize2,
  PanelRight,
  RotateCcw,
  Save,
  Sparkles,
  Underline,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import TypstPreview, { type TypstPreviewRef } from '@/components/TypstPreview';
import type { TemplateBundleFiles } from '@/lib/template-bundle';

export type WorkspaceTab = 'preview' | 'code';

interface WorkspacePaneProps {
  activeTab: WorkspaceTab;
  bundleFiles: TemplateBundleFiles;
  code: string;
  data: Record<string, unknown>;
  hasActiveTemplate: boolean;
  isAuthed: boolean;
  isExportingPdf: boolean;
  isSaving: boolean;
  previewRef: RefObject<TypstPreviewRef | null>;
  previewZoom: number;
  resolvedTheme: string;
  showChat: boolean;
  onChangeTab: (tab: WorkspaceTab) => void;
  onCodeChange: (value: string) => void;
  onEditorMount: OnMount;
  onExportBundle: () => void;
  onExportPdf: () => void | Promise<void>;
  onOpenBlankDialog: () => void;
  onOpenDataModal: () => void;
  onOpenLogin: () => void;
  onOpenVersions: () => void | Promise<void>;
  onPrefixLine: (prefix: string) => void;
  onPreviewZoomChange: (zoom: number) => void;
  onSave: () => void | Promise<void>;
  onShowChat: () => void;
  onWrapSelection: (prefix: string, suffix?: string) => void;
}

export default function WorkspacePane({
  activeTab,
  bundleFiles,
  code,
  data,
  hasActiveTemplate,
  isAuthed,
  isExportingPdf,
  isSaving,
  previewRef,
  previewZoom,
  resolvedTheme,
  showChat,
  onChangeTab,
  onCodeChange,
  onEditorMount,
  onExportBundle,
  onExportPdf,
  onOpenBlankDialog,
  onOpenDataModal,
  onOpenLogin,
  onOpenVersions,
  onPrefixLine,
  onPreviewZoomChange,
  onSave,
  onShowChat,
  onWrapSelection,
}: WorkspacePaneProps) {
  return (
    <main className="flex-1 flex flex-col min-w-0 bg-slate-100 dark:bg-slate-800/30 relative overflow-hidden">
      <div className="h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between px-5 z-10 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => isAuthed && onChangeTab('preview')}
              disabled={!isAuthed}
              title={!isAuthed ? '登录后可使用' : undefined}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${activeTab === 'preview'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                } ${!isAuthed ? 'opacity-50 cursor-not-allowed hover:text-slate-500 dark:hover:text-slate-400' : ''}`}
            >
              <Eye size={14} /> 预览
            </button>
            <button
              onClick={() => isAuthed && onChangeTab('code')}
              disabled={!isAuthed}
              title={!isAuthed ? '登录后可使用' : undefined}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${activeTab === 'code'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                } ${!isAuthed ? 'opacity-50 cursor-not-allowed hover:text-slate-500 dark:hover:text-slate-400' : ''}`}
            >
              <Code2 size={14} /> 代码
            </button>
          </div>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

          {activeTab === 'preview' && hasActiveTemplate && (
            <div className="flex items-center gap-1">
              <button onClick={() => previewRef.current?.zoomOut()} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="缩小">
                <ZoomOut size={15} />
              </button>
              <div className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[11px] text-slate-500 dark:text-slate-400 min-w-[48px] text-center font-mono tabular-nums">
                {Math.round(previewZoom * 100)}%
              </div>
              <button onClick={() => previewRef.current?.zoomIn()} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="放大">
                <ZoomIn size={15} />
              </button>
              <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-0.5" />
              <button onClick={() => previewRef.current?.resetZoom()} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="重置 100%">
                <RotateCcw size={14} />
              </button>
              <button onClick={() => previewRef.current?.fitToWidth()} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="适应宽度">
                <Maximize2 size={14} />
              </button>
            </div>
          )}

          {activeTab === 'code' && (
            <div className="flex items-center gap-0.5">
              <button onClick={() => onWrapSelection('*')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="加粗">
                <Bold size={15} />
              </button>
              <button onClick={() => onWrapSelection('_')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="斜体">
                <Italic size={15} />
              </button>
              <button onClick={() => onWrapSelection('#underline[', ']')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="下划线">
                <Underline size={15} />
              </button>
              <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1" />
              <button onClick={() => onPrefixLine('= ')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="标题">
                <Heading size={15} />
              </button>
              <button onClick={() => onPrefixLine('- ')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="列表">
                <List size={15} />
              </button>
              <button onClick={() => onPrefixLine('+ ')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="有序列表">
                <ListOrdered size={15} />
              </button>
              <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1" />
              <button onClick={() => onWrapSelection('$')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="公式">
                <span className="text-sm font-serif">Σ</span>
              </button>
              <button onClick={() => onWrapSelection('```\n', '\n```')} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="代码块">
                <Code size={15} />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {hasActiveTemplate && (
            <button
              onClick={onSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isSaving ? '保存中...' : '保存'}
            </button>
          )}

          <button
            onClick={onOpenVersions}
            disabled={!hasActiveTemplate}
            className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-all"
            title={!hasActiveTemplate ? '请先选择模版' : '查看历史版本并回滚'}
          >
            历史版本
          </button>

          <button
            onClick={onOpenDataModal}
            disabled={!hasActiveTemplate}
            className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-all"
          >
            <Database size={14} className="text-green-600 dark:text-green-400" /> 模拟数据
          </button>

          <button
            onClick={onExportPdf}
            disabled={isExportingPdf || activeTab !== 'preview' || !hasActiveTemplate}
            className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-all"
            title={!hasActiveTemplate ? '请选择或新建模版后导出' : (activeTab !== 'preview' ? '切换到预览后可导出' : '导出 PDF')}
          >
            {isExportingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} className="text-slate-500 dark:text-slate-400" />}
            {isExportingPdf ? '导出中...' : '导出 PDF'}
          </button>

          <button
            onClick={onExportBundle}
            disabled={!hasActiveTemplate}
            className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-all"
            title={!hasActiveTemplate ? '请选择或新建模版后导出' : '导出完整 TemplateBundle'}
          >
            <Download size={14} className="text-slate-500 dark:text-slate-400" />
            导出模板
          </button>

          {!showChat && (
            <button
              onClick={onShowChat}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
              title="展开 AI 对话"
            >
              <PanelRight size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'preview' && (
          <div className="w-full h-full bg-slate-200 dark:bg-slate-800">
            {hasActiveTemplate ? (
              <TypstPreview
                ref={previewRef}
                bundleFiles={bundleFiles}
                code={code}
                data={data}
                onZoomChange={onPreviewZoomChange}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="max-w-[520px] text-center px-6">
                  <div className="mx-auto w-16 h-16 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-white/60 dark:border-slate-700/60 shadow-sm flex items-center justify-center">
                    <Sparkles size={22} className="text-slate-500 dark:text-slate-300" />
                  </div>
                  <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">先选一个模板开始</h2>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    选择一个模板，我们会帮你自动填好结构，快速进入编辑。
                  </p>
                  <div className="mt-5 flex items-center justify-center gap-3">
                    <button
                      disabled
                      title="热门模板选择，敬请期待"
                      className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold shadow-sm opacity-50 cursor-not-allowed"
                    >
                      热门模板选择，敬请期待
                    </button>
                    <button
                      onClick={onOpenBlankDialog}
                      className="px-4 py-2 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-white"
                    >
                      从空白开始
                    </button>
                  </div>
                  <p className="mt-4 text-xs text-slate-400">
                    也可以在左侧新建或选择模板
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'code' && (
          hasActiveTemplate ? (
            <Editor
              height="100%"
              defaultLanguage="markdown"
              theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
              value={code}
              onChange={(value) => onCodeChange(value || '')}
              onMount={onEditorMount}
              options={{
                fontSize: 14,
                fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
                minimap: { enabled: false },
                lineNumbers: 'on',
                wordWrap: 'on',
                padding: { top: 16 },
                scrollBeyondLastLine: false,
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-50 dark:bg-slate-900">
              <div className="max-w-[520px] text-center px-6">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center">
                  <Code2 size={22} className="text-slate-500 dark:text-slate-300" />
                </div>
                <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">先选模板再开始编辑</h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  选择一个模板或新建一个空白模板后，代码编辑器会在这里出现。
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    disabled
                    title="热门模板选择，敬请期待"
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold shadow-sm opacity-50 cursor-not-allowed"
                  >
                    热门模板选择，敬请期待
                  </button>
                  <button
                    onClick={onOpenBlankDialog}
                    className="px-4 py-2 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-white"
                  >
                    从空白开始
                  </button>
                </div>
              </div>
            </div>
          )
        )}

        {!isAuthed && (
          <div className="absolute inset-0 bg-white/60 dark:bg-slate-900/70 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="max-w-[420px] w-[86%] bg-white/90 dark:bg-slate-900/90 border border-white/70 dark:border-slate-700/60 shadow-xl rounded-2xl p-6 text-center">
              <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 text-white flex items-center justify-center shadow-sm">
                <Lock size={18} />
              </div>
              <h2 className="mt-4 text-base font-bold text-slate-900 dark:text-white">登录后开始制作</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                登录后可保存模板、导出 PDF，并使用更多功能。
              </p>
              <button
                onClick={onOpenLogin}
                className="mt-4 w-full px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                使用 GitHub 登录
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="h-7 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700/60 px-4 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
        <span>typst-json-render</span>
        <span>{code.length} chars</span>
      </div>
    </main>
  );
}
