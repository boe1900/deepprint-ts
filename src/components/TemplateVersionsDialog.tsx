import { type TemplateVersion } from '@/lib/api-client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TemplateVersionsDialogProps {
  isLoading: boolean;
  isRestoringVersion: boolean;
  onOpenChange: (open: boolean) => void;
  onRestoreVersion: (versionId: string) => void | Promise<void>;
  open: boolean;
  versions: TemplateVersion[];
}

function getVersionSourceLabel(source: TemplateVersion['source']) {
  if (source === 'ai') return 'AI 修改';
  if (source === 'rollback') return '回滚版本';
  return '手动保存';
}

export default function TemplateVersionsDialog({
  isLoading,
  isRestoringVersion,
  onOpenChange,
  onRestoreVersion,
  open,
  versions,
}: TemplateVersionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>历史版本</DialogTitle>
          <DialogDescription>每次手动保存、AI 应用成功、回滚操作都会生成版本快照。</DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-auto divide-y divide-slate-200 dark:divide-slate-700/60 border border-slate-200 dark:border-slate-700/60 rounded-lg">
          {isLoading && (
            <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">加载中...</div>
          )}
          {!isLoading && versions.length === 0 && (
            <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">暂无历史版本</div>
          )}
          {!isLoading && versions.map((version) => (
            <div key={version.id} className="px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {getVersionSourceLabel(version.source)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {new Date((version.created_at || 0) * 1000).toLocaleString()}
                  {version.summary ? ` · ${version.summary}` : ''}
                </p>
              </div>
              <button
                disabled={isRestoringVersion}
                onClick={() => onRestoreVersion(version.id)}
                className="px-3 py-1.5 text-xs rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {isRestoringVersion ? '恢复中...' : '恢复到此版本'}
              </button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
