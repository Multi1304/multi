import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { WebhookService } from './webhook.service';
import { BrowserNodeService } from './browser.node';
import { GroqService } from './groq.service';
import axios from 'axios';
import { Page } from 'playwright';
import { z } from 'zod';
import retry from 'async-retry';
import { FlowContractService } from './flowContract.service';
import { FlowRunAnalysisService } from './flowRunAnalysis.service';
import { AccountStateService } from './accountState.service';
import { InboxVerificationService } from './inboxVerification.service';
import { AccountReputationService } from './accountReputation.service';
import { BrowserStageService } from './browserStage.service';
import { FingerprintHardeningService } from './fingerprintHardening.service';
import { SessionPersistenceService } from './sessionPersistence.service';
import path from 'path';
import fs from 'fs-extra';

export interface StepExecuteResult {
  status: 'completed' | 'failed';
  output?: any;
  error?: string;
  diagnostic?: string;
}

export class FlowExecutorService {
  private static readonly REALISTIC_FIRST_NAMES = ['Adrian', 'Elian', 'Nora', 'Mila', 'Leo', 'Sonia', 'Dario', 'Vera', 'Iris', 'Mateo', 'Lina', 'Noel'];
  private static readonly REALISTIC_LAST_NAMES = ['Marlow', 'Valen', 'Serrin', 'Avery', 'Lennox', 'Corvin', 'Salem', 'Navier', 'Delmar', 'Rivet', 'Caspian', 'Varela'];
  private static readonly PASSWORD_SYMBOLS = ['!', '@', '#', '$', '%', '&', '*'];
  private static readonly VARIABLE_ALIASES: Record<string, string[]> = {
    password: ['contraseña', 'pass', 'pw', 'clave', 'contrasena', 'contraseña1', 'password1'],
    firstName: ['nombre', 'primer_nombre', 'firstname', 'firstName1', 'nombre1'],
    lastName: ['apellido', 'last_name', 'family_name', 'lastname1', 'apellido1'],
    username: ['email', 'user', 'account', 'correo', 'usuario', 'username1', 'email1', 'membername'],
    birthMonth: ['birthmonth', 'birthMonth1', 'mes', 'month'],
    birthDay: ['birthday', 'birthDay1', 'dia', 'day'],
    birthYear: ['birthyear', 'birthYear1', 'ano', 'año', 'year'],
  };

