export interface SelectorAssistSuggestion {
  selector: string;
  score: number;
  source: string;
  label: string;
}

export class SelectorAssistService {
  static analyzeSnapshot(snapshot: string, target: { label: string; controlKind?: string; localeHints?: string[] }) {
    const tokens = this.buildTokens(target.label, target.localeHints || []);
    const attrCandidates = this.extractAttributeCandidates(snapshot);
    const scored = attrCandidates
      .map((candidate) => ({
        ...candidate,
        score: this.scoreCandidate(candidate.label, tokens, candidate.selector, target.controlKind),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    return {
      tokens,
      suggestions: scored,
    };
  }

  private static buildTokens(label: string, localeHints: string[]) {
    return Array.from(
      new Set(
        [label, ...localeHints]
          .flatMap((value) => value.toLowerCase().split(/[^a-z0-9@._-]+/i))
          .map((value) => value.trim())
          .filter(Boolean)
      )
    );
  }

  private static extractAttributeCandidates(snapshot: string): SelectorAssistSuggestion[] {
    const suggestions: SelectorAssistSuggestion[] = [];
    const patterns: Array<{ regex: RegExp; toSelector: (value: string) => string; source: string }> = [
      { regex: /\sid="([^"]+)"/gi, toSelector: (value) => `#${value}`, source: 'id' },
      { regex: /\sname="([^"]+)"/gi, toSelector: (value) => `[name="${value}"]`, source: 'name' },
      { regex: /\saria-label="([^"]+)"/gi, toSelector: (value) => `[aria-label="${value}"]`, source: 'aria-label' },
      { regex: /\splaceholder="([^"]+)"/gi, toSelector: (value) => `[placeholder="${value}"]`, source: 'placeholder' },
      { regex: /\sdata-testid="([^"]+)"/gi, toSelector: (value) => `[data-testid="${value}"]`, source: 'data-testid' },
      { regex: /\srole="([^"]+)"/gi, toSelector: (value) => `[role="${value}"]`, source: 'role' },
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(snapshot))) {
        const value = match[1]?.trim();
        if (!value) continue;
        suggestions.push({
          selector: pattern.toSelector(value),
          label: value,
          score: 0,
          source: pattern.source,
        });
      }
    }

    return Array.from(
      new Map(suggestions.map((item) => [`${item.source}:${item.selector}`, item])).values()
    );
  }

  private static scoreCandidate(label: string, tokens: string[], selector: string, controlKind?: string) {
    const haystack = `${label} ${selector}`.toLowerCase();
    let score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 3 : 0), 0);
    if (controlKind === 'combobox' && selector.includes('role=')) score += 2;
    if (controlKind === 'input' && (selector.includes('name=') || selector.startsWith('#'))) score += 2;
    if (label.length <= 2) score -= 1;
    return score;
  }
}
