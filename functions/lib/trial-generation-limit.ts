import type { AppDatabase } from './db-types'

export interface TrialGenerationLimitEnv {
  TRIAL_LIMIT_ENABLED?: string
  TRIAL_SUCCESSFUL_GENERATIONS_PER_24H?: string
  TRIAL_SUCCESSFUL_GENERATION_DEDUP_MINUTES?: string
  TRIAL_LIMIT_EXEMPT_EMAILS?: string
}

interface EvaluateTrialGenerationLimitParams {
  db: AppDatabase
  env: TrialGenerationLimitEnv
  templateId: string
  userEmail?: string | null
  userId: string
}

interface RecordSuccessfulGenerationParams {
  db: AppDatabase
  templateId: string
  userId: string
}

type TrialGenerationLimitDecision = {
  allowed: boolean
  enabled: boolean
  errorMessage?: string
  shouldRecord: boolean
}

const DEFAULT_SUCCESSFUL_GENERATIONS_PER_24H = 5
const DEFAULT_DEDUP_MINUTES = 30
const MAX_SUCCESSFUL_GENERATIONS_PER_24H = 1000
const MAX_DEDUP_MINUTES = 24 * 60

const isTruthy = (value?: string) => {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

const parsePositiveInt = (value: string | undefined, fallback: number, max: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(max, Math.floor(parsed)))
}

const parseLowercaseList = (value?: string) => {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

export async function evaluateTrialGenerationLimit({
  db,
  env,
  templateId,
  userEmail,
  userId,
}: EvaluateTrialGenerationLimitParams): Promise<TrialGenerationLimitDecision> {
  if (!isTruthy(env.TRIAL_LIMIT_ENABLED)) {
    return { allowed: true, enabled: false, shouldRecord: false }
  }

  const exemptEmails = parseLowercaseList(env.TRIAL_LIMIT_EXEMPT_EMAILS)
  const normalizedEmail = String(userEmail || '').trim().toLowerCase()
  if (normalizedEmail && exemptEmails.includes(normalizedEmail)) {
    return { allowed: true, enabled: true, shouldRecord: false }
  }

  const now = Math.floor(Date.now() / 1000)
  const successfulGenerationsPer24h = parsePositiveInt(
    env.TRIAL_SUCCESSFUL_GENERATIONS_PER_24H,
    DEFAULT_SUCCESSFUL_GENERATIONS_PER_24H,
    MAX_SUCCESSFUL_GENERATIONS_PER_24H,
  )
  const dedupMinutes = parsePositiveInt(
    env.TRIAL_SUCCESSFUL_GENERATION_DEDUP_MINUTES,
    DEFAULT_DEDUP_MINUTES,
    MAX_DEDUP_MINUTES,
  )
  const dedupSince = now - (dedupMinutes * 60)

  const recentEvent = await db
    .prepare('SELECT id FROM trial_generation_events WHERE user_id = ? AND template_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1')
    .bind(userId, templateId, dedupSince)
    .first<{ id: string }>()

  if (recentEvent) {
    return { allowed: true, enabled: true, shouldRecord: false }
  }

  const usageSince = now - (24 * 60 * 60)
  const usageRow = await db
    .prepare('SELECT COUNT(1) as cnt FROM trial_generation_events WHERE user_id = ? AND created_at >= ?')
    .bind(userId, usageSince)
    .first<{ cnt: number | string }>()

  const usedInLast24h = Number(usageRow?.cnt || 0)
  if (usedInLast24h >= successfulGenerationsPer24h) {
    return {
      allowed: false,
      enabled: true,
      errorMessage: `试用额度已用完：过去 24 小时你已成功生成 ${usedInLast24h}/${successfulGenerationsPer24h} 个成品模板，请稍后再试。`,
      shouldRecord: false,
    }
  }

  return { allowed: true, enabled: true, shouldRecord: true }
}

export async function recordSuccessfulGeneration({
  db,
  templateId,
  userId,
}: RecordSuccessfulGenerationParams) {
  await db
    .prepare('INSERT INTO trial_generation_events (id, user_id, template_id) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), userId, templateId)
    .run()
}
