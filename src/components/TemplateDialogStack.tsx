import { type FolderWithTemplates } from '@/lib/api-client';
import { type TemplateDialogsState } from '@/hooks/useTemplateDialogs';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { InputDialog } from '@/components/InputDialog';

interface TemplateDialogStackProps {
  folders: FolderWithTemplates[];
  templateDialogs: TemplateDialogsState;
}

export default function TemplateDialogStack({
  folders,
  templateDialogs,
}: TemplateDialogStackProps) {
  return (
    <>
      <InputDialog
        open={templateDialogs.createDialog.open}
        onOpenChange={templateDialogs.createDialog.onOpenChange}
        title={templateDialogs.createDialog.mode === 'folder' ? '新建业务分组' : '新建模版'}
        description={templateDialogs.createDialog.mode === 'folder' ? '分组用于组织和管理你的模版' : '在当前分组中创建一个新的模版'}
        placeholder={templateDialogs.createDialog.mode === 'folder' ? '例如：餐饮业务' : '例如：收银小票'}
        defaultValue={templateDialogs.createDialog.mode === 'template' ? '未命名模版' : ''}
        confirmLabel={templateDialogs.createDialog.mode === 'folder' ? '新建分组' : '新建模版'}
        isLoading={templateDialogs.createDialog.isLoading}
        errorMessage={templateDialogs.createDialog.errorMessage}
        onValueChange={templateDialogs.createDialog.clearError}
        onConfirm={templateDialogs.createDialog.onConfirm}
      />

      <InputDialog
        open={templateDialogs.renameDialog.open}
        onOpenChange={templateDialogs.renameDialog.onOpenChange}
        title={templateDialogs.renameDialog.mode === 'folder' ? '重命名业务分组' : '重命名模版'}
        description={templateDialogs.renameDialog.mode === 'folder' ? '修改分组名称' : '修改模版名称'}
        placeholder={templateDialogs.renameDialog.mode === 'folder' ? '例如：餐饮业务' : '例如：收银小票'}
        defaultValue={templateDialogs.renameDialog.defaultValue}
        confirmLabel="重命名"
        isLoading={templateDialogs.renameDialog.isLoading}
        errorMessage={templateDialogs.renameDialog.errorMessage}
        onValueChange={templateDialogs.renameDialog.clearError}
        onConfirm={templateDialogs.renameDialog.onConfirm}
      />

      <InputDialog
        open={templateDialogs.blankDialog.open}
        onOpenChange={templateDialogs.blankDialog.onOpenChange}
        title="选择分组并创建模版"
        description="将空白模板放入指定分组，方便后续管理"
        placeholder="例如：收银小票"
        defaultValue="未命名模版"
        confirmLabel="创建模版"
        isLoading={templateDialogs.blankDialog.isLoading}
        errorMessage={templateDialogs.blankDialog.errorMessage}
        onValueChange={templateDialogs.blankDialog.clearError}
        confirmDisabled={!templateDialogs.blankDialog.folderId}
        selectLabel="放入分组"
        selectValue={templateDialogs.blankDialog.folderId}
        selectOptions={folders.map((folder) => ({ value: folder.id, label: folder.name }))}
        selectPlaceholder={folders.length > 0 ? '请选择分组' : '暂无分组'}
        onSelectChange={templateDialogs.blankDialog.onSelectChange}
        selectActionLabel="新建分组"
        onSelectAction={templateDialogs.blankDialog.onSelectAction}
        onConfirm={templateDialogs.blankDialog.onConfirm}
      />

      <ConfirmDialog
        open={templateDialogs.deleteDialog.open}
        onOpenChange={templateDialogs.deleteDialog.onOpenChange}
        title={templateDialogs.deleteDialog.mode === 'folder' ? '删除业务分组' : '删除模版'}
        description={templateDialogs.deleteDialog.blocked
          ? templateDialogs.deleteDialog.blockedMessage
          : (templateDialogs.deleteDialog.mode === 'folder'
            ? `确定要删除分组“${templateDialogs.deleteDialog.targetName || '未命名分组'}”吗？此操作不可恢复。`
            : `确定要删除模版“${templateDialogs.deleteDialog.targetName || '未命名模版'}”吗？此操作不可恢复。`)}
        confirmLabel={templateDialogs.deleteDialog.blocked ? '知道了' : '删除'}
        cancelLabel="取消"
        showCancel={!templateDialogs.deleteDialog.blocked}
        variant={templateDialogs.deleteDialog.blocked ? 'default' : 'danger'}
        isLoading={templateDialogs.deleteDialog.isLoading}
        onConfirm={templateDialogs.deleteDialog.onConfirm}
      />
    </>
  );
}
