import { useState, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    ChevronRight, ChevronDown, Folder, FileText,
    Plus, Search, Settings, Printer, LogIn
} from 'lucide-react';
import { UserMenu } from '@/components/auth/user-menu';

// ─── Mock 数据 ───────────────────────────────────────────────────────────────

export interface Template {
    id: string;
    name: string;
    updated: string;
    status: 'active' | 'draft';
}

export interface TemplateGroup {
    id: string;
    name: string;
    isOpen?: boolean;
    templates: Template[];
}

const INITIAL_GROUPS: TemplateGroup[] = [
    {
        id: 'g_sales',
        name: '销售管理',
        templates: [
            { id: 't_sales_order', name: '标准销售订单', updated: '10分钟前', status: 'active' },
            { id: 't_quotation', name: '客户报价单', updated: '2天前', status: 'draft' },
        ],
    },
    {
        id: 'g_logistics',
        name: '仓储物流',
        isOpen: true,
        templates: [
            { id: 't_delivery', name: '出库确认单', updated: '刚刚', status: 'active' },
            { id: 't_shipping_label', name: '顺丰电子面单 (100×150)', updated: '1周前', status: 'active' },
            { id: 't_pick_list', name: '仓库拣货单', updated: '3天前', status: 'draft' },
        ],
    },
    {
        id: 'g_receipt',
        name: '小票收据',
        isOpen: true,
        templates: [
            { id: 't_receipt', name: '咖啡店收银小票 (80mm)', updated: '刚刚', status: 'active' },
        ],
    },
    {
        id: 'g_finance',
        name: '财务单据',
        templates: [
            { id: 't_invoice', name: '通用收款收据', updated: '1个月前', status: 'active' },
        ],
    },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface TemplateTreeProps {
    activeTemplateId: string;
    onSelectTemplate: (id: string) => void;
    user?: { id?: string | null; name?: string | null; email?: string | null; image?: string | null; createdAt?: string | Date | null } | null;
    onLogin?: () => void;
    onCycleTheme?: () => void;
    themeLabel?: string;
    ThemeIcon?: LucideIcon;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TemplateTree({ activeTemplateId, onSelectTemplate, user, onLogin, onCycleTheme, themeLabel, ThemeIcon }: TemplateTreeProps) {
    const [groups, setGroups] = useState<TemplateGroup[]>(INITIAL_GROUPS);
    const [searchQuery, setSearchQuery] = useState('');

    const toggleGroup = (groupId: string) => {
        setGroups(prev => prev.map(g =>
            g.id === groupId ? { ...g, isOpen: !g.isOpen } : g
        ));
    };

    const handleCreateTemplate = (e: React.MouseEvent, groupId: string) => {
        e.stopPropagation();
        const newTemplate: Template = {
            id: `t_new_${Date.now()}`,
            name: '未命名模版',
            updated: '刚刚',
            status: 'draft',
        };
        setGroups(prev => prev.map(g =>
            g.id === groupId
                ? { ...g, isOpen: true, templates: [...g.templates, newTemplate] }
                : g
        ));
        onSelectTemplate(newTemplate.id);
    };

    // 搜索过滤
    const filteredGroups = useMemo(() => {
        if (!searchQuery.trim()) return groups;
        return groups
            .map(g => ({
                ...g,
                isOpen: true,
                templates: g.templates.filter(t =>
                    t.name.toLowerCase().includes(searchQuery.toLowerCase())
                ),
            }))
            .filter(g => g.templates.length > 0);
    }, [groups, searchQuery]);

    return (
        <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700/60 flex flex-col shrink-0 z-20">

            {/* Logo */}
            <div className="h-14 border-b border-slate-100 dark:border-slate-700/60 flex items-center px-4 shrink-0">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-black text-lg tracking-tight">
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
                {filteredGroups.map(group => (
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
                            <button
                                onClick={(e) => handleCreateTemplate(e, group.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-all"
                                title="在此分组新建模版"
                            >
                                <Plus size={12} />
                            </button>
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
                                                <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{template.updated}</span>
                                            </div>
                                        </div>
                                        {template.status === 'draft' && (
                                            <div className="w-1.5 h-1.5 bg-orange-400 rounded-full shrink-0" title="草稿" />
                                        )}
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
                ))}

                {/* New group button */}
                <button className="w-full mt-4 flex items-center justify-center gap-2 py-2 border border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-500/10 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg text-xs font-bold transition-all">
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
                            <button className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 transition-colors">
                                <Settings size={14} />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-between p-1.5">
                        <button
                            onClick={onLogin}
                            className="flex items-center gap-2 px-3 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors flex-1 justify-center"
                        >
                            <LogIn size={14} /> 登录
                        </button>
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
                )}
            </div>
        </aside>
    );
}
