import { betterAuth } from 'better-auth'
import { Kysely } from 'kysely'
import { D1Dialect } from 'kysely-d1'

interface AuthEnv {
    deepprint_auth: D1Database
    GITHUB_CLIENT_ID: string
    GITHUB_CLIENT_SECRET: string
    BETTER_AUTH_SECRET: string
    BETTER_AUTH_URL?: string
}

export function createAuth(env: AuthEnv, requestURL?: string) {
    const db = new Kysely({
        dialect: new D1Dialect({ database: env.deepprint_auth }),
    })

    // 从请求 URL 或环境变量动态获取 baseURL
    const baseURL = env.BETTER_AUTH_URL
        || (requestURL ? new URL(requestURL).origin : undefined)

    return betterAuth({
        database: {
            db,
            type: 'sqlite',
        },
        secret: env.BETTER_AUTH_SECRET,
        ...(baseURL ? { baseURL } : {}),
        basePath: '/api/auth',
        socialProviders: {
            github: {
                clientId: env.GITHUB_CLIENT_ID,
                clientSecret: env.GITHUB_CLIENT_SECRET,
            },
        },
        trustedOrigins: ['*'], // better-auth 会校验 CSRF，这里允许所有 origin
    })
}
