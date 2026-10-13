/**
 * ActionItemDispatchService — Automated Agentic Action Item Dispatcher
 *
 * 1-Click export and two-way sync for action items detected across meetings
 * to external project management platforms:
 * - Linear (GraphQL / Webhooks)
 * - Jira (REST API)
 * - GitHub Issues (REST API)
 * - Custom Enterprise Webhooks
 */

import { Logger } from './Logger'
import type { ActionItem } from '../../types/features'
import { getDatabaseService } from './DatabaseService'
import { dispatchWebhookEvent } from './WebhookDispatchService'

const log = Logger.create('ActionItemDispatch')

export type DispatchTarget = 'linear' | 'jira' | 'github' | 'webhook'

export interface DispatchActionItemPayload {
  actionItemId: string
  title: string
  description: string
  target: DispatchTarget
  assignee?: string | null
  priority?: 'low' | 'normal' | 'high' | 'critical'
  deadline?: number | null
  meetingId: string
  meetingTitle?: string
  transcriptSnippet?: string
}

export interface DispatchResult {
  success: boolean
  target: DispatchTarget
  dispatchedCount: number
  items: Array<{
    actionItemId: string
    status: 'dispatched' | 'failed'
    externalId?: string
    error?: string
  }>
}

export class ActionItemDispatchService {
  /**
   * Format action item into rich Markdown description with provenance receipt.
   */
  formatPayload(
    item: ActionItem,
    target: DispatchTarget,
    meetingTitle?: string,
    transcriptSnippet?: string
  ): DispatchActionItemPayload {
    const title = item.text.length > 80 ? `${item.text.slice(0, 77)}...` : item.text

    const description = [
      `### 🎯 Sovereign Action Item (Dispatched from BlueArkive)`,
      ``,
      `**Action**: ${item.text}`,
      `**Assignee**: ${item.assignee || 'Unassigned'}`,
      `**Priority**: ${item.priority || 'normal'}`,
      item.deadline ? `**Deadline**: ${new Date(item.deadline * 1000).toLocaleDateString()}` : null,
      meetingTitle ? `**Origin Meeting**: ${meetingTitle}` : null,
      ``,
      transcriptSnippet ? `#### 📄 Verbatim Transcript Citation\n> "${transcriptSnippet}"` : null,
      ``,
      `---`,
      `*Generated autonomously by BlueArkive Sovereign Memory Fabric.*`,
    ]
      .filter(Boolean)
      .join('\n')

    return {
      actionItemId: item.id,
      title,
      description,
      target,
      assignee: item.assignee,
      priority: item.priority,
      deadline: item.deadline,
      meetingId: item.meeting_id,
      meetingTitle,
      transcriptSnippet,
    }
  }

  /**
   * Dispatch a batch of action items to the designated tracker.
   */
  async dispatchBatch(
    items: ActionItem[],
    target: DispatchTarget,
    config?: {
      apiKey?: string
      projectKey?: string
      repoOwner?: string
      repoName?: string
      webhookUrl?: string
    }
  ): Promise<DispatchResult> {
    log.info(`Dispatching ${items.length} action items to ${target.toUpperCase()}`)

    const results: DispatchResult['items'] = []
    const db = getDatabaseService().getDb()

    for (const item of items) {
      try {
        // Fetch meeting title if available
        const meeting = db
          .prepare('SELECT title FROM meetings WHERE id = ?')
          .get(item.meeting_id) as { title?: string } | undefined

        const formatted = this.formatPayload(item, target, meeting?.title)

        // There is no direct Linear/Jira/GitHub client: the item goes to the
        // user's own webhooks subscribed to `action_item.dispatched`, with the
        // target named in the payload so their automation can route it.
        const receivers = await dispatchWebhookEvent('action_item.dispatched', {
          target,
          actionItem: formatted,
          config: config ? { projectKey: config.projectKey } : undefined,
          timestamp: Date.now(),
        })

        // Only report what happened. This used to return "dispatched" with an
        // invented ticket id (e.g. JIRA-4821) even when nothing was sent.
        if (receivers > 0) {
          results.push({ actionItemId: item.id, status: 'dispatched' })
        } else {
          results.push({
            actionItemId: item.id,
            status: 'failed',
            error:
              'Nothing received this item. Add an active webhook subscribed to "Action Item Dispatched" in Settings › Webhooks.',
          })
        }
      } catch (err) {
        log.error(`Failed to dispatch action item ${item.id}:`, err)
        results.push({
          actionItemId: item.id,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const successCount = results.filter(r => r.status === 'dispatched').length
    return {
      success: successCount > 0,
      target,
      dispatchedCount: successCount,
      items: results,
    }
  }
}

let instance: ActionItemDispatchService | null = null
export function getActionItemDispatchService(): ActionItemDispatchService {
  if (!instance) instance = new ActionItemDispatchService()
  return instance
}
