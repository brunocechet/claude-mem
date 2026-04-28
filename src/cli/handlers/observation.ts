/**
 * Observation Handler - PostToolUse
 *
 * Extracted from save-hook.ts - sends tool usage to worker for storage.
 */

import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'fs';
import type { EventHandler, NormalizedHookInput, HookResult } from '../types.js';
import { executeWithWorkerFallback, isWorkerFallback } from '../../shared/worker-utils.js';
import { logger } from '../../utils/logger.js';
import { HOOK_EXIT_CODES } from '../../shared/hook-constants.js';
import { shouldTrackProject } from '../../shared/should-track-project.js';
import { OUTBOX_PATH } from '../../shared/paths.js';
import { normalizePlatformSource } from '../../shared/platform-source.js';

interface OutboxEntry {
  contentSessionId: string;
  platformSource: string;
  tool_name: string;
  tool_input: unknown;
  tool_response: unknown;
  cwd: string;
  agentId?: string;
  agentType?: string;
}

function writeToOutbox(entry: OutboxEntry): void {
  try {
    appendFileSync(OUTBOX_PATH, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (err) {
    logger.warn('HOOK', 'Failed to write to outbox', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function drainOutbox(): Promise<void> {
  if (!existsSync(OUTBOX_PATH)) return;

  let lines: string[];
  try {
    lines = readFileSync(OUTBOX_PATH, 'utf-8').split('\n').filter(Boolean);
  } catch {
    return;
  }

  if (lines.length === 0) return;

  // Group by contentSessionId + platformSource for batch POST
  const bySession = new Map<string, { contentSessionId: string; platformSource: string; observations: object[] }>();
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as OutboxEntry;
      const key = `${entry.contentSessionId}|${entry.platformSource ?? ''}`;
      if (!bySession.has(key)) {
        bySession.set(key, {
          contentSessionId: entry.contentSessionId,
          platformSource: entry.platformSource ?? '',
          observations: [],
        });
      }
      const { tool_name, tool_input, tool_response, cwd, agentId, agentType } = entry;
      bySession.get(key)!.observations.push({ tool_name, tool_input, tool_response, cwd, agentId, agentType });
    } catch {
      // skip malformed lines
    }
  }

  let anyFailed = false;
  for (const batch of bySession.values()) {
    const result = await executeWithWorkerFallback(
      '/api/sessions/observations/batch',
      'POST',
      batch,
    );
    if (isWorkerFallback(result)) {
      anyFailed = true;
    }
  }

  if (!anyFailed) {
    try {
      writeFileSync(OUTBOX_PATH, '', 'utf-8');
    } catch {
      // ignore
    }
  }
}

export const observationHandler: EventHandler = {
  async execute(input: NormalizedHookInput): Promise<HookResult> {
    const { sessionId, cwd, toolName, toolInput, toolResponse } = input;
    const platformSource = normalizePlatformSource(input.platform);

    if (!toolName) {
      // No tool name provided - skip observation gracefully
      return { continue: true, suppressOutput: true, exitCode: HOOK_EXIT_CODES.SUCCESS };
    }

    const toolStr = logger.formatTool(toolName, toolInput);

    logger.dataIn('HOOK', `PostToolUse: ${toolStr}`, {});

    // Plan 05 Phase 6: cwd is validated at the adapter boundary; the adapter
    // rejects empty cwd before reaching the handler. We still type-narrow for
    // TypeScript and as a belt-and-suspenders guard.
    if (!cwd) {
      throw new Error(`Missing cwd in PostToolUse hook input for session ${sessionId}, tool ${toolName}`);
    }

    // Plan 05 Phase 5: project exclusion via single helper.
    if (!shouldTrackProject(cwd)) {
      logger.debug('HOOK', 'Project excluded from tracking, skipping observation', { cwd, toolName });
      return { continue: true, suppressOutput: true };
    }

    // Drain any observations spooled while worker was down (fire-and-forget).
    drainOutbox().catch(() => { /* ignore drain errors */ });

    const entry: OutboxEntry = {
      contentSessionId: sessionId,
      platformSource,
      tool_name: toolName,
      tool_input: toolInput,
      tool_response: toolResponse,
      cwd,
      agentId: input.agentId,
      agentType: input.agentType,
    };

    // Plan 05 Phase 2: single helper for ensure-worker-alive → request → fallback.
    const result = await executeWithWorkerFallback<{ status?: string }>(
      '/api/sessions/observations',
      'POST',
      entry,
    );

    if (isWorkerFallback(result)) {
      // Worker unreachable — spool to outbox for drain on next healthy turn.
      // Fail-loud counter has already been incremented by the helper and may
      // have escalated to exit 2; if we got here, threshold not yet reached.
      writeToOutbox(entry);
      logger.warn('HOOK', 'Worker unreachable, spooled observation to outbox', { toolName });
      return { continue: true, suppressOutput: true, exitCode: HOOK_EXIT_CODES.SUCCESS };
    }

    logger.debug('HOOK', 'Observation sent successfully', { toolName });
    return { continue: true, suppressOutput: true };
  },
};
