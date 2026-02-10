import { useState, useRef, useEffect } from 'react'
import { LogOut, User, Mail, Calendar, ArrowLeft } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

interface UserMenuProps {
    user: {
        id?: string | null
        name?: string | null
        email?: string | null
        image?: string | null
        createdAt?: string | Date | null
    }
    popupDirection?: 'up' | 'down'
}

export function UserMenu({ user, popupDirection = 'down' }: UserMenuProps) {
    const [open, setOpen] = useState(false)
    const [showProfile, setShowProfile] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    // 点击外部关闭菜单
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpen(false)
                setShowProfile(false)
            }
        }
        if (open) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [open])

    const handleSignOut = async () => {
        await authClient.signOut()
        window.location.reload()
    }

    const initials = user.name
        ?.split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || '?'

    const createdDate = user.createdAt
        ? new Date(user.createdAt).toLocaleDateString('zh-CN', {
            year: 'numeric', month: 'long', day: 'numeric'
        })
        : null

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => { setOpen(!open); setShowProfile(false) }}
                className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
                <Avatar size="sm">
                    {user.image && <AvatarImage src={user.image} alt={user.name || ''} />}
                    <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
            </button>

            {open && !showProfile && (
                <div className={`absolute z-50 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1 animate-in fade-in-0 zoom-in-95 ${popupDirection === 'up' ? 'left-0 bottom-full mb-2' : 'right-0 top-full mt-2'}`}>
                    {/* 用户信息 */}
                    <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-2.5">
                            <Avatar>
                                {user.image && <AvatarImage src={user.image} alt={user.name || ''} />}
                                <AvatarFallback>{initials}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col min-w-0">
                                <span className="text-sm font-medium truncate">{user.name || '用户'}</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                    {user.email || ''}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* 菜单项 */}
                    <div className="py-1">
                        <button
                            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            onClick={() => setShowProfile(true)}
                        >
                            <User className="h-4 w-4" />
                            账户信息
                        </button>
                        <button
                            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            onClick={handleSignOut}
                        >
                            <LogOut className="h-4 w-4" />
                            退出登录
                        </button>
                    </div>
                </div>
            )}

            {/* 账户信息面板 */}
            {open && showProfile && (
                <div className={`absolute z-50 w-72 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg animate-in fade-in-0 zoom-in-95 ${popupDirection === 'up' ? 'left-0 bottom-full mb-2' : 'right-0 top-full mt-2'}`}>
                    {/* 头部 */}
                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 dark:border-slate-700">
                        <button
                            onClick={() => setShowProfile(false)}
                            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                        <span className="text-sm font-medium">账户信息</span>
                    </div>

                    {/* 头像区域 */}
                    <div className="flex flex-col items-center py-4 border-b border-slate-100 dark:border-slate-700">
                        <Avatar size="lg">
                            {user.image && <AvatarImage src={user.image} alt={user.name || ''} />}
                            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                        </Avatar>
                        <span className="mt-2 text-base font-semibold">{user.name || '用户'}</span>
                    </div>

                    {/* 详细信息 */}
                    <div className="px-3 py-2.5 space-y-2.5">
                        <div className="flex items-center gap-2.5 text-sm">
                            <Mail className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            <span className="text-slate-600 dark:text-slate-300 truncate">
                                {user.email || '未设置邮箱'}
                            </span>
                        </div>
                        {createdDate && (
                            <div className="flex items-center gap-2.5 text-sm">
                                <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                <span className="text-slate-600 dark:text-slate-300">
                                    {createdDate} 加入
                                </span>
                            </div>
                        )}
                        {user.id && (
                            <div className="flex items-center gap-2.5 text-sm">
                                <User className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                <span className="text-slate-500 dark:text-slate-400 font-mono text-xs truncate">
                                    ID: {user.id}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
