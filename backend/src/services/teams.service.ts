import axios from 'axios';
import { logger } from '../utils/logger';

export class TeamsService {
  /**
   * Sends a notification to a Microsoft Teams webhook via Adaptive Cards or simple MessageCard.
   */
  static async sendNotification(webhookUrl: string, title: string, message: string, severity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO') {
    const themeColor = severity === 'CRITICAL' ? 'E01E5A' : severity === 'WARNING' ? 'ECB22E' : '2EB67D';
    
    const payload = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      "themeColor": themeColor,
      "summary": title,
      "sections": [{
        "activityTitle": title,
        "activitySubtitle": `Multilogin Ultra Deluxe V3 - ${new Date().toISOString()}`,
        "activityImage": "https://adaptivecards.io/content/bots/app-icon.png",
        "text": message
      }]
    };

    try {
      await axios.post(webhookUrl, payload);
      logger.debug('Teams notification sent successfully');
    } catch (error: any) {
      logger.error('Failed to send Teams notification', { error: error.message });
    }
  }
}
