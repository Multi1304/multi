import { logger } from '../utils/logger';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config';
import { ProfileStateService } from './profileState.service';
import { ObjectStorageService } from './objectStorage.service';

/**
 * CloudSyncService handles the persistence of profile data (cookies, storage, partitions)
 * to an external S3-compatible object storage.
 */
export class CloudSyncService {
  private static profilesDir = config.profilesDir;

  /**
   * Uploads a profile directory to the cloud.
   * Compresses the directory into a .zip or .tar.gz before uploading.
   */
  static async uploadProfile(profileId: string) {
    const profilePath = path.join(this.profilesDir, profileId);
    
    if (!(await fs.pathExists(profilePath))) {
      logger.warn('Cannot sync non-existent profile', { profileId });
      return;
    }

    try {
      logger.info('Syncing profile to cloud...', { profileId });

      const manifest = await ProfileStateService.uploadToCloud(profileId);
      const objectManifest = await ObjectStorageService.syncDirectory(profileId, profilePath);
      const stats = await fs.stat(profilePath);
      logger.info('Profile synced successfully', { 
        profileId, 
        size: stats.size,
        provider: 'filesystem-mirror',
        version: manifest.version,
        checksum: manifest.checksum,
        objectStorageVersion: objectManifest?.version || null,
      });

      return { local: manifest, remote: objectManifest };
    } catch (err: any) {
      logger.error('Cloud sync upload failed', { profileId, error: err.message });
      throw err;
    }
  }

  /**
   * Downloads a profile from the cloud to the local worker's storage.
   */
  static async downloadProfile(profileId: string) {
    const profilePath = path.join(this.profilesDir, profileId);

    try {
      logger.info('Fetching profile from cloud...', { profileId });

      await fs.ensureDir(profilePath);
      let manifest = null;
      if (ObjectStorageService.isConfigured() && await ObjectStorageService.exists(profileId)) {
        await ObjectStorageService.restoreDirectory(profileId, profilePath);
        await ProfileStateService.rebuildLocalManifest(profileId, 'cloud');
        manifest = await ProfileStateService.getStateSummary(profileId);
      } else {
        manifest = await ProfileStateService.downloadFromCloud(profileId);
      }
      logger.info('Profile downloaded and ready for launch', {
        profileId,
        version: manifest?.localManifest?.version || manifest?.version || null,
        checksum: manifest?.localManifest?.checksum || manifest?.checksum || null,
      });
      
      return manifest;
    } catch (err: any) {
      logger.error('Cloud sync download failed', { profileId, error: err.message });
      throw err;
    }
  }

  /**
   * Checks if the profile exists in the cloud registry.
   */
  static async hasCloudState(profileId: string): Promise<boolean> {
    return (await ObjectStorageService.exists(profileId)) || await ProfileStateService.hasCloudState(profileId);
  }
}
