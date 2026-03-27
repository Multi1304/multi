import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { afterEach, describe, expect, it } from 'vitest';
import { RuntimeEnvironmentService } from '../src/services/runtimeEnvironment.service';
import { SessionPersistenceService } from '../src/services/sessionPersistence.service';

describe('runtime environment', () => {
  it('defaults to production when no sandbox flag is present', () => {
    expect(RuntimeEnvironmentService.defaultMode()).toBe('production');
    expect(RuntimeEnvironmentService.normalizeMode(undefined)).toBeNull();
  });
});

describe('production session persistence', () => {
  const tempRoot = path.join(os.tmpdir(), `camel-session-${Date.now()}`);

  afterEach(async () => {
    await fs.remove(tempRoot).catch(() => null);
  });

  it('captures an encrypted artifact in production mode', async () => {
    const userDataDir = path.join(tempRoot, 'profile-1');
    await fs.ensureDir(path.join(userDataDir, 'Default', 'Local Storage'));
    await fs.writeFile(path.join(userDataDir, 'Default', 'Local Storage', 'leveldb.txt'), 'hello');

    const snapshot = await SessionPersistenceService.capture(userDataDir, null, {
      profileId: 'profile-1',
      environment: 'production',
    });

    expect(snapshot.environment).toBe('production');
    expect(snapshot.artifact?.mode).toBeDefined();
    expect(snapshot.artifact?.fileCount).toBeGreaterThanOrEqual(1);
    expect(await fs.pathExists(path.join(process.cwd(), 'runtime-sessions', 'profile-1', 'latest.encbin'))).toBe(true);
    await fs.remove(path.join(process.cwd(), 'runtime-sessions', 'profile-1')).catch(() => null);
  });
});
