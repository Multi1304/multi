import { PrismaClient } from '@prisma/client';
import { AiFingerprintService } from '../src/services/aiFingerprint.service';
import { FlowExecutorService } from '../src/services/flow.executor';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function run(count: number = 1) {
  const userId = '89ec7ceb-036d-4d6d-976d-d44dfd4bd79b';
  const tenantId = '255e61dd-5057-42ae-8ee4-b6ae11e6ead1';
  const VERSION = 'Mariana V30.2';

  console.log(`[SHADOW] Starting Genesis for ${count} accounts (${VERSION})`);
  console.log(`[SHADOW] Protocol: Domain Oracle + 60s Persistence Settle`);

  for (let i = 1; i <= count; i++) {
    const profileName = `Anchor Master V27-${i}-${Date.now()}`;
    console.log(`[SHADOW] [${i}/${count}] Preparing instance: ${profileName}`);

  // 1. Create Profile
  let profile = await (prisma as any).profile.findFirst({
    where: { name: profileName, tenantId }
  });

  if (!profile) {
    console.log(`[SHADOW] Profile not found. Cloning Victory Fingerprint...`);
    const fingerprint = {
      "arch": "x64",
      "audio": { "noise": 8.129653461840938e-8, "sampleRate": 44100 },
      "fonts": ["Georgia", "Verdana", "Times New Roman", "Courier New", "Trebuchet MS", "Arial"],
      "webgl": {
        "vendor": "Google Inc. (NVIDIA)",
        "renderer": "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)",
        "unmaskedVendor": "Google Inc. (NVIDIA)",
        "unmaskedRenderer": "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)"
      },
      "canvas": { "noise": { "a": -1, "b": -2, "g": 2, "r": -2 } },
      "plugins": ["PDF Viewer", "Chrome PDF Viewer", "Chromium PDF Viewer"],
      "language": "de-DE",
      "platform": "DESKTOP",
      "userAgent": "Mozilla/5.0 (Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
      "platformOS": "Windows",
      "deviceMemory": 16,
      "maxTouchPoints": 0,
      "screenResolution": "1536x864",
      "hardwareConcurrency": 8
    };
    profile = await (prisma as any).profile.create({
      data: {
        name: profileName,
        tenantId,
        userId,
        platform: 'DESKTOP',
        fingerprint: fingerprint as any
      }
    });
    console.log(`[SHADOW] Profile created: ${profile.id}`);
  } else {
    console.log(`[SHADOW] Using existing profile: ${profile.id}`);
  }

    // 2. Load Flow
    const flowPath = 'c:\\Users\\xazai\\.gemini\\antigravity\\brain\\06005e53-be4c-4e14-9889-ea92a50cc979\\WRAITH_V4_56_HOTMAIL.json.md';
    const rawFlow = fs.readFileSync(flowPath, 'utf8');
    const flowJson = JSON.parse(rawFlow.replace(/```json|```/g, '').trim());
    
    // Hard-Force Genesis Locale (Spanish) to bypass English gate navigation traps
    if (flowJson.steps && flowJson.steps[0] && flowJson.steps[0].params && flowJson.steps[0].params.url) {
      const url = flowJson.steps[0].params.url;
      if (url.includes('signup.live.com/signup') && !url.includes('mkt=es-es')) {
        flowJson.steps[0].params.url += '&mkt=es-es';
      }
    }

    // 3. Create/Update Flow Template
    const flowName = `Quantum Oracle V4.67 - ${VERSION}`;
    let flow = await (prisma as any).flow.findFirst({
      where: { name: flowName, tenantId }
    });

    if (flow) {
      flow = await (prisma as any).flow.update({
        where: { id: flow.id },
        data: { steps: flowJson.steps }
      });
    } else {
      flow = await (prisma as any).flow.create({
        data: {
          name: flowName,
          tenantId,
          userId,
          steps: flowJson.steps
        }
      });
    }

    // 4. Trigger Execution with V27 Stability Baseline
    console.log(`[SHADOW] [${i}/${count}] Triggering Flow Execution with Baseline Stability...`);
    const runVariables = {
      username: `mgomez${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000)}@hotmail.com`,
      password: `Secured!${Math.random().toString(36).substring(2, 12)}A1`,
      firstName: 'Marcos',
      lastName: 'Gomez',
      birthMonth: Math.floor(Math.random() * 12) + 1,
      birthDay: Math.floor(Math.random() * 28) + 1,
      birthYear: 1995 + Math.floor(Math.random() * 5),
      proxyPoolId: null,
      tenantId: null,
    };

    try {
      const run = await FlowExecutorService.runFlow(flow.id, tenantId, runVariables);
      console.log(`[SHADOW] [${i}/${count}] Flow completed. Run ID: ${run.id}`);
    } catch (err) {
      console.error(`[SHADOW] [${i}/${count}] Execution failed:`, err);
    }

    if (count > 1 && i < count) {
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

const scaleArg = process.argv[2] ? parseInt(process.argv[2]) : 1;
run(scaleArg)
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
