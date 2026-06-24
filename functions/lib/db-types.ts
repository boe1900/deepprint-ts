export type DbStatement<T = unknown> = {
  bind: (...values: unknown[]) => DbStatement<T>
  first: <R = T>() => Promise<R | null>
  all: <R = T>() => Promise<{ results: R[] }>
  run: () => Promise<unknown>
}

export type AppDatabase = {
  prepare: (sql: string) => DbStatement
}
