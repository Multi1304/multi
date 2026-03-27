import axios from 'axios';
import { logger } from '../utils/logger';

export class SlackService {
  /**
   * Sends a notification to a Slack webhook.
   * This is a specialized version of the general webhook for Slack's Block Kit formatting.
   */
  static async sendNotification(webhookUrl: string, title: string, message: string, severity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO') {
    const color = severity === 'CRITICAL' ? '#E01E5A' : severity === 'WARNING' ? '#ECB22E' : '#2EB67D';
    const emoji = severity === 'CRITICAL' ? '🚨' : severity === 'WARNING' ? '⚠️' : 'ℹ️';

    const payload = {
      attachments: [
        {
          color,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: `${emoji} ${title}`,
                emoji: true
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: message
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `*Timestamp:* ${new Date().toISOString()} | *Platform:* Multilogin Ultra Deluxe V2.6`
                }
              ]
            }
          ]
        }
      ]
    };

    try {
      await axios.post(webhookUrl, payload);
      logger.debug('Slack notification sent successfully');
    } catch (error: any) {
      logger.error('Failed to send Slack notification', { error: error.message });
    }
  }

  /**
   * Specifically logs evasion signals to Slack.
   */
  static async logEvasionSignal(webhookUrl: string, runId: string, signal: any) {
    const message = `*Run ID:* \`${runId}\`\n*Type:* \`${signal.type}\`\n*Severity:* \`${signal.severity}\`\n*Description:* ${signal.description}\n*Source:* \`${signal.source}\``;
    await this.sendNotification(webhookUrl, 'Security Evasion Alert', message, signal.severity === 'CRITICAL' || signal.severity === 'HIGH' ? 'CRITICAL' : 'WARNING');
  }
}