  private static async resolveExecutionProfile(tenantId: string, variables: Record<string, any> = {}) {
    const requestedProfileId = variables.profileId || variables.profile?.id || null;

    if (requestedProfileId) {
      const requestedProfile = await (prisma.profile as any).findFirst({
        where: {
          id: requestedProfileId,
          tenantId,
        },
        select: {
          id: true,
          name: true,
          fingerprint: true,
          proxyConfig: true,
        }
      });

      if (!requestedProfile) {
        throw new Error(`Profile ${requestedProfileId} not found`);
      }

      return requestedProfile;
    }

    const fallbackProfile = await (prisma.profile as any).findFirst({
      where: { tenantId },
      orderBy: [{ createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        fingerprint: true,
        proxyConfig: true,
      }
    });

    if (!fallbackProfile) {
      throw new Error(`No profile available for tenant ${tenantId}`);
    }

    return fallbackProfile;
  }

  private static async waitForManualVerificationIfNeeded(page: Page, timeoutMs = 180000) {
    let stage = await BrowserStageService.detectMicrosoftStage(page).catch(() => 'unknown');
    if (stage !== 'captcha') return;

    logger.warn('[FLOW-GUARD] Flow reached human verification challenge. Attempting auto-resolution...', {
      timeoutMs,
    });

    // Delegate to BrowserNodeService which has the full press-and-hold auto-resolver
    try {
      const resolved = await (BrowserNodeService as any).waitForManualChallengeResolution(page, timeoutMs);
      if (resolved) {
        logger.info('[FLOW-GUARD] Human verification auto-resolved by BrowserNodeService.');
        return;
      }
    } catch (e: any) {
      logger.warn('[FLOW-GUARD] BrowserNodeService auto-resolution failed, continuing manual check...', {
        error: e.message,
      });
    }

    // Final check after timeout
    stage = await BrowserStageService.detectMicrosoftStage(page).catch(() => 'unknown');
    if (stage !== 'captcha') {
      logger.info('[FLOW-GUARD] Human verification cleared before finalizing flow.', { stage });
      return;
    }

    throw new Error('Manual human verification required before flow can complete.');
  }

  /**
   * Recursively flatten an object and support dot-notation access
   */
  private static flattenObject(obj: any, prefix = ''): Record<string, any> {
    let flattened: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(flattened, this.flattenObject(value, newKey));
        // Also keep the individual key if no collision
        if (!(key in flattened)) flattened[key] = value;
      } else {
        flattened[newKey] = value;
        // Also keep short key for convenience
        if (!(key in flattened)) flattened[key] = value;
      }
    }
    return flattened;
  }

  private static splitEmailParts(value: string) {
    const candidate = String(value || '').trim();
    const atIndex = candidate.indexOf('@');
    if (atIndex <= 0) {
      return {
        localPart: candidate,
        domain: '',
      };
    }

    return {
      localPart: candidate.slice(0, atIndex),
      domain: candidate.slice(atIndex),
    };
  }

  private static hydrateCanonicalVariables(input: Record<string, any> = {}) {
    const next = { ...input };

    for (const [canonicalKey, aliases] of Object.entries(this.VARIABLE_ALIASES)) {
      if (next[canonicalKey] !== undefined && next[canonicalKey] !== null && next[canonicalKey] !== '') {
        continue;
      }

      for (const alias of aliases) {
        const matchingKey = Object.keys(next).find((candidate) => candidate.toLowerCase() === alias.toLowerCase());
        if (!matchingKey) continue;

        const value = next[matchingKey];
        if (value === undefined || value === null || value === '') continue;
        next[canonicalKey] = value;
        logger.info(`[ZERO-G] Alias Guard: Mapping '${matchingKey}' to '${canonicalKey}'`);
        break;
      }
    }

    const usernameValue = typeof next.username === 'string' ? next.username.trim() : '';
    if (usernameValue) {
      const { localPart, domain } = this.splitEmailParts(usernameValue);
      next.username = localPart || usernameValue;

      if (!next.memberName) {
        next.memberName = next.username;
      }

      if (!next.email) {
        next.email = domain ? `${localPart}${domain}` : `${next.username}@hotmail.com`;
      }

      if (!next.username1) {
        next.username1 = next.username;
      }

      if (!next.email1) {
        next.email1 = next.email;
      }
    }

    return next;
  }

  private static randomItem(values: string[]) {
    return values[Math.floor(Math.random() * values.length)] || values[0] || '';
  }

  private static sanitizeUsernameToken(value: string) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
  }

  private static pickIdentitySeed(output: Record<string, any> = {}) {
    const firstName = String(output.firstName || output.firstName1 || this.randomItem(this.REALISTIC_FIRST_NAMES)).trim();
    const lastName = String(output.lastName || output.lastName1 || this.randomItem(this.REALISTIC_LAST_NAMES)).trim();
    return { firstName, lastName };
  }

  private static isLowQualityUsername(value: string) {
    const candidate = this.sanitizeUsernameToken(value);
    if (!candidate) return true;
    if (candidate.length < 6) return true;
    if (/^(test|user|camel|hotmail|outlook)/.test(candidate)) return true;
    if (/(.)\1{3,}/.test(candidate)) return true;
    const digitCount = (candidate.match(/\d/g) || []).length;
    if (digitCount > Math.max(4, Math.floor(candidate.length / 2))) return true;
    return false;
  }

  private static buildHumanLikeUsername(firstName?: string, lastName?: string) {
    const seed = this.pickIdentitySeed({ firstName, lastName });
    const first = this.sanitizeUsernameToken(seed.firstName);
    const last = this.sanitizeUsernameToken(seed.lastName);
    const connector = this.randomItem(['', '.', '_']);
    const numericSuffix = `${Math.floor(Math.random() * 90) + 10}${Math.floor(Math.random() * 9)}`;
    const letterSuffix = this.randomItem(['a', 'e', 'i', 'o', 'r', 'n', 'l']);
    const variants = [
      `${first}${connector}${last}${numericSuffix}`,
      `${first}${last.slice(0, 3)}${numericSuffix}${letterSuffix}`,
      `${first.slice(0, 1)}${last}${numericSuffix}`,
      `${first}${letterSuffix}${numericSuffix}`,
    ]
      .map((item) => item.replace(/[^a-z0-9._]/g, ''))
      .filter((item) => item.length >= 6 && item.length <= 24);

    return variants[0] || `${first || 'nova'}${numericSuffix}${letterSuffix}`;
  }

  private static isMicrosoftStrongPassword(value: string, bannedTokens: string[] = []) {
    const candidate = String(value || '').trim();
    if (candidate.length < 12 || candidate.length > 20) return false;
    if (!/[A-Z]/.test(candidate)) return false;
    if (!/[a-z]/.test(candidate)) return false;
    if (!/[0-9]/.test(candidate)) return false;
    if (!/[!@#$%&*]/.test(candidate)) return false;
    const low = candidate.toLowerCase();
    return !bannedTokens.some((token) => {
      const sanitized = this.sanitizeUsernameToken(token);
      return sanitized && sanitized.length >= 3 && low.includes(sanitized);
    });
  }

  private static buildMicrosoftStrongPassword(context: Record<string, any> = {}) {
    const seed = this.pickIdentitySeed(context);
    const safeCore = `${seed.firstName.slice(0, 1).toUpperCase()}${seed.lastName.slice(0, 1).toLowerCase()}`;
    const upper = this.randomItem(['Q', 'R', 'T', 'V', 'K', 'M']);
    const lower = this.randomItem(['a', 'e', 'i', 'o', 'u', 'y']);
    const digits = `${Math.floor(Math.random() * 90) + 10}${Math.floor(Math.random() * 9)}`;
    const symbolA = this.randomItem(this.PASSWORD_SYMBOLS);
    const symbolB = this.randomItem(this.PASSWORD_SYMBOLS);
    const candidate = `${upper}${symbolA}${safeCore}${digits}${lower}${symbolB}${Math.floor(Math.random() * 9)}`;
    const bannedTokens = [
      context.username,
      context.email,
      context.firstName,
      context.firstName1,
      context.lastName,
      context.lastName1,
    ].filter(Boolean);

    if (this.isMicrosoftStrongPassword(candidate, bannedTokens)) {
      return candidate;
    }

    return `Q${symbolA}v${digits}N${symbolB}7mR${Math.floor(Math.random() * 9)}`;
  }

  private static async generateLLMIdentity(tenantId: string, fingerprint: any): Promise<{ firstName: string; lastName: string; username: string; bio: string }> {
    const locale = (fingerprint?.language || 'en-US').split('-')[0];
    const systemPrompt = `You are a creative identity generator for a global platform.
    Generate a realistic, human-sounding identity for a user in locale: ${locale}.
    Avoid common bot-like names or patterns. Respond ONLY in JSON.`;
    
    const prompt = `Generate:
    - firstName: A common but not generic first name.
    - lastName: A matching realistic last name.
    - username: A unique, human-like username based on the name (e.g., using initials, a favorite year, or a short word).
    - bio: A short, 1-sentence bio about a hobby or interest.`;

    try {
      const result = await GroqService.chat(prompt, systemPrompt);
      const parsed = JSON.parse(result);
      return {
        firstName: parsed.firstName || this.randomItem(this.REALISTIC_FIRST_NAMES),
        lastName: parsed.lastName || this.randomItem(this.REALISTIC_LAST_NAMES),
        username: parsed.username || this.buildHumanLikeUsername(parsed.firstName, parsed.lastName),
        bio: parsed.bio || 'Coffee lover and tech enthusiast.'
      };
    } catch (e) {
      logger.warn('[FLOW-LLM] Failed to generate identity via LLM, falling back to static rules', { error: e.message });
      const { firstName, lastName } = this.pickIdentitySeed({});
      return {
        firstName,
        lastName,
        username: this.buildHumanLikeUsername(firstName, lastName),
        bio: 'Hello world!'
      };
    }
  }

  private static async enforceCredentialQuality(tenantId?: string | null, output: Record<string, any> = {}, fingerprint?: any) {
    const next = this.hydrateCanonicalVariables(output);
    
    // Check if we already have a high-quality identity
    const hasExistingIdentity = next.firstName && next.lastName && next.username && !this.isLowQualityUsername(next.username);
    
    if (!hasExistingIdentity) {
      const llmIdentity = await this.generateLLMIdentity(tenantId || 'default', fingerprint);
      next.firstName = next.firstName || llmIdentity.firstName;
      next.lastName = next.lastName || llmIdentity.lastName;
      next.username = next.username || llmIdentity.username;
      next.bio = next.bio || llmIdentity.bio;
      
      // Sync aliases
      next.firstName1 = next.firstName1 || next.firstName;
      next.lastName1 = next.lastName1 || next.lastName;
      next.username1 = next.username1 || next.username;
      next.memberName = next.memberName || next.username;
      next.email = next.email || `${next.username}@hotmail.com`;
      next.email1 = next.email1 || next.email;
    }

    const passwordValue = String(next.password || next.password1 || '').trim();
    const bannedTokens = [next.username, next.email, next.firstName, next.lastName].filter(Boolean);
    if (!passwordValue || !this.isMicrosoftStrongPassword(passwordValue, bannedTokens)) {
      const upgradedPassword = this.buildMicrosoftStrongPassword({
        ...next,
        firstName: next.firstName,
        lastName: next.lastName,
      });
      next.password = upgradedPassword;
      next.password1 = upgradedPassword;
    }

    return this.hydrateCanonicalVariables(next);
  }

  private static async saveStepCheckpoint(runId: string, stepIndex: number, page: Page, variables: Record<string, any>) {
    try {
      const checkpointDir = path.resolve(process.cwd(), 'logs', 'checkpoints', runId);
      await fs.ensureDir(checkpointDir);
      
      const state = await page.context().storageState();
      const checkpointPath = path.resolve(checkpointDir, `step_${stepIndex}.json`);
      
      await fs.writeFile(checkpointPath, JSON.stringify({
        runId,
        stepIndex,
        timestamp: new Date().toISOString(),
        variables,
        state
      }, null, 2));

      logger.info(`[CHECKPOINT] Saved state for run ${runId} at step ${stepIndex}`);
    } catch (e) {
      logger.warn('[CHECKPOINT] Failed to save step checkpoint', { error: e.message });
    }
  }

  private static async resolveLastCheckpoint(runId: string): Promise<any | null> {
    try {
      const checkpointDir = path.resolve(process.cwd(), 'logs', 'checkpoints', runId);
      if (!await fs.pathExists(checkpointDir)) return null;

      const files = await fs.readdir(checkpointDir);
      const stepFiles = files.filter(f => f.startsWith('step_') && f.endsWith('.json'));
      if (stepFiles.length === 0) return null;

      const lastFile = stepFiles.sort((a, b) => {
        const idxA = parseInt(a.match(/\d+/)?.[0] || '0');
        const idxB = parseInt(b.match(/\d+/)?.[0] || '0');
        return idxB - idxA;
      })[0];

      const content = await fs.readJson(path.resolve(checkpointDir, lastFile));
      return content;
    } catch (e) {
      return null;
    }
  }
  /**
   * Helper to substitute {{variable}} in a config object (Async for Self-Healing)
   */
  private static async substituteVariables(config: any, variables: Record<string, any>, stepContext = ''): Promise<any> {
    if (config === null || config === undefined) return config;

    if (Array.isArray(config)) {
      const results = [];
      for (const item of config) {
        results.push(await this.substituteVariables(item, variables, stepContext));
      }
      return results;
    }

    if (typeof config === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(config)) {
        result[key] = await this.substituteVariables(value, variables, stepContext);
      }
      return result;
    }

    if (typeof config === 'string') {
      if (!config.includes('{')) return config;

      // Zero-G V4.50: Non-greedy regex + Single-Word Identifier Guard
      // This prevents matching literal JSON braces like { 'key': 'val' }
      const regex = /\{{1,2}([a-zA-Z0-9_.\u00C0-\u00FF]+)\}{1,2}/g;
      let match;
      let finalString = config;
      const seen = new Set();

      while ((match = regex.exec(config)) !== null) {
        const path = match[1].trim();

        // Skip if it looks like JSON or malformed fragment (contains quotes, colons, or spaces)
        if (path.includes(':') || path.includes("'") || path.includes('"') || path.includes(' ')) {
          logger.debug(`[ZERO-G] Skipping non-variable fragment: ${path}`);
          continue;
        }

        if (seen.has(path)) continue;
        seen.add(path);

        const value = path.split('.').reduce((acc, part) => {
          if (acc && typeof acc === 'object' && part in acc) return acc[part];
          return undefined;
        }, variables);

        if (value === undefined) {
          logger.warn(`Variable ${path} missing. Attempting Fuzzy Recovery...`);
          // Fuzzy Recovery: Locked down to single-word identifiers only
          const flatVars = variables;
          const lowPath = path.toLowerCase();
          const fuzzyMatch = Object.keys(flatVars).find(k => k.toLowerCase() === lowPath);

          if (fuzzyMatch) {
            logger.info(`[ZERO-G] Variable Match: '${path}' matches data key '${fuzzyMatch}'`);
            finalString = finalString.replace(new RegExp(match[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(flatVars[fuzzyMatch]));
          } else {
            const healed = await this.healVariable(path, variables, stepContext);
            finalString = finalString.replace(new RegExp(match[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(healed));
            variables[path] = healed;
          }
        } else {
          finalString = finalString.replace(new RegExp(match[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(value));
        }
      }
      return finalString;
    }

    return config;
  }

  /**
   * Self-Healing Variable Logic: Calls AI to generate missing data on-the-fly
   */
  private static async healVariable(name: string, context: any, stepDetail: string): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      const lowName = name.toLowerCase();
      if (lowName.includes('pass')) return this.buildMicrosoftStrongPassword(context || {});
      if (lowName.includes('user') || lowName.includes('member') || lowName.includes('email')) {
        return this.buildHumanLikeUsername(context?.firstName, context?.lastName);
      }
      if (lowName.includes('first') || lowName.includes('nombre')) return this.pickIdentitySeed(context || {}).firstName;
      if (lowName.includes('last') || lowName.includes('apellido')) return this.pickIdentitySeed(context || {}).lastName;
      if (lowName.includes('month') || lowName.includes('mes')) return '7';
      if (lowName.includes('day') || lowName.includes('dia')) return '14';
      if (lowName.includes('year') || lowName.includes('ano') || lowName.includes('año')) return '1996';
      return `[MISSING_${name}]`;
    }

    try {
      logger.info(`[HEALER] AI generating missing variable: ${name}`, { stepDetail });

      let prompt = `Variable faltante: ${name}\nContexto actual: ${JSON.stringify(context)}\nDetalle del paso: ${stepDetail}\n\nGenera un valor realista y coherente para esta variable.`;

      // Policy Guardian V4.40: Specialized prompts for high-stakes variables
      const lowName = name.toLowerCase();
      if (lowName.includes('pass')) {
        prompt = `Genera una CONTRASEÑA para una cuenta de Microsoft (2026).
CRITERIOS OBLIGATORIOS:
1. Longitud: 14-18 caracteres.
2. Complejidad Máxima: Debe incluir AL MENOS 1 de cada:
   - Mayúsculas (A-Z)
   - Minúsculas (a-z)
   - Números (0-9)
   - Símbolos Específicos (!, @, #, $, %, &, *)
3. PROHIBICIÓN: No puede contener partes del nombre de usuario o nombre real.
4. Alta Entropía: Evita secuencias predecibles.
RESPUESTA: SOLO LA CONTRASEÑA.`;
      } else if (lowName.includes('user') || lowName.includes('member') || lowName.includes('email')) {
        prompt = `Genera un NOMBRE DE USUARIO (username) para Hotmail/Outlook.
REQUISITOS:
1. "Less Standard": No uses patrones genéricos ni simples. 
2. Alta Entropía: Combina nombres, palabras y números de forma creativa para EVITAR COLISIONES.
3. Formato: Solo la parte del nombre (sin @hotmail.com).
RESPUESTA: SOLO EL NOMBRE DE USUARIO.`;
      } else if (lowName.includes('identity') || lowName.includes('complete')) {
        prompt = `Genera una IDENTIDAD COMPLETA para una cuenta de Microsoft.
CAMPOS REQUERIDOS:
- username: Alta entropía, sin dominio.
- password: 14-18 caracteres, Símbolos, Mayúsculas, Números.
- name: Primer nombre realista.
- surname: Apellido realista.
- firstName: (same as name).
- lastName: (same as surname).
- random8: Cadena aleatoria de 8 caracteres alfanuméricos.
- random16_complex: Cadena aleatoria de 16 caracteres complex (letras, números, símbolos).
- birthMonth: 1-12.
- birthDay: 1-28.
- birthYear: 1988-2001.
RESPUESTA: JSON PURO.`;
      }

      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'Eres un RECUPERADOR DE DATOS RPA. Tu misión es generar el valor faltante para una variable basándote en el contexto. RESPUEDO SOLO CON EL VALOR, sin texto extra.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 100
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      const value = response.data.choices[0].message.content.trim();
      logger.info(`[HEALER] Variable ${name} restored: ${value}`);
      if (lowName.includes('pass')) {
        return this.isMicrosoftStrongPassword(value, [context?.username, context?.firstName1, context?.lastName1].filter(Boolean))
          ? value
          : this.buildMicrosoftStrongPassword(context || {});
      }
      if (lowName.includes('user') || lowName.includes('member') || lowName.includes('email')) {
        return this.isLowQualityUsername(value)
          ? this.buildHumanLikeUsername(context?.firstName, context?.lastName)
          : this.splitEmailParts(value).localPart || value;
      }
      return value;
    } catch (e: any) {
      logger.error('Variable healing failed', { error: e.message });
      return `[ERROR_HEALING_${name}]`;
    }
  }

  /**
   * Static AI Name Generation for Browser Engine (V4.41)
   */
  public static async generateAIName(originalName: string, firstName: string = '', lastName: string = ''): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return this.buildHumanLikeUsername(firstName || originalName, lastName);

    try {
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'Eres un GENERADOR DE USUARIOS RPA. Crea un nombre de usuario ÚNICO y de ALTA ENTROPÍA para Hotmail.'
          },
          {
            role: 'user',
            content: `Original: ${originalName}\nNombre: ${firstName} ${lastName}\nQUANTUM SALT (UUID): ${Date.now()}-${Math.random().toString(16).substring(2, 14)}\nENTROPY BURST: Genera un nombre que sea TOTALMENTE ÚNICO y CREATIVO. EVITA CUALQUIER PATRÓN (No uses nombres+año). Esta sal es un REQUISITO DE UNICIDAD GLOBAL ABSOLUTA. SOLO EL NOMBRE (sin dominio).`
          }
        ],
        temperature: 0.9,
        max_tokens: 50
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      return response.data.choices[0].message.content.trim().replace(/@.*$/, '').replace(/["']/g, '');
    } catch (e) {
      return this.buildHumanLikeUsername(firstName || originalName, lastName);
    }
  }

  /**
   * Predict ban risk using AI
   */
  static async predictBanRisk(profileData: any): Promise<number> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return 0.05; // Default safe risk

    try {
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.1-8b-instant', // Fast model for risk check
        messages: [
          {
            role: 'system',
            content: 'Eres un ANALISTA DE RIESGO ANTI-BOT. Tu tarea es analizar los datos de un perfil y predecir la probabilidad de baneo (0 a 1). Responde solo con el número.'
          },
          { role: 'user', content: `Analiza este perfil para riesgo de baneo: ${JSON.stringify(profileData)}` }
        ],
        temperature: 0.1
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      const risk = parseFloat(response.data.choices[0].message.content.trim());
      return isNaN(risk) ? 0.1 : risk;
    } catch (e) {
      return 0.15; // Conservative fallback
    }
  }

  /**
   * Main entry point to run a V2 Flow
   */
  static async runFlow(flowId: string, tenantId: string, variables: Record<string, any> = {}, existingRunId?: string) {
    logger.info(`[SENTINEL-RUNFLOW] Entering runFlow for flowId: ${flowId}`, { tenantId });
    const flow = await (prisma as any).flow.findUnique({
      where: { id: flowId },
    });

    if (!flow) throw new Error('Flow not found');

    // 1. Create or reuse FlowRun record
    const flowRun = existingRunId
      ? await (prisma as any).flowRun.findUnique({
          where: { id: existingRunId }
        })
      : await (prisma as any).flowRun.create({
          data: {
            flowId: flow.id,
            tenantId,
            status: 'running',
            startedAt: new Date(),
          }
        });

    if (!flowRun) {
      throw new Error(`FlowRun not found for execution: ${existingRunId}`);
    }

    // --- PHASE 3: RESUME LOGIC (V4) ---
    let startStepIndex = 0;
    let checkpoint: any = null;
    if (existingRunId) {
      checkpoint = await this.resolveLastCheckpoint(existingRunId);
      if (checkpoint) {
        startStepIndex = checkpoint.stepIndex + 1;
        Object.assign(variables, checkpoint.variables);
        logger.info(`[RESUME] Resuming flow ${flowId} from step ${startStepIndex}`);
      }
    }
    const initialRunResult = flowRun.result && typeof flowRun.result === 'object'
      ? JSON.parse(JSON.stringify(flowRun.result))
      : {};

    // 4.35 Titanium Core: Deep clone to prevent state leakage across parallel runs
    const deepClone = JSON.parse(JSON.stringify(variables));

    // 4.50 Zero-G: Deterministic Alias Guard
    const normalizedVars = this.hydrateCanonicalVariables({ ...deepClone });
    const aliases: Record<string, string[]> = {
      password: ['contraseña', 'pass', 'pw', 'clave', 'contrasena', 'contraseña1', 'password1'],
      firstName: ['nombre', 'primer_nombre', 'firstName', 'firstName1', 'nombre1'],
      lastName: ['apellido', 'last_name', 'family_name', 'lastName1', 'apellido1'],
      username: ['email', 'user', 'account', 'correo', 'usuario', 'username1', 'email1']
    };

    for (const [key, altKeys] of Object.entries(aliases)) {
      if (!normalizedVars[key]) {
        for (const alt of altKeys) {
          if (deepClone[alt]) {
            normalizedVars[key] = deepClone[alt];
            logger.info(`[ZERO-G] Alias Guard: Mapping '${alt}' to '${key}'`);
            break;
          }
        }
      }
    }

    const autoVariables: Record<string, any> = {
      ...normalizedVars,
      run_id: flowRun.id.substring(0, 8),
      timestamp: new Date().toISOString(),
      random: Math.floor(Math.random() * 1000)
    };
    const aggregatedResult: any = {};
    this.syncBrowserProfileIdentity(autoVariables);

    let page: Page | null = null;
    let flowContract = FlowContractService.buildFlowContract(flow.steps as any[] || []);

    try {
      const executionProfile = await this.resolveExecutionProfile(tenantId, normalizedVars);
      autoVariables.profileId = executionProfile.id;
      autoVariables.profileName = executionProfile.name;

      page = await BrowserNodeService.createPage(
        executionProfile.id,
        executionProfile.fingerprint,
        executionProfile.proxyConfig,
        checkpoint?.state
      );
      const rawSteps = flow.steps as any[];
      flowContract = FlowContractService.buildFlowContract(rawSteps || []);
      const contractByIndex = new Map(flowContract.steps.map((contractStep, index) => [index, contractStep]));
      const invertedSteps: Array<{ resolvedStep: any, runStep: any, idx: number }> = [];

      for (let idx = 0; idx < rawSteps.length; idx++) {
        // --- PHASE 3: RESUME GATE (V4) ---
        if (idx < startStepIndex) {
          logger.info(`[RESUME] Skipping step ${idx} (already completed)`);
          continue;
        }

        const rawStep = rawSteps[idx];

        // --- NORMALIZATION LAYER ---
        // 1. Normalize Type (lowercase, no spaces)
        let type = (rawStep.type || 'wait').toLowerCase().replace(/\s+/g, '_');

        // 2. Map Aliases
        const typeMap: Record<string, string> = {
          'smart_prompt': 'prompt',
          'wait_for_element': 'wait_for_selector',
          'waitforselector': 'wait_for_selector',
          'wait_for_selector': 'wait_for_selector',
          'select_option': 'select',
          'navigate': 'navigate',
          'pressandhold': 'press_and_hold'
        };
        type = typeMap[type] || type;

        // 3. Normalize Config/Params (Prioritize non-empty params from user)
        let config: any = {};
        if (rawStep.config && typeof rawStep.config === 'object') config = { ...rawStep.config };
        const params = rawStep.params || rawStep.parameters || {};
        if (params && typeof params === 'object' && Object.keys(params).length > 0) {
          config = { ...config, ...params };
        }

        const step = { ...rawStep, type, config };
        // --- END NORMALIZATION ---

        if (page) {
          try {
            const screenshot = await page.screenshot({ type: 'jpeg', quality: 50 });
            await (prisma as any).flowRun.update({
              where: { id: flowRun.id },
              data: {
                lastScreenshot: `data:image/jpeg;base64,${screenshot.toString('base64')}`,
                liveStepId: step.id || `step-${idx}`
              }
            });
          } catch (e) { /* ignore */ }
        }

        const resolvedStep = {
          ...step,
          contract: contractByIndex.get(idx),
          config: await this.substituteVariables(step.config, autoVariables, `Directorio actual del flow: ${idx}/${rawSteps.length}`)
        };

        const runStep = await (prisma as any).flowRunStep.create({
          data: {
            runId: flowRun.id,
            stepId: step.id || `step-${idx}`,
            status: 'running',
            startedAt: new Date(),
          }
        });

        // Quantum Rescue V4.55: If simulation was used and API key is now active, REGENERATE.
        if (autoVariables.isSimulation && GroqService.API_KEY) {
          logger.info('[QUANTUM-RESCUE] API Key discovered mid-flow. Replacing simulation data with High Fidelity AI identity...');
          const rescuePrompt = { 
            type: 'prompt', 
            config: { prompt: "Genera una identidad completa para Hotmail: username, password, firstName, lastName, birthMonth, birthDay, birthYear" } 
          };
          const rescueResult = await (this as any).executeStep(rescuePrompt, page, autoVariables);
          if (rescueResult.status === 'completed' && rescueResult.output) {
             delete autoVariables.isSimulation;
             Object.assign(autoVariables, rescueResult.output);
             this.syncBrowserProfileIdentity(autoVariables);
             logger.info('[QUANTUM-RESCUE] Identity successfully upgraded to High Fidelity.');
          }
        }

        // Execute step (Correctly route via executeStep dispatcher)
        const result = await (this as any).executeStep(resolvedStep, page, autoVariables);

        // --- PHASE 3: SESSION CHECKPOINT (V4) ---
        if (result.status === 'completed' && page) {
          await FlowExecutorService.saveStepCheckpoint(flowRun.id, idx, page, autoVariables);
        }

        if (result.output?.inversionDetected) {
          logger.warn(`[FLOW-EXECUTOR] Step ${step.id || idx} was deferred due to flow inversion. Queuing for later execution.`);
          invertedSteps.push({ resolvedStep, runStep, idx });
        }

        // Integration: Capture HEALED values from Browser (e.g. MS Signup suggestions)
        if (result.output?.healedValue) {
          logger.info(`[EXECUTOR] Variable healed by browser intervention`, { newValue: result.output.healedValue });
          // We need to know WHICH variable to update. 
          // Usually it's the one currently being substituted. 
          const placeholders = JSON.stringify(step.config).match(/\{{1,2}(.*?)\}{1,2}/g);
          if (placeholders) {
            placeholders.forEach(p => {
              const key = p.replace(/[\{\}]/g, '').trim();
              autoVariables[key] = result.output.healedValue;
            });
          }
          Object.assign(autoVariables, this.hydrateCanonicalVariables(autoVariables));
          this.syncBrowserProfileIdentity(autoVariables);
        }

        if (result.output && typeof result.output === 'object') {
          Object.assign(autoVariables, result.output);
          Object.assign(autoVariables, this.hydrateCanonicalVariables(autoVariables));
          this.syncBrowserProfileIdentity(autoVariables);

          // [SENTINEL-PERSISTENCE] Checkpoint: Save credentials to file system for BrowserNode identity rescue
          try {
            const fs = require('fs');
            if (autoVariables.username || autoVariables.email) {
              fs.writeFileSync('identity_cache.txt', autoVariables.email || autoVariables.username);
            }
            if (autoVariables.password) {
              fs.writeFileSync('password_cache.txt', autoVariables.password);
            }
            // Sync with JSON cache for full identity rescue
            const legacyCache = {
              username: autoVariables.username,
              email: autoVariables.email,
              password: autoVariables.password,
              firstName: autoVariables.firstName || autoVariables.name,
              lastName: autoVariables.lastName || autoVariables.surname,
              name: autoVariables.name || autoVariables.firstName,
              surname: autoVariables.surname || autoVariables.lastName,
              random8: autoVariables.random8,
              random16_complex: autoVariables.random16_complex,
              birthMonth: autoVariables.birthMonth,
              birthDay: autoVariables.birthDay,
              birthYear: autoVariables.birthYear
            };
            fs.writeFileSync('identity_cache.json', JSON.stringify(legacyCache, null, 2));
          } catch (e: any) {
            logger.warn('[SENTINEL-PERSISTENCE] Failed to sync identity to file system', { error: e.message });
          }

          // [SENTINEL-PERSISTENCE] Checkpoint: Save credentials as soon as they are generated/healed
          if ((autoVariables.email || autoVariables.username) && autoVariables.password) {
            await AccountStateService.persistFlowOutcome({
              tenantId,
              flowRunId: flowRun.id,
              variables: autoVariables,
              result: { ...aggregatedResult, ...result.output }
            }).catch(() => null);
          }
        }

        try {
          const fs = require('fs');
          if (fs.existsSync('password_cache.txt')) {
            const runtimePassword = String(fs.readFileSync('password_cache.txt', 'utf8') || '').trim();
            if (runtimePassword) {
              autoVariables.password = runtimePassword;
              autoVariables.password1 = runtimePassword;
            }
          }
        } catch (e) {}

        // Nuclear Stealth: Random human pause between steps
        await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 1000) + 800));

        await (prisma as any).flowRunStep.update({
          where: { id: runStep.id },
          data: {
            status: result.status,
            completedAt: new Date(),
            output: JSON.parse(JSON.stringify({
              ...(result.output || {}),
              contract: resolvedStep.contract || null,
              diagnostics: FlowRunAnalysisService.buildStepDiagnostics(result, resolvedStep.contract)
            })),
            error: result.error
          }
        });

        // [SENTINEL-PERSISTENCE] Aggregate result incrementally
        if (result.output) Object.assign(aggregatedResult, result.output);

        if (result.status === 'failed') {
          // Auto-Screenshot on Fail
          if (page) {
            try {
              const buffer = await page.screenshot({ type: 'jpeg', quality: 60 });
              await (prisma as any).flowRun.update({
                where: { id: flowRun.id },
                data: {
                  lastScreenshot: `data:image/jpeg;base64,${buffer.toString('base64')}`,
                  error: `Step ${step.id || idx} failed: ${result.error}`
                }
              });
            } catch (e) { /* ignore */ }
          }
          throw new Error(`Step ${step.id || idx} failed: ${result.error}`);
        }
      }

      // Play deferred inverted steps if necessary
      if (invertedSteps.length > 0) {
        logger.info(`[FLOW-EXECUTOR] Executing ${invertedSteps.length} deferred inverted steps...`);
        for (const inverted of invertedSteps) {
          const { resolvedStep, runStep, idx } = inverted;
          logger.info(`[FLOW-EXECUTOR] Replaying deferred step: ${resolvedStep.id || idx}`);
          const result = await (this as any).executeStep(resolvedStep, page, autoVariables);

          if (result.output && typeof result.output === 'object') {
            Object.assign(autoVariables, result.output);
            Object.assign(autoVariables, this.hydrateCanonicalVariables(autoVariables));
            this.syncBrowserProfileIdentity(autoVariables);
          }

          await (prisma as any).flowRunStep.update({
            where: { id: runStep.id },
            data: {
              status: result.status,
              completedAt: new Date(),
              output: JSON.parse(JSON.stringify({
                ...(result.output || {}),
                contract: resolvedStep.contract || null,
                diagnostics: FlowRunAnalysisService.buildStepDiagnostics(result, resolvedStep.contract)
              })),
              error: result.error
            }
          });

          if (result.status === 'failed') {
            throw new Error(`Deferred Step ${resolvedStep.id || idx} failed: ${result.error}`);
          }
        }
      }

      // 4.33 Stargate aggregated result is now built incrementally during the loop.
      // We still do a final merge just in case from the runStep history if needed, 
      // but the local aggregatedResult is the source of truth for the loop and catch block.

      // Stargate Sentinel V4.33: Final Victory Scan (Post-Steps)
      const currentFinalUrl = page.url().toLowerCase();
      const finalInboxUrl = currentFinalUrl.includes('outlook.live.com') || currentFinalUrl.includes('owa') || currentFinalUrl.includes('mail');
      const finalWelcome = await page.isVisible('text=Welcome, text=Bienvenido, #BreakTheIce, #O365_AppName_Title').catch(() => false);

      if (finalInboxUrl || finalWelcome) {
        logger.info('[STARGATE-SENTINEL] Final scan detected success markers. Overwriting signal...');
        aggregatedResult.healedValue = 'ACCOUNT_SUCCESS';
      }

      if (aggregatedResult.healedValue === 'ACCOUNT_SUCCESS' || aggregatedResult.message?.includes('ACCOUNT_SUCCESS')) {
        logger.info('--- TRUE VICTORY DETECTED ---');
        logger.info('Microsoft Account Creation confirmed by Victory Radar.');
        aggregatedResult.confirmedSuccess = true;

        // Supernova Success Proof (V4.29): Inbox Landing Verification
        try {
          logger.info('[SUPERNOVA] Navigating to Inbox for Definitive Proof...');
          await page.goto('https://outlook.live.com/mail/0/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { });
          await page.waitForTimeout(5000); // Wait for lobby to settle

          const lobbyScreenshot = await (this as any).executeStep({
            type: 'screenshot',
            config: { name: 'LOBBY_PROOF' }
          }, page, autoVariables);

          if (lobbyScreenshot.output) {
            Object.assign(aggregatedResult, lobbyScreenshot.output);
          }

          // Check for inbox markers
          const inLobby = await page.$('#O365_AppName_Title, [aria-label*="Outlook"], .ms-Icon--OutlookLogo').catch(() => null);
          if (inLobby) {
            logger.info('[SUPERNOVA] LOBBY VERIFIED: Account is 100% active and logged in.');
            aggregatedResult.inboxVerified = true;
          }
        } catch (lobbyErr) {
          logger.warn(`[SUPERNOVA] Lobby verification skipped/failed: ${lobbyErr.message}`);
        }

        // Obsidian Victory Proof (V4.26)
        try {
          const victoryScreenshot = await (this as any).executeStep({
            type: 'screenshot',
            config: { name: 'ACCOUNT_CREATION_PROOF' }
          }, page, autoVariables);
          if (victoryScreenshot.output) {
            Object.assign(aggregatedResult, victoryScreenshot.output);
          }
        } catch (screenshotErr) {
          logger.warn(`[OBSIDIAN] Failed to capture victory proof: ${screenshotErr.message}`);
        }
      }

      await this.waitForManualVerificationIfNeeded(page);

      const persistedAccount = await AccountStateService.persistFlowOutcome({
        tenantId,
        flowRunId: flowRun.id,
        variables: autoVariables,
        result: aggregatedResult
      }).catch((persistErr: any) => {
        logger.warn('Account persistence after flow success failed', { runId: flowRun.id, error: persistErr?.message });
        return null;
      });

      if (persistedAccount) {
        if (persistedAccount.inboxStatus === 'verified' || persistedAccount.inboxStatus === 'pending_check') {
          await InboxVerificationService.recordSandboxVerification({
            tenantId,
            accountId: persistedAccount.id,
            success: persistedAccount.inboxStatus === 'verified',
            mode: 'flow-outcome',
            note: persistedAccount.inboxStatus === 'verified' ? 'Flow produced verified inbox markers' : 'Flow produced success markers pending inbox verification',
            inboxStatusOverride: persistedAccount.inboxStatus as any
          }).catch(() => null);
        }
        aggregatedResult.accountId = persistedAccount.id;
        aggregatedResult.accountPersisted = true;
        aggregatedResult.accountState = {
          verified: persistedAccount.verified,
          inboxStatus: persistedAccount.inboxStatus,
          credentialStorage: persistedAccount.credentialStorage
        };
        const refreshedAccount = await AccountReputationService.refreshScore(persistedAccount.id, tenantId).catch(() => null);
        const warmup = await AccountReputationService.maybeAutoWarmup(persistedAccount.id, tenantId).catch(() => null);
        if (refreshedAccount) {
          aggregatedResult.accountReputation = (refreshedAccount.state as any)?.reputation || null;
        }
        if (warmup) {
          aggregatedResult.accountWarmup = warmup;
        }
      }

      await (prisma as any).flowRun.update({
        where: { id: flowRun.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          duration: Date.now() - new Date(flowRun.startedAt).getTime(),
          liveStepId: null,
          result: {
            ...initialRunResult,
            ...aggregatedResult,
            contractSnapshot: flowContract,
          }
        }
      });

      await WebhookService.trigger(tenantId, 'flow_completed', {
        flowId: flow.id,
        runId: flowRun.id,
        status: 'completed'
      });

    } catch (error: any) {
      logger.error('Flow execution failed', { flowId: flow.id, runId: flowRun.id, error: error.message });
      
      // [SENTINEL-PERSISTENCE] Fatal Recovery: Attempt one last persistence of whatever we gathered
      if ((autoVariables.email || autoVariables.username) && autoVariables.password) {
        logger.info('[SENTINEL] Attempting emergency credential save for failed flow...');
        await AccountStateService.persistFlowOutcome({
          tenantId,
          flowRunId: flowRun.id,
          variables: autoVariables,
          result: aggregatedResult
        }).catch(() => null);
      }

      await (prisma as any).flowRun.update({
        where: { id: flowRun.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          duration: Date.now() - new Date(flowRun.startedAt).getTime(),
          liveStepId: null,
          error: error.message,
          result: {
            ...initialRunResult,
            contractSnapshot: flowContract,
            failedAt: new Date().toISOString(),
          }
        }
      });
      await WebhookService.trigger(tenantId, 'flow_failed', {
        flowId: flow.id,
        runId: flowRun.id,
        status: 'failed',
        error: error.message
      });
    } finally {
      if (page) {
        await page.close().catch(e => logger.error('Error closing page', { error: e.message }));
      }
    }
    return flowRun;
  }

  private static normalizeStep(step: any, variables: Record<string, any>) {
    const rawType = (step?.type || 'wait').toLowerCase().replace(/\s+/g, '_');
    const typeMap: Record<string, string> = {
      smart_prompt: 'prompt',
      wait_for_element: 'wait_for_selector',
      waitforselector: 'wait_for_selector',
      select_option: 'select',
    };
    const type = typeMap[rawType] || rawType;
    const mergedConfig = {
      ...(step?.config || {}),
      ...(step?.params || {}),
      ...(step?.parameters || {})
    };

    const resolveValue = (keys: string[]) => {
      for (const key of keys) {
        if (mergedConfig[key] !== undefined && mergedConfig[key] !== '') return mergedConfig[key];
        const foundKey = Object.keys(mergedConfig).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
        if (foundKey && mergedConfig[foundKey] !== undefined && mergedConfig[foundKey] !== '') {
          return mergedConfig[foundKey];
        }
      }
      return undefined;
    };

    const normalizedConfig: any = { ...mergedConfig };
    normalizedConfig.selector = resolveValue(['selector', 'id', 'css', 'xpath', 'target', 'element', 'sel']);
    normalizedConfig.timeout = resolveValue(['timeout', 'wait', 'delay', 'ms']);

    if (type === 'navigate') {
      normalizedConfig.url = resolveValue(['url', 'targetUrl', 'target_url', 'href', 'uri', 'target']);
      if (normalizedConfig.url && !String(normalizedConfig.url).startsWith('http')) {
        normalizedConfig.url = `https://${normalizedConfig.url}`;
      }
    }

    if (type === 'type') {
      normalizedConfig.text = resolveValue(['text', 'value', 'content', 'input', 'val']);
      if (typeof normalizedConfig.text === 'string') {
        normalizedConfig.text = normalizedConfig.text.replace(/\{{1,2}([a-zA-Z0-9_.\u00C0-\u00FF]+)\}{1,2}/g, (_, name) => {
          const resolved = name.split('.').reduce((acc: any, part: string) => (acc && typeof acc === 'object' ? acc[part] : undefined), variables);
          return resolved === undefined ? '' : String(resolved);
        });
      }
    }

    if (type === 'select') {
      normalizedConfig.value = resolveValue(['value', 'optionValue', 'selection', 'option']);
    }

    if (type === 'wait') {
      normalizedConfig.duration = resolveValue(['duration', 'ms', 'wait', 'timeout']);
    }

    if (type === 'screenshot') {
      normalizedConfig.path = resolveValue(['path', 'name']);
    }

    return {
      ...step,
      type,
      config: normalizedConfig
    };
  }

  private static async applyPromptIdentityHealing(output: Record<string, any>, promptText: string, tenantId?: string, fingerprint?: any) {
    const lowPrompt = promptText.toLowerCase();
    const requestedDomain = lowPrompt.includes('outlook') ? '@outlook.com' : lowPrompt.includes('hotmail') ? '@hotmail.com' : '';
    let next = await this.enforceCredentialQuality(tenantId, output, fingerprint);
    if (!requestedDomain) return next;

    const usernameKey = Object.keys(next).find((key) => ['username', 'user', 'membername', 'email'].includes(key.toLowerCase()));
    if (!usernameKey) return next;

    const usernameValue = next[usernameKey];
    if (typeof usernameValue !== 'string') return next;

    const { localPart, domain } = this.splitEmailParts(usernameValue);
    next[usernameKey] = localPart || usernameValue;

    if (!next.email) {
      next.email = `${next[usernameKey]}${domain || requestedDomain}`;
    }

    return await this.enforceCredentialQuality(tenantId, next, fingerprint);
  }

  private static syncBrowserProfileIdentity(variables: Record<string, any> = {}) {
    const firstName = String(variables.firstName || variables.firstName1 || '').trim();
    const lastName = String(variables.lastName || variables.lastName1 || '').trim();
    BrowserNodeService.seedProfileIdentity(firstName, lastName);
  }

  private static async executeStep(step: any, page: Page, variables: Record<string, any>): Promise<StepExecuteResult> {
    const normalizedStep = this.normalizeStep(step, variables);
    const { type, config } = normalizedStep;
    logger.info(`[EXECUTOR] Executing ${type}`, { stepId: step.id, config });

    try {
      if (type === 'prompt') {
        const apiKey = GroqService.API_KEY || process.env.GROQ_API_KEY;
        const promptText = config.prompt || config.text || '';

        // Validation Schema (Universal yet restrictive)
        const outputSchema = z.record(z.string(), z.any()).refine((data: any) => {
          // Discard extra junk like IBAN if not explicitly asked
          const bannedKeys = ['iban', 'bank', 'credit_card', 'cvv'];
          const keys = Object.keys(data).map(k => k.toLowerCase());
          return !keys.some(k => bannedKeys.includes(k) && !promptText.toLowerCase().includes(k));
        }, { message: "AI generated forbidden/irrelevant keys (IBAN/Bank leakage prevented)" });

        if (!apiKey) {
          logger.warn('GROQ_API_KEY not found, using simulation.');
          const simulated = { 
              username: 'user' + Math.floor(Math.random() * 100000), 
              password: 'SafePass!' + Math.floor(Math.random() * 999),
              firstName: 'Sim', 
              lastName: 'User', 
              birthMonth: '1', 
              birthDay: '1', 
              birthYear: '1995',
              isSimulation: true 
          };
          return { status: 'completed', output: simulated };
        }

        const parsed = await retry(async (bail) => {
          try {
            logger.info('Calling Groq API for Smart Prompt (Llama-3.3-HighFidelity)...');
            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
              model: 'llama-3.3-70b-versatile',
              messages: [
                {
                  role: 'system',
                  content: 'Eres un GENERADOR DE DATOS REALISTAS PARA RPA. Tu única misión es proveer valores de ALTA CALIDAD y REALISTAS para cada campo solicitado. REGLAS:\n1. Solo devuelve JSON puro.\n2. NUNCA dejes valores vacíos ("") ni nulos. Siempre inventa datos (nombres reales, contraseñas fuertes, etc.).\n3. Respeta ESTRÍCTAMENTE los nombres de las llaves (keys) solicitadas en el prompt.\n4. No añadas explicaciones ni markdown.'
                },
                { role: 'user', content: `Genera datos realistas para este objeto JSON: ${promptText}` }
              ],
              temperature: 0.8,
              response_format: { type: 'json_object' }
            }, {
              headers: { 'Authorization': `Bearer ${apiKey}` },
              timeout: 30000 
            });

            const resultData = response.data.choices[0].message.content;
            return typeof resultData === 'string' ? JSON.parse(resultData) : resultData;
          } catch (err: any) {
            if (err.response?.status === 401 || err.response?.status === 403) {
              bail(new Error('Auth failure at Groq API'));
              return;
            }
            throw err;
          }
        }, {
          retries: 3, 
          minTimeout: 2000,
          onRetry: (err: any) => logger.warn('Smart Prompt failed, retrying...', { error: err.message })
        }).catch((finalOuterError: any) => {
          logger.error('Groq AI prompt failed after retries, falling back to simulation', { error: finalOuterError.message });
          return { 
            username: 'user' + Math.floor(Math.random() * 100000), 
            password: 'SafePass!' + Math.floor(Math.random() * 999),
            firstName: 'Sim', 
            lastName: 'User', 
            birthMonth: '1', 
            birthDay: '1', 
            birthYear: '1995',
            isSimulation: true 
          };
        });

          // Apply Guardrail Validation
          try {
            outputSchema.parse(parsed);
          } catch (zodErr: any) {
            logger.warn('Zod rejected AI result', { error: zodErr.message });
            return { status: 'failed', error: `AI leakage prevention triggered: ${zodErr.message}` };
          }

          // Transform keys to camelCase to match flow variables reliably
          const toCamelCase = (str: string) => {
            return str
              .replace(/[\s_-]+(.)/g, (_, c) => c.toUpperCase())
              .replace(/^[A-Z]/, c => c.toLowerCase());
          };
          
          const camelCasedParsed: any = {};
          for (const key of Object.keys(parsed)) {
            camelCasedParsed[toCamelCase(key)] = parsed[key];
          }

          const healedPromptOutput = this.applyPromptIdentityHealing(camelCasedParsed, promptText);
          logger.info('Smart Prompt JSON received and validated', { keys: Object.keys(healedPromptOutput) });
          return { status: 'completed', output: healedPromptOutput };
        }

        const browserStepTypes = ['navigate', 'click', 'type', 'wait', 'screenshot', 'select', 'wait_for_selector', 'waitforselector', 'wait_for_navigation', 'press_and_hold'];
      if (browserStepTypes.includes(type.toLowerCase())) {
        // Final Bridge: Create a CLEAN and LEAN config for the executor
        const finalCleanConfig: any = {
          selector: config.selector,
          timeout: config.timeout
        };

        const lowType = type.toLowerCase();
        if (lowType === 'navigate') finalCleanConfig.url = config.url;
        if (lowType === 'type') finalCleanConfig.text = config.text;
        if (lowType === 'select') finalCleanConfig.value = config.value;
        if (lowType === 'wait') finalCleanConfig.duration = config.duration || config.ms || config.wait;
        if (lowType === 'screenshot') finalCleanConfig.path = config.path || config.name;
        if (lowType === 'press_and_hold') finalCleanConfig.durationMs = config.durationMs || config.holdMs;

        logger.info(`[EXECUTOR] Dispatching Lean-Config to BrowserNode`, {
          type,
          cleanKeys: Object.keys(finalCleanConfig),
          selector: finalCleanConfig.selector
        });

        if (lowType === 'navigate' && !finalCleanConfig.url) {
          throw new Error('URL is required for navigate step');
        }

        if (['click', 'type', 'waitforselector', 'wait_for_selector', 'select', 'press_and_hold'].includes(lowType) && !finalCleanConfig.selector) {
          throw new Error(`Selector is required for ${type} step.`);
        }
        if (lowType === 'press_and_hold' && !finalCleanConfig.durationMs) {
          throw new Error('durationMs is required for press_and_hold step.');
        }

        const dispatchedType = lowType === 'waitforselector' ? 'wait_for_selector' : type;
        try {
          const browserResult = await retry(async () => {
            return await BrowserNodeService.executeBrowserStep(page, { type: dispatchedType, config: finalCleanConfig });
          }, {
            retries: 3,
            minTimeout: 150,
            maxTimeout: 400,
          });

          if (browserResult?.status === 'failed') {
            let diagnostic: string | undefined;
            try {
              diagnostic = await (BrowserNodeService as any).captureDiagnostic?.(page, normalizedStep.id || dispatchedType);
            } catch {
              diagnostic = undefined;
            }
            return { ...browserResult, diagnostic };
          }

          return browserResult;
        } catch (error: any) {
          let diagnostic: string | undefined;
          try {
            diagnostic = await (BrowserNodeService as any).captureDiagnostic?.(page, normalizedStep.id || dispatchedType);
          } catch {
            diagnostic = undefined;
          }
          return { status: 'failed', error: error.message, diagnostic };
        }
      }

      switch (type) {
        case 'conditional':
          const selector = config.selector || config.condition?.replace('if ', '').replace(' exists', '').trim();
          const branchSteps = config.trueSteps || config.conditions?.[0]?.steps || [];
          const elseSteps = config.elseSteps || config.conditions?.[1]?.steps || [];

          if (!selector) throw new Error('Conditional requires a selector');

          try {
            await page.waitForSelector(selector, { timeout: 8000, state: 'attached' });
            logger.info('Condition met, executing branch', { selector });
            for (const bStep of branchSteps) {
              const normalizedB = {
                ...this.normalizeStep(bStep, variables),
                config: await this.substituteVariables((bStep.config || bStep.params || bStep.parameters || {}), variables, `Sub-paso condicional para selector: ${selector}`)
              };
              await FlowExecutorService.executeStep(normalizedB, page, variables);
            }
            return { status: 'completed', output: { branchExecuted: 'true', selector } };
          } catch (err) {
            logger.debug(`Optional Roadblock not present`, { selector });
            for (const bStep of elseSteps) {
              const normalizedB = {
                ...this.normalizeStep(bStep, variables),
                config: await this.substituteVariables((bStep.config || bStep.params || bStep.parameters || {}), variables, `Else-step condicional para selector: ${selector}`)
              };
              await FlowExecutorService.executeStep(normalizedB, page, variables);
            }
            return { status: 'completed', output: { branchExecuted: 'false', selector } };
          }

        default:
          return { status: 'completed', output: { info: `Step type ${type} executed` } };
      }
    } catch (error: any) {
      logger.error(`Execution failed for ${type}`, { error: error.message });
      return { status: 'failed', error: error.message };
    }
  }
}
