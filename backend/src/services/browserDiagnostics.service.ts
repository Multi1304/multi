import { Page } from 'playwright';

export class BrowserDiagnosticsService {
  static async captureVisibleFormContext(page: Page) {
    return await page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
      const isVisible = (el: Element | null) => {
        if (!el) return false;
        const node = el as HTMLElement;
        const style = window.getComputedStyle(node);
        return style.visibility !== 'hidden' && style.display !== 'none' && node.offsetWidth > 0 && node.offsetHeight > 0;
      };

      const describe = (el: Element) => {
        const node = el as HTMLElement;
        const tag = node.tagName.toLowerCase();
        const type = normalize(node.getAttribute('type'));
        const name = normalize(node.getAttribute('name'));
        const id = normalize(node.id);
        const placeholder = normalize(node.getAttribute('placeholder'));
        const ariaLabel = normalize(node.getAttribute('aria-label'));
        const role = normalize(node.getAttribute('role'));
        const text = normalize(node.textContent).slice(0, 60);
        const value = tag === 'input' || tag === 'select' || tag === 'textarea' ? normalize((node as HTMLInputElement).value).slice(0, 40) : '';
        const selectorParts = [
          id ? `#${id}` : '',
          name ? `${tag}[name="${name}"]` : '',
          ariaLabel ? `[aria-label*="${ariaLabel.slice(0, 20)}"]` : '',
          placeholder ? `[placeholder*="${placeholder.slice(0, 20)}"]` : '',
          role ? `[role="${role}"]` : '',
          text && (tag === 'button' || role === 'option' || role === 'combobox') ? `${tag}:has-text("${text.slice(0, 20)}")` : ''
        ].filter(Boolean);

        return {
          tag,
          type,
          role,
          name,
          id,
          ariaLabel,
          placeholder,
          value,
          text,
          selectorHints: selectorParts
        };
      };

      const selectors = [
        'input',
        'select',
        'textarea',
        'button',
        '[role="combobox"]',
        '[role="listbox"]',
        '[role="option"]'
      ];

      const items = Array.from(document.querySelectorAll(selectors.join(',')))
        .filter(isVisible)
        .slice(0, 20)
        .map(describe);

      return {
        title: normalize(document.title),
        items
      };
    }).catch(() => ({ title: '', items: [] as any[] }));
  }

  static async buildTimeoutDiagnostic(page: Page, primarySelector: string, stage: string) {
    const url = page.url();
    const context = await this.captureVisibleFormContext(page);

    const summarized = context.items.map((item: any, index: number) => {
      const attrs = [
        item.tag,
        item.type ? `type=${item.type}` : '',
        item.role ? `role=${item.role}` : '',
        item.name ? `name=${item.name}` : '',
        item.id ? `id=${item.id}` : '',
        item.ariaLabel ? `aria=${item.ariaLabel}` : '',
        item.placeholder ? `placeholder=${item.placeholder}` : '',
        item.value ? `value=${item.value}` : '',
        item.text ? `text=${item.text}` : ''
      ].filter(Boolean).join(', ');
      return `${index + 1}. ${attrs}`;
    });

    const expectedTokens = Array.from(new Set(
      primarySelector
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(token => token.length > 1)
    ));

    const suggestions = context.items
      .map((item: any) => {
        const searchable = [
          item.tag,
          item.type,
          item.role,
          item.name,
          item.id,
          item.ariaLabel,
          item.placeholder,
          item.text
        ].join(' ').toLowerCase();

        let score = 0;
        for (const token of expectedTokens) {
          if (searchable.includes(token)) score += 2;
          if (token === 'month' && /(mes|month)/i.test(searchable)) score += 4;
          if (token === 'day' && /(día|dia|day)/i.test(searchable)) score += 4;
          if (token === 'year' && /(año|ano|year)/i.test(searchable)) score += 4;
          if (token === 'birth' && /(birth|fecha|nacimiento)/i.test(searchable)) score += 4;
          if (token === 'country' && /(país|pais|country|región|region)/i.test(searchable)) score += 4;
        }

        if (item.tag === 'select' || item.role === 'combobox') score += 1;

        return {
          score,
          item,
          hint: (item.selectorHints || [])[0] || `${item.tag}${item.id ? `#${item.id}` : ''}`
        };
      })
      .filter((entry: any) => entry.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5)
      .map((entry: any, index: number) => {
        const item = entry.item;
        const label = [item.ariaLabel, item.placeholder, item.text, item.name, item.id].filter(Boolean)[0] || item.tag;
        return `${index + 1}. ${entry.hint} (match=${entry.score}, label=${label})`;
      });

    return {
      url,
      stage,
      title: context.title,
      controls: summarized,
      suggestions
    };
  }

  static async capturePreClickTrace(page: Page, selector: string) {
    return await page.evaluate((targetSelector) => {
      const normalize = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
      const isVisible = (el: Element | null) => {
        if (!el) return false;
        const node = el as HTMLElement;
        const style = window.getComputedStyle(node);
        return style.visibility !== 'hidden' && style.display !== 'none' && node.offsetWidth > 0 && node.offsetHeight > 0;
      };

      const target = document.querySelector(targetSelector);
      const visibleInputs = Array.from(document.querySelectorAll('input, select, textarea'))
        .filter(isVisible)
        .slice(0, 12)
        .map((node) => {
          const el = node as HTMLInputElement;
          return {
            tag: el.tagName.toLowerCase(),
            type: normalize(el.getAttribute('type')),
            name: normalize(el.getAttribute('name')),
            id: normalize(el.id),
            ariaLabel: normalize(el.getAttribute('aria-label')),
            placeholder: normalize(el.getAttribute('placeholder')),
            value: normalize(el.value).slice(0, 80)
          };
        });

      return {
        targetSelector,
        targetText: normalize(target?.textContent).slice(0, 120),
        activeElement: (() => {
          const active = document.activeElement as HTMLElement | null;
          if (!active) return '';
          return [active.tagName.toLowerCase(), active.id ? `#${active.id}` : '', active.getAttribute('name') ? `[name="${active.getAttribute('name')}"]` : '']
            .filter(Boolean)
            .join('');
        })(),
        visibleInputs,
        domainControls: visibleInputs.filter((item) => /@hotmail\.com|@outlook\.com|hotmail|outlook/.test(
          [item.value, item.placeholder, item.ariaLabel, item.name, item.id].join(' ').toLowerCase()
        ))
      };
    }, selector).catch(() => ({ targetSelector: selector, targetText: '', activeElement: '', visibleInputs: [] as any[], domainControls: [] as any[] }));
  }

  static async getVisibleValidationMessage(page: Page) {
    return await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('[role="alert"], .error, .error-text, .field-validation-error, .text-danger, .invalid-feedback, [aria-live="assertive"], [data-testid*="error"]'));
      const visible = candidates
        .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
        .find((text) => !!text);
      return visible || '';
    }).catch(() => '');
  }
}
