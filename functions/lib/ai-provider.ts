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

export const resolveModelFromEnv = (env: AIEnvBindings) => {
  const providerType = (env.AI_PROVIDER_TYPE || env.AI_PROVIDER || 'google').toLowerCase() as AIProviderType
  const model = env.AI_MODEL || (providerType === 'google' ? 'gemini-flash-latest' : 'gpt-4o-mini')
  const apiMode = (env.AI_API_MODE || 'chat').toLowerCase() as OpenAICompatMode

  if (providerType === 'google') {
    const apiKey = env.AI_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY
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

  if (!env.AI_API_KEY) {
    throw new Error('未配置 AI_API_KEY（openai-compatible）')
  }
  if (!env.AI_BASE_URL) {
    throw new Error('未配置 AI_BASE_URL（openai-compatible）')
  }

  const openai = createOpenAI({
    apiKey: env.AI_API_KEY,
    baseURL: env.AI_BASE_URL,
    name: 'openai-compatible',
  })

  return {
    providerType,
    model,
    apiMode,
    languageModel: apiMode === 'responses' ? openai(model) : openai.chat(model),
  }
}
