const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const testsDir = path.join(rootDir, 'tests');
const vitestEntrypoint = path.join(rootDir, 'node_modules', 'vitest', 'vitest.mjs');
const batchSize = Number(process.env.VITEST_BATCH_SIZE || 10);

function collectTests(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTests(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(path.relative(rootDir, fullPath).replace(/\\/g, '/'));
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function chunk(items, size) {
  const groups = [];

  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }

  return groups;
}

const tests = collectTests(testsDir);

if (!tests.length) {
  console.log('No Vitest files found.');
  process.exit(0);
}

const batches = chunk(tests, Math.max(1, batchSize));

for (let index = 0; index < batches.length; index += 1) {
  const batch = batches[index];
  console.log(`\n[vitest-batch] Running batch ${index + 1}/${batches.length} (${batch.length} files)`);

  const result = spawnSync(
    process.execPath,
    ['--max-old-space-size=4096', vitestEntrypoint, 'run', ...batch],
    {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITEST_BATCH_INDEX: String(index),
        VITEST_BATCH_TOTAL: String(batches.length),
      },
    }
  );

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`\n[vitest-batch] Completed ${tests.length} files across ${batches.length} batches.`);
