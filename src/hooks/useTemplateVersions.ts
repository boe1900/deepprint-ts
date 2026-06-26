import { type RefObject, useCallback, useState } from 'react';
import { api, type TemplateVersion } from '@/lib/api-client';
import { type TypstPreviewRef } from '@/components/TypstPreview';
import { getBundleData, getBundleTemplate, toTemplateBundleFiles, type TemplateBundleFiles } from '@/lib/template-bundle';

interface UseTemplateVersionsParams {
  activeTemplateId: string;
  defaultCode: string;
  defaultData: Record<string, unknown>;
  previewRef: RefObject<TypstPreviewRef | null>;
  setCode: (code: string) => void;
  setData: (data: Record<string, unknown>) => void;
  setBundleFiles: (files: TemplateBundleFiles) => void;
}

export function useTemplateVersions({
  activeTemplateId,
  defaultCode,
  defaultData,
  previewRef,
  setCode,
  setData,
  setBundleFiles,
}: UseTemplateVersionsParams) {
  const [showVersionsDialog, setShowVersionsDialog] = useState(false);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isRestoringVersion, setIsRestoringVersion] = useState(false);

  const loadVersions = useCallback(async () => {
    if (!activeTemplateId) return;
    setIsLoadingVersions(true);
    try {
      const list = await api.getTemplateVersions(activeTemplateId, 30);
      setVersions(list);
    } catch (err) {
      console.error('加载版本历史失败:', err);
      setVersions([]);
    } finally {
      setIsLoadingVersions(false);
    }
  }, [activeTemplateId]);

  const handleOpenVersions = useCallback(async () => {
    if (!activeTemplateId) return;
    setShowVersionsDialog(true);
    await loadVersions();
  }, [activeTemplateId, loadVersions]);

  const handleRestoreVersion = useCallback(async (versionId: string) => {
    if (!activeTemplateId) return;
    setIsRestoringVersion(true);
    try {
      const restored = await api.restoreTemplateVersion(activeTemplateId, versionId);
      const files = toTemplateBundleFiles(restored.files_json, restored.content || defaultCode, restored.mock_data || defaultData);
      const nextCode = getBundleTemplate(files) || defaultCode;
      const nextData = getBundleData(files);

      setCode(nextCode);
      setData(Object.keys(nextData).length > 0 ? nextData : defaultData);
      setBundleFiles(files);

      if (previewRef.current) {
        await previewRef.current.compileAndGetError(nextCode, nextData, true, files);
      }

      await loadVersions();
    } catch (err) {
      console.error('回滚版本失败:', err);
      alert(err instanceof Error ? err.message : '回滚失败');
    } finally {
      setIsRestoringVersion(false);
    }
  }, [activeTemplateId, defaultCode, defaultData, loadVersions, previewRef, setBundleFiles, setCode, setData]);

  return {
    dialog: {
      open: showVersionsDialog,
      versions,
      isLoading: isLoadingVersions,
      isRestoringVersion,
      onOpenChange: setShowVersionsDialog,
      openDialog: handleOpenVersions,
      onRestoreVersion: handleRestoreVersion,
    },
  };
}
