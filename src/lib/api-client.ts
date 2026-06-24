// ─── Types matching D1 schema ────────────────────────────────────────────────

import type { TemplateBundleFiles, TemplateStatus } from './template-bundle'

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
    status: TemplateStatus | 'active'
    updated_at: number
}

export interface TemplateDetail extends Template {
    content: string
    mock_data: Record<string, unknown>
    files_json?: TemplateBundleFiles
    user_id: string
}

export interface FolderWithTemplates extends Folder {
    templates: Template[]
}

export interface AiThreadMessage {
    id: string
    role: string
    parts: unknown[]
    created_at: number
}

export interface AiThreadDetail {
    thread: {
        id: string
        title: string
        template_id: string
        created_at: number
        updated_at: number
    }
    messages: AiThreadMessage[]
}

export interface TemplateVersion {
    id: string
    source: 'ai' | 'manual' | 'rollback' | string
    summary: string
    created_at: number
}

export type RenderFormat = 'png' | 'pdf'

export interface RenderValidateResult {
    ok: true
    manifest: unknown
    compile_checked: boolean
    artifact_returned: false
}

export interface RenderCompileResult {
    ok: true
    manifest: unknown
    artifact_id: string
    artifact_format: RenderFormat
    artifact_name: string
    artifact_mime_type: string
    artifact_path: string
    artifact_bytes: number
    artifact_sha256: string
    artifact_base64?: string
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

    /** 更新分组 */
    async updateFolder(id: string, data: Partial<{ name: string }>): Promise<void> {
        await request<{ success: boolean }>(`/api/folders/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        })
    },

    /** 删除分组 */
    async deleteFolder(id: string): Promise<void> {
        await request<{ success: boolean }>(`/api/folders/${id}`, {
            method: 'DELETE',
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
        data: Partial<{
            name: string
            content: string
            mock_data: Record<string, unknown>
            files_json: TemplateBundleFiles
            status: string
            update_source: 'ai' | 'manual' | 'rollback'
            update_summary: string
        }>
    ): Promise<void> {
        await request<{ success: boolean }>(`/api/templates/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        })
    },

    /** 删除模版 */
    async deleteTemplate(id: string): Promise<void> {
        await request<{ success: boolean }>(`/api/templates/${id}`, {
            method: 'DELETE',
        })
    },

    /** 获取模板维度 AI 会话 */
    async getTemplateAiThread(templateId: string): Promise<AiThreadDetail> {
        return request<AiThreadDetail>(`/api/templates/${templateId}/ai-thread`)
    },

    /** 覆盖保存模板 AI 会话消息 */
    async putTemplateAiThreadMessages(
        templateId: string,
        messages: Array<{ role: string; parts: unknown[] }>
    ): Promise<void> {
        await request<{ success: boolean }>(`/api/templates/${templateId}/ai-thread/messages`, {
            method: 'PUT',
            body: JSON.stringify({ messages }),
        })
    },

    /** 获取模板版本列表 */
    async getTemplateVersions(templateId: string, limit = 20): Promise<TemplateVersion[]> {
        const data = await request<{ versions: TemplateVersion[] }>(`/api/templates/${templateId}/versions?limit=${limit}`)
        return data.versions
    },

    /** 回滚到指定版本 */
    async restoreTemplateVersion(
        templateId: string,
        versionId: string
    ): Promise<{ success: boolean; content: string; mock_data: Record<string, unknown>; files_json?: TemplateBundleFiles }> {
        return request<{ success: boolean; content: string; mock_data: Record<string, unknown>; files_json?: TemplateBundleFiles }>(
            `/api/templates/${templateId}/versions/${versionId}/restore`,
            { method: 'POST' },
        )
    },

    /** 通过 typst-json-render 校验 TemplateBundle */
    async validateTemplateBundle(
        files: TemplateBundleFiles,
        options: { data_json?: string; format?: RenderFormat } = {},
    ): Promise<RenderValidateResult> {
        return request<RenderValidateResult>('/api/render/validate', {
            method: 'POST',
            body: JSON.stringify({ files, ...options }),
        })
    },

    /** 通过 typst-json-render 编译 TemplateBundle，默认返回 PNG base64 预览 */
    async compileTemplateBundle(
        files: TemplateBundleFiles,
        options: { data_json?: string; format?: RenderFormat; include_artifact_base64?: boolean } = {},
    ): Promise<RenderCompileResult> {
        return request<RenderCompileResult>('/api/render/compile', {
            method: 'POST',
            body: JSON.stringify({ files, include_artifact_base64: true, ...options }),
        })
    },
}
