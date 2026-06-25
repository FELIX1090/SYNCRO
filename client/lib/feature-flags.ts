/**
 * Feature Flags Configuration
 * Centralized feature flag management for the application
 */

export interface FeatureFlags {
    paypalEnabled: boolean
    mockPaymentsEnabled: boolean
    stripeEnabled: boolean
}

/**
 * Get feature flags from environment variables
 */
export function getFeatureFlags(): FeatureFlags {
    return {
        // PayPal is enabled if credentials are configured
        paypalEnabled: !!(
            process.env.PAYPAL_CLIENT_ID &&
            process.env.PAYPAL_CLIENT_SECRET
        ),

        // Mock payments only enabled in development or if explicitly enabled
        mockPaymentsEnabled:
            process.env.NODE_ENV === 'development' ||
            process.env.ENABLE_MOCK_PAYMENTS === 'true',

        // Stripe is enabled if API key is configured
        stripeEnabled: !!process.env.STRIPE_SECRET_KEY,
    }
}

/**
 * Get available payment providers based on feature flags
 */
export function getAvailablePaymentProviders(): Array<'stripe' | 'paypal' | 'mock'> {
    const flags = getFeatureFlags()
    const providers: Array<'stripe' | 'paypal' | 'mock'> = []

    if (flags.stripeEnabled) {
        providers.push('stripe')
    }

    if (flags.paypalEnabled) {
        providers.push('paypal')
    }

    if (flags.mockPaymentsEnabled) {
        providers.push('mock')
    }

    return providers
}

/**
 * Check if a payment provider is enabled
 */
export function isPaymentProviderEnabled(provider: 'stripe' | 'paypal' | 'mock'): boolean {
    const flags = getFeatureFlags()

    switch (provider) {
        case 'stripe':
            return flags.stripeEnabled
        case 'paypal':
            return flags.paypalEnabled
        case 'mock':
            return flags.mockPaymentsEnabled
        default:
            return false
    }
}

/**
 * Get default payment provider
 */
export function getDefaultPaymentProvider(): 'stripe' | 'paypal' | 'mock' {
    const flags = getFeatureFlags()

    // Prefer Stripe, then PayPal, then mock
    if (flags.stripeEnabled) return 'stripe'
    if (flags.paypalEnabled) return 'paypal'
    if (flags.mockPaymentsEnabled) return 'mock'

    throw new Error('No payment provider is configured')
}

// ──────────────────────────────────────────────
// Privacy Feature Flags (SDK Helpers)
// ──────────────────────────────────────────────

export type PrivacyFlagName =
    | 'PRIVACY_STEALTH_ADDRESSES'
    | 'PRIVACY_ENCRYPT_ON_CHAIN'
    | 'PRIVACY_ZK_PROOFS'
    | 'PRIVACY_PAYMENT_CHANNELS'
    | 'PRIVACY_REMINDER_JITTER'
    | 'PRIVACY_AUDIT_COMMITMENTS'
    | 'PRIVACY_SETTLEMENT_BATCHING'

const PRIVACY_FLAG_DEFAULTS: Record<PrivacyFlagName, boolean> = {
    PRIVACY_STEALTH_ADDRESSES: false,
    PRIVACY_ENCRYPT_ON_CHAIN: false,
    PRIVACY_ZK_PROOFS: false,
    PRIVACY_PAYMENT_CHANNELS: false,
    PRIVACY_REMINDER_JITTER: false,
    PRIVACY_AUDIT_COMMITMENTS: false,
    PRIVACY_SETTLEMENT_BATCHING: false,
}

/**
 * SDK helper: Check if a privacy feature flag is enabled for a given user.
 * Fetches from /api/privacy/feature/:flag — or resolves to default if request fails.
 */
export async function isPrivacyFeatureEnabled(
    userId: string,
    flag: PrivacyFlagName
): Promise<boolean> {
    try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
        const res = await fetch(`${apiBase}/api/privacy/feature/${flag}`, {
            credentials: 'include',
            cache: 'no-store',
        })
        if (!res.ok) return PRIVACY_FLAG_DEFAULTS[flag]
        const json = await res.json()
        return !!json.enabled
    } catch {
        return PRIVACY_FLAG_DEFAULTS[flag]
    }
}

/**
 * Fetch all user privacy preferences from the API.
 */
export async function getPrivacyPreferences(): Promise<Record<string, boolean> | null> {
    try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
        const res = await fetch(`${apiBase}/api/privacy/preferences`, {
            credentials: 'include',
            cache: 'no-store',
        })
        if (!res.ok) return null
        const json = await res.json()
        return json.data ?? null
    } catch {
        return null
    }
}

/**
 * Returns true if the user's privacy mode is currently enabled.
 * Relies on cached preferences; falls back to false on failure.
 */
export async function isPrivacyModeEnabled(): Promise<boolean> {
    const prefs = await getPrivacyPreferences()
    return prefs?.privacy_mode === true
}

