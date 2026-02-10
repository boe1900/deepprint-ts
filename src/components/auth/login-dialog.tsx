import { useState } from 'react'
import { Github, Loader2 } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface LoginDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleGitHubLogin = async () => {
        setIsLoading(true)
        setError(null)
        try {
            await authClient.signIn.social({
                provider: 'github',
                callbackURL: '/',
            })
        } catch (err) {
            setError(err instanceof Error ? err.message : '登录失败，请重试')
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle className="text-center text-xl">
                        登录 DeepPrint
                    </DialogTitle>
                    <DialogDescription className="text-center">
                        使用 GitHub 账号登录以保存你的项目
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-4">
                    {error && (
                        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-600 dark:text-red-400">
                            {error}
                        </div>
                    )}

                    <Button
                        onClick={handleGitHubLogin}
                        disabled={isLoading}
                        className="w-full h-11 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white font-medium rounded-lg transition-all"
                    >
                        {isLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Github className="mr-2 h-4 w-4" />
                        )}
                        {isLoading ? '正在跳转...' : '使用 GitHub 登录'}
                    </Button>
                </div>

                <p className="text-center text-xs text-slate-400 dark:text-slate-500">
                    登录即表示你同意我们的服务条款和隐私政策
                </p>
            </DialogContent>
        </Dialog>
    )
}
