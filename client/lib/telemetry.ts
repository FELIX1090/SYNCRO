import * as Sentry from "@sentry/nextjs"

export type ErrorCategory = "auth" | "database" | "network" | "validation" | "unknown"

export interface TelemetryContext {
  query?: string
  component?: string
  userId?: string
  extra?: Record<string, any>
}

/**
 * Log an error to Sentry and console with structured context
 */
export function trackError(
  error: any,
  category: ErrorCategory = "unknown",
  context: TelemetryContext = {}
) {
  const { query, component, userId, extra } = context

  // Categorize error if not already specified
  let finalCategory = category
  if (error?.code) {
    // Handle Supabase error codes
    if (error.code.startsWith("PGRST")) {
      finalCategory = "database"
    } else if (error.code.startsWith("auth/")) {
      finalCategory = "auth"
    }
  }

  // Log to console for local development
  console.error(`[Telemetry] [${finalCategory}] Error in ${component || "unknown"}:`, {
    message: error?.message || error,
    code: error?.code,
    query,
    userId,
    ...extra,
  })

  // Send to Sentry
  Sentry.withScope((scope) => {
    scope.setTag("category", finalCategory)
    if (query) scope.setTag("query", query)
    if (component) scope.setTag("component", component)
    if (userId) scope.setUser({ id: userId })
    
    if (extra) {
      scope.setExtras(extra)
    }

    Sentry.captureException(error)
  })
}

/**
 * Log a warning message with context
 */
export function trackWarning(
  message: string,
  context: TelemetryContext = {}
) {
  const { query, component, userId, extra } = context

  console.warn(`[Telemetry] Warning in ${component || "unknown"}: ${message}`, context)

  Sentry.withScope((scope) => {
    if (query) scope.setTag("query", query)
    if (component) scope.setTag("component", component)
    if (userId) scope.setUser({ id: userId })
    
    if (extra) {
      scope.setExtras(extra)
    }

    Sentry.captureMessage(message, "warning")
  })
}
