import { Router, Response } from 'express';
import { supabase } from '../config/database';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { privacyService } from '../services/privacy-service';
import logger from '../config/logger';
import { PRIVACY_FLAGS_CONFIG, PrivacyFlag } from '../../../shared/src/blockchain-flags';

const router: Router = Router();

// All privacy routes require authentication
router.use(authenticate);

/**
 * GET /api/privacy/preferences
 * Get the current user's privacy preferences
 */
router.get('/preferences', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { data, error } = await supabase
      .from('privacy_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    // If no preferences exist, return defaults
    if (!data) {
      const defaults = {
        user_id: userId,
        privacy_mode: false,
        stealth_addresses: false,
        encrypt_on_chain: false,
        payment_channels: false,
        reminder_jitter: false,
      };
      res.json({ success: true, data: defaults });
      return;
    }

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error fetching privacy preferences:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch privacy preferences',
    });
  }
});

/**
 * POST /api/privacy/preferences
 * Update the current user's privacy preferences
 */
router.post('/preferences', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const {
      privacy_mode,
      stealth_addresses,
      encrypt_on_chain,
      payment_channels,
      reminder_jitter,
    } = req.body;

    const updates: Record<string, unknown> = { user_id: userId };
    if (typeof privacy_mode === 'boolean') updates.privacy_mode = privacy_mode;
    if (typeof stealth_addresses === 'boolean') updates.stealth_addresses = stealth_addresses;
    if (typeof encrypt_on_chain === 'boolean') updates.encrypt_on_chain = encrypt_on_chain;
    if (typeof payment_channels === 'boolean') updates.payment_channels = payment_channels;
    if (typeof reminder_jitter === 'boolean') updates.reminder_jitter = reminder_jitter;

    const { data, error } = await supabase
      .from('privacy_preferences')
      .upsert(updates, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;

    logger.info('Privacy preferences updated', { userId });
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error updating privacy preferences:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update privacy preferences',
    });
  }
});

/**
 * GET /api/privacy/global-flags
 * Get global privacy flag states (for SDK consumers)
 */
router.get('/global-flags', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('global_privacy_flags')
      .select('flag_name, enabled');

    if (error) throw error;

    // Merge DB flags with defaults from config
    const flagMap: Record<string, boolean> = {};
    for (const flag of Object.keys(PRIVACY_FLAGS_CONFIG) as PrivacyFlag[]) {
      flagMap[flag] = PRIVACY_FLAGS_CONFIG[flag].default;
    }
    for (const row of (data || [])) {
      flagMap[row.flag_name] = !!row.enabled;
    }

    res.json({ success: true, data: flagMap });
  } catch (error) {
    logger.error('Error fetching global privacy flags:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch global privacy flags',
    });
  }
});

/**
 * GET /api/privacy/feature/:flag
 * SDK helper: isPrivacyFeatureEnabled — returns boolean for a given flag for the authenticated user
 */
router.get('/feature/:flag', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { flag } = req.params;
    const userId = req.user!.id;

    if (!(flag in PRIVACY_FLAGS_CONFIG)) {
      res.status(400).json({ success: false, error: `Unknown flag: ${flag}` });
      return;
    }

    const enabled = await privacyService.isPrivacyFeatureEnabled(userId, flag as PrivacyFlag);
    res.json({ success: true, flag, enabled });
  } catch (error) {
    logger.error('Error checking privacy feature flag:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check feature flag',
    });
  }
});

export default router;
