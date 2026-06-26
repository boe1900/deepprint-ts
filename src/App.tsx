import { useState, useEffect, useRef, useCallback } from 'react';
import { ApiError, api, type FolderWithTemplates } from '@/lib/api-client';
import {
  Sun, Moon, Monitor,
} from 'lucide-react';
import TemplateDialogStack from '@/components/TemplateDialogStack';
import { useTheme, THEMES } from './hooks/useTheme';
import { useActiveTemplateState } from '@/hooks/useActiveTemplateState';
import { useEditorToolbar } from '@/hooks/useEditorToolbar';
import { useTemplateDialogs } from '@/hooks/useTemplateDialogs';
import { useTemplateVersions } from '@/hooks/useTemplateVersions';
import { type TypstPreviewRef } from '@/components/TypstPreview';
import ChatPanel from '@/components/ChatPanel';
import TemplateVersionsDialog from '@/components/TemplateVersionsDialog';
import WorkspacePane, { type WorkspaceTab } from '@/components/WorkspacePane';
import LocalAiSettingsDialog from '@/components/LocalAiSettingsDialog';
import {
  clearLocalAIConfig,
  hasSeenLocalAIOnboarding,
  isLocalAIConfigReady,
  loadLocalAIConfig,
  markLocalAIOnboardingSeen,
  resetLocalAIOnboarding,
  saveLocalAIConfig,
  type LocalAIConfig,
} from '@/lib/local-ai-config';
import { downloadZip } from '@/lib/download-zip';
import { getBundleTemplate, mergeTemplateBundleState, toTemplateBundleFiles, type TemplateBundleFiles } from '@/lib/template-bundle';
import { bytesFromBase64, compileTemplateBundleForFeedback } from '@/lib/typst-compile';

// Auth
import { authClient } from '@/lib/auth-client';
import { LoginDialog } from '@/components/auth/login-dialog';

// New layout components
import TemplateTree from '@/components/TemplateTree';
import DataEditorDialog from '@/components/DataEditorDialog';

// 默认 Typst 代码
const DEFAULT_CODE = `
// DeepPrint Default Template
// 优化：使用 A5 纸张，视觉更紧凑；边距适中
#set page(paper: "a5", margin: (x: 1.5cm, y: 1.5cm))
#set text(font: "Noto Sans SC", size: 10pt, lang: "zh")

// 1. 安全获取数据
//#let data = json.decode(sys.inputs.data)

// 定义一些辅助颜色和样式
#let primary-color = rgb("#2563eb")
#let bg-color = rgb("#eff6ff")
#let code-block(content) = rect(
  fill: luma(245),
  stroke: luma(220),
  inset: 8pt,
  radius: 4pt,
  width: 100%,
  text(font: "Cascadia Code", size: 8pt, fill: luma(80), content)
)

// 2. 页面布局
#align(center)[
  // --- 顶部 Header ---
  #block(inset: (bottom: 1em))[
    #text(2.2em, weight: "black", fill: primary-color)[DeepPrint]
    #h(0.5em)
    #text(1.2em, weight: "bold", fill: gray)[智能打印模版]
  ]

  // --- 核心引导卡片 ---
  #rect(
    width: 100%,
    radius: 8pt,
    stroke: none,
    fill: bg-color,
    inset: 1.5em
  )[
    #set align(left)
    #grid(
      columns: (auto, 1fr),
      gutter: 1em,
      // 左侧图标（用emoji代替）
      text(2.5em)[🚀],
      // 右侧文字
      [
        #text(1.2em, weight: "bold", fill: primary-color)[模版已就绪] \
        #v(0.5em)
        这是一个全新的空白画布。您可以直接在此处编写 Typst 代码，或者呼叫 *DeepPrint AI 助手* 帮您生成。
      ]
    )
  ]

  #v(2em)

  // --- 功能展示区 (让画面不那么空) ---
  #grid(
    columns: (1fr, 1fr),
    gutter: 1em,
    [
      #set align(left)
      #text(weight: "bold", fill: luma(100))[📝 常用指令示例]
      #v(0.5em)
      - 生成 *销售出库单*
      - 设计 *100x150 面单*
      - 添加 *二维码* 和 *Logo*
      - 绑定 *JSON 数据*
    ],
    [
      #set align(left)
      #text(weight: "bold", fill: luma(100))[📊 数据绑定预览]
      #v(0.5em)
      // 模拟一个简单的数据展示，让用户知道数据去哪了
      #code-block(
        if data.keys().len() == 0 [
          // 空数据时的占位
          { "message": "No Data" }
        ] else [
          // 有数据时显示 Keys
          #data
        ]
      )
    ]
  )
  
  #v(2fr) // 撑开空间，把页脚推到底部

  // --- 页脚 ---
  #line(length: 100%, stroke: 0.5pt + gray)
  #v(0.5em)
  #text(0.8em, fill: gray)[
    DeepPrint Studio · 现在的纸张大小是 A5
  ]
]
`;

