import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'

export type AIProviderType = 'google' | 'openai' | 'anthropic'
export type OpenAICompatMode = 'chat' | 'responses'

export type AIEnvBindings = {
  AI_PROVIDER_TYPE?: string
  AI_PROVIDER?: string
  AI_API_KEY?: string
  AI_BASE_URL?: string
  AI_MODEL?: string
  AI_API_MODE?: string
  GOOGLE_GENERATIVE_AI_API_KEY?: string
}

export type AIRuntimeConfig = {
  providerType?: string
  apiKey?: string
  baseURL?: string
  model?: string
  apiMode?: string
}

const normalizeProviderType = (rawProviderType?: string): AIProviderType => {
  const normalized = (rawProviderType || 'google').toLowerCase()
  if (normalized === 'google' || normalized === 'openai' || normalized === 'anthropic') {
    return normalized
  }
  throw new Error(`不支持的 AI provider: ${normalized}`)
}

export const resolveModelFromConfig = (config: AIRuntimeConfig) => {
  const providerType = normalizeProviderType(config.providerType)
  const model = config.model || (providerType === 'google' ? 'gemini-flash-latest' : 'gpt-4o-mini')
  const apiMode = (config.apiMode || 'chat').toLowerCase() as OpenAICompatMode

  if (providerType === 'google') {
    const apiKey = config.apiKey
    if (!apiKey) {
      throw new Error('未配置 AI_API_KEY（google）')
    }
    const google = createGoogleGenerativeAI({ apiKey })
    return {
      providerType,
      model,
      apiMode: 'chat' as OpenAICompatMode,
      languageModel: google(model),
    }
  }

  if (providerType === 'anthropic') {
    throw new Error('当前构建未启用 anthropic provider。请先安装并接入 @ai-sdk/anthropic，或改用 AI_PROVIDER_TYPE=openai/google')
  }

  if (!config.apiKey) {
    throw new Error('未配置 AI_API_KEY（openai-compatible）')
  }
  if (!config.baseURL) {
    throw new Error('未配置 AI_BASE_URL（openai-compatible）')
  }

  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    name: 'openai-compatible',
  })

  return {
    providerType,
    model,
    apiMode,
    languageModel: apiMode === 'responses' ? openai(model) : openai.chat(model),
  }
}

export const resolveModelFromEnv = (env: AIEnvBindings) => {
  const providerType = normalizeProviderType(env.AI_PROVIDER_TYPE || env.AI_PROVIDER || 'google')

  return resolveModelFromConfig({
    providerType,
    apiKey: providerType === 'google'
      ? (env.AI_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY)
      : env.AI_API_KEY,
    baseURL: env.AI_BASE_URL,
    model: env.AI_MODEL,
    apiMode: env.AI_API_MODE,
  })
}
