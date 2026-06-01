/**
 * CSP Violations API Routes
 * 
 * Provides endpoints for managing Content Security Policy violations:
 * - POST /api/csp-violations - Persist a new CSP violation
 * - GET /api/csp-violations/stats - Get aggregated violation statistics
 * - POST /api/csp-violations/refresh-stats - Refresh the materialized view
 * - GET /api/csp-violations/user/:userId - Get violations for a specific user (admin only)
 */

const express = require('express');
const { z } = require('zod');
const {
    persistCspViolation,
    getCspViolationStats,
    refreshCspViolationStats,
    getUserCspViolations,
    reportToSentry,
} = require('../src/services/csp-monitoring');
const { authenticateToken } = require('../src/middleware/auth');
const { requireAdmin } = require('../src/middleware/admin');
const logger = require('../src/config/logger').default;

const router = express.Router();

/**
 * Validation schema for CSP violation report
 */
const CspViolationSchema = z.object({
    report: z.object({
        'document-uri': z.string().url(),
        'violated-directive': z.string(),
        'blocked-uri': z.string().optional(),
        'source-file': z.string().optional(),
        'line-number': z.number().optional(),
        'column-number': z.number().optional(),
        'disposition': z.enum(['enforce', 'report']).optional(),
        'status-code': z.number().optional(),
        'script-sample': z.string().optional(),
    }),
    context: z.object({
        userAgent: z.string().optional(),
        ipAddress: z.string().optional(),
        referer: z.string().optional(),
        userId: z.string().uuid().optional(),
    }),
});

/**
 * POST /api/csp-violations
 * Persist a CSP violation report
 * 
 * This endpoint is called by the Next.js CSP report handler
 * to persist violations to the database and send to Sentry.
 */
router.post('/', async (req, res) => {
    try {
        // Verify this is an internal request from our Next.js app
        const internalRequest = req.headers['x-internal-request'] === 'true';
        if (!internalRequest) {
            return res.status(403).json({
                success: false,
                error: 'This endpoint is for internal use only'
            });
        }

        // Validate request body
        const result = CspViolationSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: 'Invalid request format',
                details: result.error.format(),
            });
        }

        const { report, context } = result.data;

        // Persist to database
        const persistResult = await persistCspViolation(report, context);

        // Send to Sentry (non-blocking)
        reportToSentry(report, context);

        if (!persistResult.success) {
            logger.error('Failed to persist CSP violation', {
                error: persistResult.error,
                report,
            });
            return res.status(500).json({
                success: false,
                error: 'Failed to persist violation',
            });
        }

        return res.json({ success: true });
    } catch (error) {
        logger.error('Exception in CSP violation endpoint', { error });
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});

/**
 * GET /api/csp-violations/stats
 * Get aggregated CSP violation statistics
 * 
 * Query parameters:
 * - limit: Maximum number of results (default: 50)
 * - minOccurrences: Minimum occurrence count to include (default: 1)
 * - directive: Filter by specific directive (optional)
 * 
 * Requires admin authentication
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const minOccurrences = parseInt(req.query.minOccurrences) || 1;
        const directive = req.query.directive;

        const stats = await getCspViolationStats({
            limit,
            minOccurrences,
            directive,
        });

        return res.json({
            success: true,
            data: stats,
            count: stats.length,
        });
    } catch (error) {
        logger.error('Exception in CSP stats endpoint', { error });
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch statistics',
        });
    }
});

/**
 * POST /api/csp-violations/refresh-stats
 * Refresh the materialized view for CSP violation statistics
 * 
 * This should be called periodically (e.g., via cron job every 5 minutes)
 * to update the aggregated statistics.
 * 
 * Requires admin authentication
 */
router.post('/refresh-stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const success = await refreshCspViolationStats();

        if (!success) {
            return res.status(500).json({
                success: false,
                error: 'Failed to refresh statistics',
            });
        }

        return res.json({
            success: true,
            message: 'Statistics refreshed successfully',
        });
    } catch (error) {
        logger.error('Exception in CSP refresh stats endpoint', { error });
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});

/**
 * GET /api/csp-violations/user/:userId
 * Get CSP violations for a specific user
 * 
 * Query parameters:
 * - limit: Maximum number of results (default: 50)
 * 
 * Requires admin authentication
 */
router.get('/user/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(userId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID format',
            });
        }

        const violations = await getUserCspViolations(userId, limit);

        return res.json({
            success: true,
            data: violations,
            count: violations.length,
        });
    } catch (error) {
        logger.error('Exception in user CSP violations endpoint', { error });
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch user violations',
        });
    }
});

module.exports = router;
