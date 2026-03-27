import { Page } from 'playwright';

export type BrowserControlKind = 'input' | 'password' | 'select' | 'combobox' | 'button' | 'textarea' | 'unknown';

export interface BrowserControlDescriptor {
  selector: string;
  kind: BrowserControlKind;
  tagName: string;
  type: string;
  role: string;
  visible: boolean;
}

export class BrowserControlService {
  static inferKindFromSelector(selector: string): BrowserControlKind {
    const low = (selector || '').toLowerCase();
    if (low.includes('password') || low.includes('passwd') || low.includes('type="password"')) return 'password';
    if (low.includes('[role="combobox"]') || low.includes('combobox')) return 'combobox';
    if (low.includes('select[') || low.startsWith('select') || low.includes('birthmonth') || low.includes('birthday')) return 'select';
    if (low.includes('textarea')) return 'textarea';
    if (low.includes('button') || low.includes('submit') || low.includes('next') || low.includes('siguiente')) return 'button';
    if (low.includes('input') || low.includes('member') || low.includes('loginfmt') || low.includes('firstname') || low.includes('lastname')) return 'input';
    return 'unknown';
  }

  static async classify(page: Page, selector: string): Promise<BrowserControlDescriptor> {
    const fallbackKind = this.inferKindFromSelector(selector);
    const descriptor = await page.evaluate((targetSelector) => {
      const el = document.querySelector(targetSelector) as HTMLElement | null;
      if (!el) {
        return null;
      }

      const style = window.getComputedStyle(el);
      return {
        tagName: el.tagName.toLowerCase(),
        type: (el.getAttribute('type') || '').toLowerCase(),
        role: (el.getAttribute('role') || '').toLowerCase(),
        visible: style.visibility !== 'hidden' && style.display !== 'none' && el.offsetWidth > 0 && el.offsetHeight > 0
      };
    }, selector).catch(() => null);

    if (!descriptor) {
      return {
        selector,
        kind: fallbackKind,
        tagName: '',
        type: '',
        role: '',
        visible: false,
      };
    }

    let kind: BrowserControlKind = fallbackKind;
    if (descriptor.tagName === 'select') kind = 'select';
    else if (descriptor.tagName === 'textarea') kind = 'textarea';
    else if (descriptor.type === 'password') kind = 'password';
    else if (descriptor.role === 'combobox') kind = 'combobox';
    else if (descriptor.tagName === 'button' || descriptor.type === 'submit') kind = 'button';
    else if (descriptor.tagName === 'input') kind = 'input';

    return {
      selector,
      kind,
      ...descriptor,
    };
  }
}
