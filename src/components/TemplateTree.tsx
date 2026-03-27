import { useState, useMemo, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    ChevronRight, ChevronDown, Folder, FileText,
    Plus, Search, Settings, Printer, LogIn, Loader2,
    Pencil, Trash2
} from 'lucide-react';
import { UserMenu } from '@/components/auth/user-menu';
import type { FolderWithTemplates } from '@/lib/api-client';

// ─── Props ───────────────────────────────────────────────────────────────────

interface TemplateTreeProps {
    groups: FolderWithTemplates[];
    isLoading: boolean;
    activeTemplateId: string;
    onSelectTemplate: (id: string) => void;
    onCreateFolder: () => void;
    onCreateTemplate: (folderId: string) => void;
    onRenameFolder: (id: string, name: string) => void;
    onDeleteFolder: (id: string) => void;
    onRenameTemplate: (id: string, name: string) => void;
    onDeleteTemplate: (id: string) => void;
    user?: { id?: string | null; name?: string | null; email?: string | null; image?: string | null; createdAt?: string | Date | null } | null;
    onLogin?: () => void;
    onCycleTheme?: () => void;
    themeLabel?: string;
    ThemeIcon?: LucideIcon;
    isAuthed?: boolean;
    hasLocalAiConfig?: boolean;
    onOpenAiSettings?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TemplateTree({
    groups, isLoading, activeTemplateId, onSelectTemplate,
    onCreateFolder, onCreateTemplate,
    onRenameFolder, onDeleteFolder, onRenameTemplate, onDeleteTemplate,
    user, onLogin, onCycleTheme, themeLabel, ThemeIcon, isAuthed,
    hasLocalAiConfig, onOpenAiSettings,
}: TemplateTreeProps) {
    const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    const toggleGroup = (groupId: string) => {
        setOpenFolders(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    const handleCreateTemplate = (e: React.MouseEvent, groupId: string) => {
        e.stopPropagation();
        onCreateTemplate(groupId);
    };

    // 搜索过滤
    const filteredGroups = useMemo(() => {
        const withOpenState = groups.map(g => ({
            ...g,
            isOpen: openFolders.has(g.id),
        }));

        if (!searchQuery.trim()) return withOpenState;

        return withOpenState
            .map(g => ({
                ...g,
                isOpen: true,
                templates: g.templates.filter(t =>
                    t.name.toLowerCase().includes(searchQuery.toLowerCase())
                ),
            }))
            .filter(g => g.templates.length > 0);
    }, [groups, openFolders, searchQuery]);

    // 自动展开当前选中模版所在分组
    useEffect(() => {
        if (!activeTemplateId) return;
        const owningGroup = groups.find(g => g.templates.some(t => t.id === activeTemplateId));
        if (!owningGroup) return;
        setOpenFolders(prev => {
            if (prev.has(owningGroup.id)) return prev;
            const next = new Set(prev);
            next.add(owningGroup.id);
            return next;
        });
    }, [activeTemplateId, groups]);

    // 时间戳格式化
    const formatTime = (ts: number): string => {
        const now = Math.floor(Date.now() / 1000);
        const diff = now - ts;
        if (diff < 60) return '刚刚';
        if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}天前`;
        return `${Math.floor(diff / 604800)}周前`;
    };

    return (
        <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700/60 flex flex-col shrink-0 z-20">

            {/* Logo */}
            <div className="h-14 border-b border-slate-100 dark:border-slate-700/60 flex items-center px-4 shrink-0">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-black text-lg tracking-tight">
                <Printer size={20} strokeWidth={2.5} />
                <span>DeepPrint</span>
            </div>
            </div>

            {/* Search */}
            <div className="p-3">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" />
                    <input
                        type="text"
                        placeholder="搜索模版..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-600 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                </div>
            </div>

            {/* Tree */}
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1 custom-scrollbar">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 text-slate-400 dark:text-slate-500">
                        <Loader2 size={18} className="animate-spin mr-2" />
                        <span className="text-xs">加载中...</span>
                    </div>
                ) : filteredGroups.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                        <Folder size={32} className="mx-auto mb-3 opacity-30" />
                        <p className="text-xs">暂无分组</p>
                        <p className="text-[10px] mt-1">点击下方按钮新建业务分组</p>
                    </div>
                ) : (
                    filteredGroups.map(group => (
                        <div key={group.id} className="mb-1">
                            {/* Group header */}
                            <div
                                onClick={() => toggleGroup(group.id)}
                                className="group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200">
                                    {group.isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    <Folder size={14} className="text-slate-400 dark:text-slate-500" />
                                    <span>{group.name}</span>
                                </div>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onRenameFolder(group.id, group.name); }}
                                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-all"
                                        title="重命名分组"
                                    >
                                        <Pencil size={12} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDeleteFolder(group.id); }}
                                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-all"
                                        title="删除分组"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                    <button
                                        onClick={(e) => handleCreateTemplate(e, group.id)}
                                        className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-all"
                                        title="在此分组新建模版"
                                    >
                                        <Plus size={12} />
                                    </button>
                                </div>
                            </div>

                            {group.isOpen && (
                                <div className="space-y-0.5 mt-0.5 ml-2 border-l border-slate-100 dark:border-slate-700/50 pl-2">
                                    {group.templates.map(template => (
                                        <div
                                            key={template.id}
                                            onClick={() => onSelectTemplate(template.id)}
                                            className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all border ${activeTemplateId === template.id
                                                ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20 text-blue-700 dark:text-blue-300 shadow-sm'
                                                : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2.5 overflow-hidden">
                                                <FileText
                                                    size={16}
                                                    className={activeTemplateId === template.id ? 'text-blue-500 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}
                                                />
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-sm font-medium truncate leading-tight">{template.name}</span>
                                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{formatTime(template.updated_at)}</span>
                                                </div>
                                            </div>
                                            {template.status === 'draft' && (
                                                <div className="w-1.5 h-1.5 bg-orange-400 rounded-full shrink-0" title="草稿" />
                                            )}
                                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onRenameTemplate(template.id, template.name); }}
                                                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-all"
                                                    title="重命名模版"
                                                >
                                                    <Pencil size={12} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDeleteTemplate(template.id); }}
                                                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-all"
                                                    title="删除模版"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Add template inline */}
                                    <button
                                        onClick={(e) => handleCreateTemplate(e, group.id)}
                                        className="w-full text-left px-3 py-2 text-xs text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer flex items-center gap-2 transition-colors rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                                    >
                                        <Plus size={12} /> 新建模版...
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                )}

                {/* New group button */}
                <button
                    onClick={onCreateFolder}
                    disabled={!isAuthed}
                    title={!isAuthed ? '登录后可新建分组' : undefined}
                    className={`w-full mt-4 flex items-center justify-center gap-2 py-2 border border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-500/10 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg text-xs font-bold transition-all ${!isAuthed ? 'opacity-50 cursor-not-allowed hover:bg-transparent hover:border-slate-200 dark:hover:border-slate-700' : ''}`}
                >
                    <Plus size={14} /> 新建业务分组
                </button>
            </div>

            {/* User area */}
            <div className="p-3 border-t border-slate-100 dark:border-slate-700/60">
                {user?.name ? (
                    <div className="flex items-center justify-between p-1.5">
                        <UserMenu user={user as { id?: string | null; name?: string | null; email?: string | null; image?: string | null; createdAt?: string | Date | null }} popupDirection="up" />
                        <div className="flex items-center gap-1">
                            {ThemeIcon && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onCycleTheme?.(); }}
                                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 transition-colors"
                                    title={themeLabel}
                                >
                                    <ThemeIcon size={14} />
                                </button>
                            )}
                            <div className="relative">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onOpenAiSettings?.(); }}
                                    className={`p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ${hasLocalAiConfig
                                        ? 'text-emerald-500 dark:text-emerald-400'
                                        : 'text-slate-400 dark:text-slate-500'
                                        }`}
                                    title={hasLocalAiConfig ? '本地 AI 已配置' : '配置本地 AI'}
                                >
                                    <Settings size={14} />
                                </button>
                                {hasLocalAiConfig && (
                                    <span className="absolute right-1 top-1 block h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="p-1.5">
                        <div className="flex items-center justify-between">
                            <button
                                onClick={onLogin}
                                title="登录后可保存模板并导出 PDF"
                                className="flex items-center gap-2 px-3 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors flex-1 justify-center"
                            >
                                <LogIn size={14} /> 使用 GitHub 登录
                            </button>
                            <div className="ml-2 relative">
                                <button
                                    onClick={onOpenAiSettings}
                                    className={`p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${hasLocalAiConfig
                                        ? 'text-emerald-500 dark:text-emerald-400'
                                        : 'text-slate-400 dark:text-slate-500'
                                        }`}
                                    title={hasLocalAiConfig ? '本地 AI 已配置' : '配置本地 AI'}
                                >
                                    <Settings size={16} />
                                </button>
                                {hasLocalAiConfig && (
                                    <span className="absolute right-1 top-1 block h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                                )}
                            </div>
                            {ThemeIcon && (
                                <button
                                    onClick={onCycleTheme}
                                    className="ml-2 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition-colors"
                                    title={themeLabel}
                                >
                                    <ThemeIcon size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}
