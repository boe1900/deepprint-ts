// ─── Types matching D1 schema ────────────────────────────────────────────────

export interface Folder {
    id: string
    name: string
    sort_order: number
    created_at: number
}

export interface Template {
    id: string
    folder_id: string
    name: string
    status: 'draft' | 'active'
    updated_at: number
}

export interface TemplateDetail extends Template {
    content: string
    mock_data: Record<string, unknown>
    user_id: string
}

export interface FolderWithTemplates extends Folder {
    templates: Template[]
}

// ─── API Error ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
        super(message)
        this.name = 'ApiError'
        this.status = status
    }
}

// ─── Fetch helper ────────────────────────────────────────────────────────────

async function request<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new ApiError(res.status, (body as any).error || res.statusText)
    }

    return res.json() as Promise<T>
}

// ─── API Client ──────────────────────────────────────────────────────────────

export const api = {
    /** 获取所有分组及其模版列表 */
    async getFolders(): Promise<FolderWithTemplates[]> {
        const data = await request<{ folders: FolderWithTemplates[] }>('/api/folders')
        return data.folders
    },

    /** 创建新分组 */
    async createFolder(name: string): Promise<Folder> {
        return request<Folder>('/api/folders', {
            method: 'POST',
            body: JSON.stringify({ name }),
        })
    },

    /** 在指定分组下创建新模版 */
    async createTemplate(folderId: string, name: string): Promise<Template> {
        return request<Template>('/api/templates', {
            method: 'POST',
            body: JSON.stringify({ folder_id: folderId, name }),
        })
    },

    /** 获取单个模版详情 */
    async getTemplate(id: string): Promise<TemplateDetail> {
        return request<TemplateDetail>(`/api/templates/${id}`)
    },

    /** 更新模版 */
    async updateTemplate(
        id: string,
        data: Partial<{ name: string; content: string; mock_data: Record<string, unknown>; status: string }>
    ): Promise<void> {
        await request<{ success: boolean }>(`/api/templates/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        })
    },
}
