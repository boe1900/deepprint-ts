export type LocalAIProviderType = 'google' | 'openai'
export type LocalAIApiMode = 'chat' | 'responses'

export interface LocalAIConfig {
    providerType: LocalAIProviderType
    apiKey: string
    model: string
    baseURL: string
    apiMode: LocalAIApiMode
}

export interface RequestScopedAIConfig {
    provider_type: LocalAIProviderType
    api_key: string
    model: string
    base_url?: string
    api_mode?: LocalAIApiMode
}

const STORAGE_KEY = 'deepprint.local-ai-config'
const ONBOARDING_STORAGE_KEY = 'deepprint.local-ai-onboarding-seen'

const DEFAULT_CONFIGS: Record<LocalAIProviderType, LocalAIConfig> = {
    google: {
        providerType: 'google',
        apiKey: '',
        model: 'gemini-flash-latest',
        baseURL: '',
        apiMode: 'chat',
    },
    openai: {
        providerType: 'openai',
        apiKey: '',
        model: 'gpt-4o-mini',
        baseURL: 'https://api.openai.com/v1',
        apiMode: 'chat',
    },
}

const isProviderType = (value: unknown): value is LocalAIProviderType => {
    return value === 'google' || value === 'openai'
}

const isApiMode = (value: unknown): value is LocalAIApiMode => {
    return value === 'chat' || value === 'responses'
}

const normalizeString = (value: unknown) => {
    return typeof value === 'string' ? value.trim() : ''
}

const normalizeBaseURL = (value: string) => {
    return value.replace(/\/+$/, '')
}

export const createDefaultLocalAIConfig = (
    providerType: LocalAIProviderType = 'google'
): LocalAIConfig => {
    return { ...DEFAULT_CONFIGS[providerType] }
}

export const normalizeLocalAIConfig = (
    raw?: Partial<LocalAIConfig> | null
): LocalAIConfig => {
    const providerType = isProviderType(raw?.providerType) ? raw.providerType : 'google'
    const defaults = DEFAULT_CONFIGS[providerType]
    const model = normalizeString(raw?.model) || defaults.model
    const apiKey = normalizeString(raw?.apiKey)
    const apiMode = providerType === 'openai' && isApiMode(raw?.apiMode)
        ? raw.apiMode
        : defaults.apiMode
    const baseURL = providerType === 'openai'
        ? normalizeBaseURL(normalizeString(raw?.baseURL) || defaults.baseURL)
        : ''

    return {
        providerType,
        apiKey,
        model,
        baseURL,
        apiMode,
    }
}

export const isLocalAIConfigReady = (
    config?: LocalAIConfig | null
): config is LocalAIConfig => {
    if (!config) return false
    if (!config.apiKey.trim()) return false
    if (!config.model.trim()) return false
    if (config.providerType === 'openai' && !config.baseURL.trim()) return false
    return true
}

export const loadLocalAIConfig = (): LocalAIConfig | null => {
    if (typeof window === 'undefined') return null

    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as Partial<LocalAIConfig>
        const normalized = normalizeLocalAIConfig(parsed)
        return isLocalAIConfigReady(normalized) ? normalized : null
    } catch {
        return null
    }
}

export const saveLocalAIConfig = (config: LocalAIConfig): LocalAIConfig => {
    const normalized = normalizeLocalAIConfig(config)
    if (!isLocalAIConfigReady(normalized)) {
        throw new Error('AI 配置不完整')
    }
    if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    }
    return normalized
}

export const clearLocalAIConfig = () => {
    if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY)
    }
}

export const hasSeenLocalAIOnboarding = () => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1'
}

export const markLocalAIOnboardingSeen = () => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(ONBOARDING_STORAGE_KEY, '1')
    }
}

export const resetLocalAIOnboarding = () => {
    if (typeof window !== 'undefined') {
        localStorage.removeItem(ONBOARDING_STORAGE_KEY)
    }
}

export const getLocalAIProviderLabel = (
    providerType?: LocalAIProviderType | null
) => {
    return providerType === 'openai' ? 'OpenAI-compatible' : 'Gemini'
}

export const toRequestScopedAIConfig = (
    config: LocalAIConfig
): RequestScopedAIConfig => {
    return {
        provider_type: config.providerType,
        api_key: config.apiKey,
        model: config.model,
        ...(config.providerType === 'openai'
            ? {
                base_url: config.baseURL,
                api_mode: config.apiMode,
            }
            : {}),
    }
}
