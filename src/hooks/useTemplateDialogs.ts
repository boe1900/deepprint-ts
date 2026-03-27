import { useCallback, useState } from 'react';
import { api, ApiError, type FolderWithTemplates } from '@/lib/api-client';

type DialogMode = 'folder' | 'template';

interface UseTemplateDialogsParams {
  folders: FolderWithTemplates[];
  activeTemplateId: string;
  loadFolders: () => Promise<void>;
  selectTemplate: (id: string) => void | Promise<void>;
  resetActiveTemplate: () => void;
}

export function useTemplateDialogs({
  folders,
  activeTemplateId,
  loadFolders,
  selectTemplate,
  resetActiveTemplate,
}: UseTemplateDialogsParams) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createDialogMode, setCreateDialogMode] = useState<DialogMode>('folder');
  const [createTargetFolderId, setCreateTargetFolderId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameDialogMode, setRenameDialogMode] = useState<DialogMode>('folder');
  const [renameTargetId, setRenameTargetId] = useState('');
  const [renameDefaultValue, setRenameDefaultValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState('');

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteDialogMode, setDeleteDialogMode] = useState<DialogMode>('folder');
  const [deleteTargetId, setDeleteTargetId] = useState('');
  const [deleteTargetName, setDeleteTargetName] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [deleteBlockedMessage, setDeleteBlockedMessage] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const [showBlankDialog, setShowBlankDialog] = useState(false);
  const [blankFolderId, setBlankFolderId] = useState('');
  const [blankError, setBlankError] = useState('');
  const [returnToBlankAfterCreateFolder, setReturnToBlankAfterCreateFolder] = useState(false);

  const openCreateFolderDialog = useCallback(() => {
    setCreateDialogMode('folder');
    setCreateTargetFolderId('');
    setCreateError('');
    setShowCreateDialog(true);
  }, []);

  const openCreateTemplateDialog = useCallback((folderId: string) => {
    setCreateDialogMode('template');
    setCreateTargetFolderId(folderId);
    setCreateError('');
    setShowCreateDialog(true);
  }, []);

  const openBlankTemplateDialog = useCallback(() => {
    setBlankError('');
    setBlankFolderId(folders.length > 0 ? folders[0].id : '');
    setShowBlankDialog(true);
  }, [folders]);

  const handleCreateBlankConfirm = useCallback(async (name: string) => {
    const nextName = name.trim();
    if (!nextName) {
      setBlankError('名称不能为空');
      return;
    }
    if (!blankFolderId) {
      setBlankError('请先选择分组');
      return;
    }

    setIsCreating(true);
    try {
      const targetFolder = folders.find((folder) => folder.id === blankFolderId);
      const hasDuplicate = targetFolder?.templates?.some((template) => template.name.trim().toLowerCase() === nextName.toLowerCase());
      if (hasDuplicate) {
        setBlankError('同一分组下模版名称不能重复');
        return;
      }

      const newTemplate = await api.createTemplate(blankFolderId, nextName);
      selectTemplate(newTemplate.id);
      await loadFolders();
      setShowBlankDialog(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setBlankError('同一分组下模版名称不能重复');
        } else if (err.status === 400) {
          setBlankError(err.message || '名称不合法');
        } else {
          setBlankError(err.message || '创建失败，请稍后再试');
        }
      } else {
        setBlankError(err instanceof Error ? err.message : '创建失败，请稍后再试');
      }
    } finally {
      setIsCreating(false);
    }
  }, [blankFolderId, folders, loadFolders, selectTemplate]);

  const handleCreateConfirm = useCallback(async (name: string) => {
    const nextName = name.trim();
    if (!nextName) {
      setCreateError('名称不能为空');
      return;
    }

    setIsCreating(true);
    try {
      if (createDialogMode === 'folder') {
        const createdFolder = await api.createFolder(nextName);
        await loadFolders();
        if (returnToBlankAfterCreateFolder) {
          setReturnToBlankAfterCreateFolder(false);
          setBlankFolderId(createdFolder.id);
          setShowBlankDialog(true);
          setShowCreateDialog(false);
          return;
        }
      } else {
        const targetFolder = folders.find((folder) => folder.id === createTargetFolderId);
        const hasDuplicate = targetFolder?.templates?.some((template) => template.name.trim().toLowerCase() === nextName.toLowerCase());
        if (hasDuplicate) {
          setCreateError('同一分组下模版名称不能重复');
          return;
        }
        const newTemplate = await api.createTemplate(createTargetFolderId, nextName);
        selectTemplate(newTemplate.id);
      }

      await loadFolders();
      setShowCreateDialog(false);
    } catch (err) {
      console.error(`创建${createDialogMode === 'folder' ? '分组' : '模版'}失败:`, err);
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setCreateError(createDialogMode === 'folder' ? '分组名称不能重复' : '同一分组下模版名称不能重复');
        } else if (err.status === 400) {
          setCreateError(err.message || '名称不合法');
        } else {
          setCreateError(err.message || '创建失败，请稍后再试');
        }
      }
    } finally {
      setIsCreating(false);
    }
  }, [createDialogMode, createTargetFolderId, folders, loadFolders, returnToBlankAfterCreateFolder, selectTemplate]);

  const openRenameFolderDialog = useCallback((id: string, name: string) => {
    setRenameDialogMode('folder');
    setRenameTargetId(id);
    setRenameDefaultValue(name);
    setRenameError('');
    setShowRenameDialog(true);
  }, []);

  const openRenameTemplateDialog = useCallback((id: string, name: string) => {
    setRenameDialogMode('template');
    setRenameTargetId(id);
    setRenameDefaultValue(name);
    setRenameError('');
    setShowRenameDialog(true);
  }, []);

  const handleRenameConfirm = useCallback(async (name: string) => {
    const nextName = name.trim();
    if (!nextName) {
      setRenameError('名称不能为空');
      return;
    }

    setIsRenaming(true);
    try {
      if (renameDialogMode === 'folder') {
        await api.updateFolder(renameTargetId, { name: nextName });
      } else {
        const targetFolder = folders.find((folder) => folder.templates.some((template) => template.id === renameTargetId));
        const hasDuplicate = targetFolder?.templates?.some((template) =>
          template.id !== renameTargetId && template.name.trim().toLowerCase() === nextName.toLowerCase(),
        );
        if (hasDuplicate) {
          setRenameError('同一分组下模版名称不能重复');
          return;
        }
        await api.updateTemplate(renameTargetId, { name: nextName });
      }

      await loadFolders();
      setShowRenameDialog(false);
    } catch (err) {
      console.error(`重命名${renameDialogMode === 'folder' ? '分组' : '模版'}失败:`, err);
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setRenameError(renameDialogMode === 'folder' ? '分组名称不能重复' : '同一分组下模版名称不能重复');
        } else if (err.status === 400) {
          setRenameError(err.message || '名称不合法');
        } else {
          setRenameError(err.message || '操作失败');
        }
      } else {
        setRenameError(err instanceof Error ? err.message : '操作失败');
      }
    } finally {
      setIsRenaming(false);
    }
  }, [folders, loadFolders, renameDialogMode, renameTargetId]);

  const openDeleteFolderDialog = useCallback((id: string) => {
    const target = folders.find((folder) => folder.id === id);
    if (target && target.templates.length > 0) {
      setDeleteDialogMode('folder');
      setDeleteTargetId(id);
      setDeleteTargetName(target.name);
      setDeleteBlocked(true);
      setDeleteBlockedMessage('该分组下存在模版，无法删除。请先移动或删除分组内的模版。');
      setShowDeleteDialog(true);
      return;
    }

    setDeleteDialogMode('folder');
    setDeleteTargetId(id);
    setDeleteTargetName(target?.name ?? '');
    setDeleteBlocked(false);
    setDeleteBlockedMessage('');
    setShowDeleteDialog(true);
  }, [folders]);

  const openDeleteTemplateDialog = useCallback((id: string) => {
    const target = folders.flatMap((folder) => folder.templates).find((template) => template.id === id);
    setDeleteDialogMode('template');
    setDeleteTargetId(id);
    setDeleteTargetName(target?.name ?? '');
    setDeleteBlocked(false);
    setDeleteBlockedMessage('');
    setShowDeleteDialog(true);
  }, [folders]);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteBlocked) {
      setShowDeleteDialog(false);
      return;
    }

    setIsDeleting(true);
    try {
      if (deleteDialogMode === 'folder') {
        await api.deleteFolder(deleteTargetId);
      } else {
        await api.deleteTemplate(deleteTargetId);
        if (activeTemplateId === deleteTargetId) {
          resetActiveTemplate();
        }
      }

      await loadFolders();
      setShowDeleteDialog(false);
    } catch (err) {
      console.error(`删除${deleteDialogMode === 'folder' ? '分组' : '模版'}失败:`, err);
      alert(err instanceof Error ? err.message : '删除失败');
    } finally {
      setIsDeleting(false);
    }
  }, [activeTemplateId, deleteBlocked, deleteDialogMode, deleteTargetId, loadFolders, resetActiveTemplate]);

  const handleCreateDialogOpenChange = useCallback((open: boolean) => {
    setShowCreateDialog(open);
    if (!open) setCreateError('');
  }, []);

  const handleRenameDialogOpenChange = useCallback((open: boolean) => {
    setShowRenameDialog(open);
    if (!open) setRenameError('');
  }, []);

  const handleBlankDialogOpenChange = useCallback((open: boolean) => {
    setShowBlankDialog(open);
    if (!open) setBlankError('');
  }, []);

  const handleBlankSelectChange = useCallback((value: string) => {
    setBlankFolderId(value);
    setBlankError('');
  }, []);

  const handleBlankSelectAction = useCallback(() => {
    setShowBlankDialog(false);
    setCreateDialogMode('folder');
    setCreateTargetFolderId('');
    setCreateError('');
    setReturnToBlankAfterCreateFolder(true);
    setShowCreateDialog(true);
  }, []);

  return {
    createDialog: {
      open: showCreateDialog,
      mode: createDialogMode,
      isLoading: isCreating,
      errorMessage: createError,
      openFolderDialog: openCreateFolderDialog,
      openTemplateDialog: openCreateTemplateDialog,
      onOpenChange: handleCreateDialogOpenChange,
      clearError: () => setCreateError(''),
      onConfirm: handleCreateConfirm,
    },
    renameDialog: {
      open: showRenameDialog,
      mode: renameDialogMode,
      defaultValue: renameDefaultValue,
      isLoading: isRenaming,
      errorMessage: renameError,
      openFolderDialog: openRenameFolderDialog,
      openTemplateDialog: openRenameTemplateDialog,
      onOpenChange: handleRenameDialogOpenChange,
      clearError: () => setRenameError(''),
      onConfirm: handleRenameConfirm,
    },
    deleteDialog: {
      open: showDeleteDialog,
      mode: deleteDialogMode,
      targetName: deleteTargetName,
      blocked: deleteBlocked,
      blockedMessage: deleteBlockedMessage,
      isLoading: isDeleting,
      openFolderDialog: openDeleteFolderDialog,
      openTemplateDialog: openDeleteTemplateDialog,
      onOpenChange: setShowDeleteDialog,
      onConfirm: handleDeleteConfirm,
    },
    blankDialog: {
      open: showBlankDialog,
      folderId: blankFolderId,
      errorMessage: blankError,
      isLoading: isCreating,
      openDialog: openBlankTemplateDialog,
      onOpenChange: handleBlankDialogOpenChange,
      clearError: () => setBlankError(''),
      onSelectChange: handleBlankSelectChange,
      onSelectAction: handleBlankSelectAction,
      onConfirm: handleCreateBlankConfirm,
    },
  };
}

export type TemplateDialogsState = ReturnType<typeof useTemplateDialogs>;
