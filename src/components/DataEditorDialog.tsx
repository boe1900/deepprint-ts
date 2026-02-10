import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Database, AlertCircle, Save } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';

interface DataEditorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    data: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => void;
    resolvedTheme: string;
}

export default function DataEditorDialog({
    open,
    onOpenChange,
    data,
    onSave,
    resolvedTheme,
}: DataEditorDialogProps) {
    const [dataInput, setDataInput] = useState('');
    const [dataError, setDataError] = useState<string | null>(null);

    // Sync when dialog opens
    useEffect(() => {
        if (open) {
            setDataInput(JSON.stringify(data, null, 2));
            setDataError(null);
        }
    }, [open, data]);

    const handleChange = (value: string | undefined) => {
        const v = value || '';
        setDataInput(v);
        try {
            JSON.parse(v);
            setDataError(null);
        } catch {
            setDataError('JSON 格式错误');
        }
    };

    const handleSave = () => {
        try {
            const parsed = JSON.parse(dataInput);
            onSave(parsed);
            onOpenChange(false);
        } catch {
            setDataError('JSON 格式错误，无法保存');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden" showCloseButton>
                <DialogHeader className="px-5 pt-5 pb-3">
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Database size={16} className="text-green-600 dark:text-green-400" />
                        编辑测试数据 (JSON)
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                        JSON 数据将通过 <code className="bg-muted px-1 rounded text-[11px]">data</code> 变量注入到模板
                    </p>
                </DialogHeader>

                {/* Editor */}
                <div className="h-[380px] border-t border-b border-border">
                    <Editor
                        height="100%"
                        defaultLanguage="json"
                        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                        value={dataInput}
                        onChange={handleChange}
                        options={{
                            fontSize: 13,
                            fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
                            minimap: { enabled: false },
                            lineNumbers: 'on',
                            wordWrap: 'on',
                            padding: { top: 12 },
                            scrollBeyondLastLine: false,
                        }}
                    />
                </div>

                <DialogFooter className="px-5 py-3 flex items-center">
                    {dataError && (
                        <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1 mr-auto">
                            <AlertCircle size={12} />
                            {dataError}
                        </p>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={!!dataError}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-2"
                    >
                        <Save size={14} /> 保存并刷新预览
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
