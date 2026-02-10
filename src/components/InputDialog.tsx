import { useState, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface InputDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description?: string
    placeholder?: string
    defaultValue?: string
    confirmLabel?: string
    loadingLabel?: string
    isLoading?: boolean
    onConfirm: (value: string) => void
}

export function InputDialog({
    open,
    onOpenChange,
    title,
    description,
    placeholder = '请输入名称...',
    defaultValue = '',
    confirmLabel = '创建',
    loadingLabel,
    isLoading = false,
    onConfirm,
}: InputDialogProps) {
    const [value, setValue] = useState(defaultValue)
    const inputRef = useRef<HTMLInputElement>(null)

    // Reset value when dialog opens
    useEffect(() => {
        if (open) {
            setValue(defaultValue)
            // Focus input after animation
            setTimeout(() => inputRef.current?.focus(), 100)
        }
    }, [open, defaultValue])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (value.trim() && !isLoading) {
            onConfirm(value.trim())
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[400px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle className="text-center text-xl">
                            {title}
                        </DialogTitle>
                        {description && (
                            <DialogDescription className="text-center">
                                {description}
                            </DialogDescription>
                        )}
                    </DialogHeader>

                    <div className="py-5">
                        <input
                            ref={inputRef}
                            type="text"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder={placeholder}
                            disabled={isLoading}
                            className="w-full h-11 px-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 disabled:opacity-50"
                            autoComplete="off"
                        />
                    </div>

                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isLoading}
                            className="flex-1"
                        >
                            取消
                        </Button>
                        <Button
                            type="submit"
                            disabled={!value.trim() || isLoading}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {loadingLabel ?? `${confirmLabel}中...`}
                                </>
                            ) : (
                                confirmLabel
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