// 默认数据
const DEFAULT_DATA = {
  "order_id": "ORD-20268888",
  "time": "2026-02-04 12:30",
  "total": "128.00",
  "items": [
    {
      "name": "拿铁咖啡",
      "price": 28.00
    },
    {
      "name": "海盐芝士蛋糕",
      "price": 35.00
    },
    {
      "name": "经典意式肉酱面",
      "price": 45.00
    },
    {
      "name": "鲜榨橙汁",
      "price": 20.00
    }
  ]
};

const parseTemplateDataJson = (raw: string): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } => {
  try {
    const parsed = JSON.parse(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'data.json 必须是 JSON object' };
    }
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `data.json 解析失败：${err.message}` : 'data.json 解析失败' };
  }
};

export default function DeepPrintStudio() {
  // UI 状态
  const [showChat, setShowChat] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('preview');
  const [previewZoom, setPreviewZoom] = useState(1);
  const [showDataModal, setShowDataModal] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showAiSettingsDialog, setShowAiSettingsDialog] = useState(false);
  const [localAiConfig, setLocalAiConfig] = useState<LocalAIConfig | null>(() => loadLocalAIConfig());

  // API 数据状态
  const [folders, setFolders] = useState<FolderWithTemplates[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // TypstPreview ref for zoom controls
  const previewRef = useRef<TypstPreviewRef>(null);
  const {
    activeTemplateId,
    chatSeedMessages,
    chatSeedVersion,
    isChatSeedLoading,
    bundleFiles,
    code,
    data,
    hasActiveTemplate,
    resetActiveTemplate,
    selectTemplate: handleSelectTemplate,
    setCode,
    setData,
    setBundleFiles,
  } = useActiveTemplateState({
    defaultCode: DEFAULT_CODE,
    defaultData: DEFAULT_DATA,
  });
  const {
    handleEditorMount,
    prefixLine,
    wrapSelection,
  } = useEditorToolbar();

  // Auth
  const [session, setSession] = useState<{ user: { id?: string | null; name?: string | null; email?: string | null; image?: string | null; createdAt?: string | Date | null } } | null>(null);
  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      setSession(data);
    }).catch(() => {
      setSession(null);
    });
  }, []);

  // 登录后加载分组列表
  const loadFolders = useCallback(async () => {
    setIsLoadingFolders(true);
    try {
      const data = await api.getFolders();
      setFolders(data);
    } catch {
      // 未登录或网络错误时保持空列表
      setFolders([]);
    } finally {
      setIsLoadingFolders(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user) {
      loadFolders();
    } else {
      setFolders([]);
      resetActiveTemplate();
    }
  }, [session, loadFolders, resetActiveTemplate]);

  const isAuthed = !!session?.user;
  const hasLocalAiConfig = isLocalAIConfigReady(localAiConfig);

  const handleSaveLocalAiConfig = useCallback((nextConfig: LocalAIConfig) => {
    const saved = saveLocalAIConfig(nextConfig);
    markLocalAIOnboardingSeen();
    setLocalAiConfig(saved);
  }, []);

  const handleClearLocalAiConfig = useCallback(() => {
    clearLocalAIConfig();
    resetLocalAIOnboarding();
    setLocalAiConfig(null);
  }, []);

  useEffect(() => {
    if (!showChat) return;
    if (hasLocalAiConfig) return;
    if (showAiSettingsDialog) return;
    if (hasSeenLocalAIOnboarding()) return;

    markLocalAIOnboardingSeen();
    setShowAiSettingsDialog(true);
  }, [hasLocalAiConfig, showAiSettingsDialog, showChat]);

  const handleShowChat = useCallback(() => {
    setShowChat(true);
    if (!hasLocalAiConfig) {
      markLocalAIOnboardingSeen();
      setShowAiSettingsDialog(true);
    }
  }, [hasLocalAiConfig]);

  // 保存当前模版
  const handleSave = useCallback(async () => {
    if (!activeTemplateId) return;
    const files = mergeTemplateBundleState(bundleFiles, code, data);
    setIsSaving(true);
    try {
      await api.updateTemplate(activeTemplateId, {
        content: code,
        mock_data: data,
          files_json: files,
          update_source: 'manual',
        update_summary: '手动保存',
      });
      setBundleFiles(files);
    } catch (err) {
      console.error('保存失败:', err);
      alert('保存失败，请检查网络连接或登录状态');
    } finally {
      setIsSaving(false);
    }
  }, [activeTemplateId, bundleFiles, code, data, setBundleFiles]);

  const handlePersistAiMessages = useCallback(async (templateId: string, messages: Array<{ role: string; parts: unknown[] }>) => {
    if (!templateId) return;
    try {
      await api.putTemplateAiThreadMessages(templateId, messages.slice(-200));
    } catch (err) {
      console.error('保存 AI 会话失败:', err);
    }
  }, []);

  const templateDialogs = useTemplateDialogs({
    folders,
    activeTemplateId,
    loadFolders,
    selectTemplate: handleSelectTemplate,
    resetActiveTemplate,
  });
  const templateVersions = useTemplateVersions({
    activeTemplateId,
    defaultCode: DEFAULT_CODE,
    defaultData: DEFAULT_DATA,
    previewRef,
    setCode,
    setData,
    setBundleFiles,
  });

  const sanitizeFilename = useCallback((name: string) => {
    return name.replace(/[\\/:*?"<>|]/g, '_');
  }, []);

  const handleExportPdf = useCallback(async () => {
    if (!activeTemplateId) return;
    setIsExportingPdf(true);
    try {
      const files = mergeTemplateBundleState(bundleFiles, code, data);
      const result = await api.compileTemplateBundle(files, {
        format: 'pdf',
        include_artifact_base64: true,
      });
      const pdfBytes = result.artifact_base64 ? bytesFromBase64(result.artifact_base64) : null;
      if (!pdfBytes?.length) {
        alert('导出失败，请检查模板是否有编译错误');
        return;
      }
      const activeTemplate = folders.flatMap(f => f.templates).find(t => t.id === activeTemplateId);
      const baseName = sanitizeFilename(activeTemplate?.name || 'typst-export');
      const safeBytes = new Uint8Array(pdfBytes);
      const blob = new Blob([safeBytes.buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('导出 PDF 失败:', err);
      alert('导出失败，请稍后再试');
    } finally {
      setIsExportingPdf(false);
    }
  }, [activeTemplateId, bundleFiles, code, data, folders, sanitizeFilename]);

  const handleExportBundle = useCallback(() => {
    if (!activeTemplateId) return;
    const activeTemplate = folders.flatMap(f => f.templates).find(t => t.id === activeTemplateId);
    const baseName = sanitizeFilename(activeTemplate?.name || 'template-bundle');
    downloadZip(`${baseName}.template-bundle.zip`, mergeTemplateBundleState(bundleFiles, code, data));
  }, [activeTemplateId, bundleFiles, code, data, folders, sanitizeFilename]);

  const handleCodeChange = useCallback((nextCode: string) => {
    setCode(nextCode);
    setBundleFiles(mergeTemplateBundleState(bundleFiles, nextCode, data));
  }, [bundleFiles, data, setBundleFiles, setCode]);

  const handleDataSave = useCallback((nextData: Record<string, unknown>) => {
    setData(nextData);
    setBundleFiles(mergeTemplateBundleState(bundleFiles, code, nextData));
  }, [bundleFiles, code, setBundleFiles, setData]);

  // 主题
  const { theme, resolvedTheme, cycleTheme } = useTheme();
  const ThemeIcon = theme === THEMES.SYSTEM ? Monitor : (theme === THEMES.LIGHT ? Sun : Moon);
  const themeLabel = theme === THEMES.SYSTEM ? '跟随系统' : (theme === THEMES.LIGHT ? '浅色' : '深色');

  // AI 工具回调：应用代码并立即编译，返回给模型用于自动修复循环
  const handleApplyAndValidateFromAi = useCallback(async (files: TemplateBundleFiles) => {
    const steps = [];
    const inputFiles = toTemplateBundleFiles(files, getBundleTemplate(files), data);
    const nextCode = getBundleTemplate(inputFiles);
    const parsedData = parseTemplateDataJson(inputFiles['data.json'] || '{}');
    if (!parsedData.ok) {
      steps.push({ label: '模拟数据校验', detail: 'data.json 解析失败，等待 AI 修复', state: 'error' as const, error: parsedData.error });
      return {
        ok: false,
        error: parsedData.error,
        steps,
      };
    }
    const nextData = parsedData.data;
    const mergedData = Object.keys(nextData).length > 0 ? nextData : data;
    const normalizedFiles = {
      ...inputFiles,
      'template.typ': nextCode,
      'data.json': JSON.stringify(mergedData, null, 2),
    };

    setCode(nextCode);
    setData(mergedData);
    setBundleFiles(normalizedFiles);
    steps.push({ label: '应用草稿', detail: '模板和测试数据已应用到当前工作区，正在编译校验', state: 'done' as const });

    const compileResult = await compileTemplateBundleForFeedback(normalizedFiles, nextCode, {
      format: 'png',
      includeArtifactBase64: false,
    });
    if (!compileResult.ok) {
      steps.push({ label: '渲染校验', detail: '编译失败，等待 AI 修复', state: 'error' as const, error: compileResult.error });
      return {
        ...compileResult,
        files: normalizedFiles,
        steps,
      };
    }
    steps.push({ label: '渲染校验', detail: '编译通过，预览已更新', state: 'done' as const });

    if (compileResult.ok && activeTemplateId) {
      try {
        await api.updateTemplate(activeTemplateId, {
          content: nextCode,
          mock_data: mergedData,
          files_json: normalizedFiles,
          update_source: 'ai',
          update_summary: 'AI 应用模板修改',
        });
        steps.push({ label: '保存结果', detail: '已保存到当前模板', state: 'done' as const });
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          setCode(code);
          setData(data);
          setBundleFiles(bundleFiles);
          void previewRef.current?.compileAndGetError(code, data, true);
        }
        steps.push({ label: '保存结果', detail: '持久化失败', state: 'error' as const });
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'AI 修改已应用，但持久化失败',
          steps,
        };
      }
    }
    return {
      ...compileResult,
      files: normalizedFiles,
      steps,
    };
  }, [activeTemplateId, bundleFiles, code, data, setBundleFiles, setCode, setData]);

  return (
    <div className="flex h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-white overflow-hidden transition-colors">

      {/* ─── 左侧栏：模版资源管理器 ─── */}
      <TemplateTree
        groups={folders}
        isLoading={isLoadingFolders}
        activeTemplateId={activeTemplateId}
        onSelectTemplate={handleSelectTemplate}
        onCreateFolder={templateDialogs.createDialog.openFolderDialog}
        onCreateTemplate={templateDialogs.createDialog.openTemplateDialog}
        onRenameFolder={templateDialogs.renameDialog.openFolderDialog}
        onDeleteFolder={templateDialogs.deleteDialog.openFolderDialog}
        onRenameTemplate={templateDialogs.renameDialog.openTemplateDialog}
        onDeleteTemplate={templateDialogs.deleteDialog.openTemplateDialog}
        user={session?.user}
        onLogin={() => setShowLoginDialog(true)}
        onCycleTheme={cycleTheme}
        themeLabel={themeLabel}
        ThemeIcon={ThemeIcon}
        isAuthed={isAuthed}
        hasLocalAiConfig={hasLocalAiConfig}
        onOpenAiSettings={() => setShowAiSettingsDialog(true)}
      />

      <WorkspacePane
        activeTab={activeTab}
        bundleFiles={bundleFiles}
        code={code}
        data={data}
        hasActiveTemplate={hasActiveTemplate}
        isAuthed={isAuthed}
        isExportingPdf={isExportingPdf}
        isSaving={isSaving}
        previewRef={previewRef}
        previewZoom={previewZoom}
        resolvedTheme={resolvedTheme}
        showChat={showChat}
        onChangeTab={setActiveTab}
        onCodeChange={handleCodeChange}
        onEditorMount={handleEditorMount}
        onExportPdf={handleExportPdf}
        onExportBundle={handleExportBundle}
        onOpenBlankDialog={templateDialogs.blankDialog.openDialog}
        onOpenDataModal={() => setShowDataModal(true)}
        onOpenLogin={() => setShowLoginDialog(true)}
        onOpenVersions={templateVersions.dialog.openDialog}
        onPrefixLine={prefixLine}
        onPreviewZoomChange={setPreviewZoom}
        onSave={handleSave}
        onShowChat={handleShowChat}
        onWrapSelection={wrapSelection}
      />

      {/* ─── 右侧栏：AI 对话 ─── */}
      <div className={showChat ? '' : 'hidden'}>
        {!isChatSeedLoading && (
          <ChatPanel
            key={`${activeTemplateId || 'no-template'}:${chatSeedVersion}`}
            activeTemplateId={activeTemplateId}
            currentBundleFiles={bundleFiles}
            currentCode={code}
            currentData={data}
            initialMessages={chatSeedMessages}
            localAiConfig={localAiConfig}
            onPersistMessages={handlePersistAiMessages}
            onApplyAndValidate={handleApplyAndValidateFromAi}
            onClose={() => setShowChat(false)}
            onOpenSettings={() => setShowAiSettingsDialog(true)}
          />
        )}
      </div>

      {/* 模拟数据弹窗 */}
      <DataEditorDialog
        open={showDataModal}
        onOpenChange={setShowDataModal}
        data={data}
        onSave={handleDataSave}
        resolvedTheme={resolvedTheme}
      />

      <TemplateVersionsDialog
        open={templateVersions.dialog.open}
        onOpenChange={templateVersions.dialog.onOpenChange}
        isLoading={templateVersions.dialog.isLoading}
        isRestoringVersion={templateVersions.dialog.isRestoringVersion}
        versions={templateVersions.dialog.versions}
        onRestoreVersion={templateVersions.dialog.onRestoreVersion}
      />

      {/* 登录对话框 */}
      <LoginDialog open={showLoginDialog} onOpenChange={setShowLoginDialog} />

      <LocalAiSettingsDialog
        open={showAiSettingsDialog}
        onOpenChange={setShowAiSettingsDialog}
        value={localAiConfig}
        onSave={handleSaveLocalAiConfig}
        onClear={handleClearLocalAiConfig}
      />

      <TemplateDialogStack folders={folders} templateDialogs={templateDialogs} />
    </div>
  );
}
