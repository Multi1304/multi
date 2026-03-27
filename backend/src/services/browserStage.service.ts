import { Page } from 'playwright';

export type BrowserStage = 'email' | 'password' | 'profile' | 'birth' | 'success' | 'captcha' | 'privacy_notice' | 'stay_signed_in' | 'passkey_interrupt' | 'session_continuity' | 'unknown';

export class BrowserStageService {
  static async detectMicrosoftStage(page: Page): Promise<BrowserStage> {
    const url = page.url().toLowerCase();
    if (url.includes('outlook.live.com/mail') || url.includes('/mail/')) return 'success';
    if (url.includes('privacynotice.account.microsoft.com')) return 'privacy_notice';
    if (url.includes('/interrupt/passkey/enroll')) return 'passkey_interrupt';

    return await page.evaluate(() => {
      const normalize = (value: string | null | undefined) => (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

      const isVisible = (el: Element | null) => {
        if (!el) return false;
        const node = el as HTMLElement;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const withinViewport =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth;
        return (
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          style.opacity !== '0' &&
          node.offsetWidth > 0 &&
          node.offsetHeight > 0 &&
          withinViewport
        );
      };

      const visible = (selector: string) => Array.from(document.querySelectorAll(selector)).some((el) => isVisible(el));
      const bodyText = normalize(document.body?.innerText || '');
      const visibleInputs = Array.from(document.querySelectorAll('input, textarea'))
        .filter((node) => isVisible(node))
        .map((node) => {
          const input = node as HTMLInputElement;
          return normalize([
            input.id,
            input.name,
            input.placeholder,
            input.getAttribute('aria-label'),
            input.type,
          ].join(' '));
        });

      // --- Success Path / Interrupt Detectors ---
      if (bodyText.includes('quiere mantener la sesion iniciada') || bodyText.includes('stay signed in')) return 'stay_signed_in';
      if (bodyText.includes('quiere continuar con el inicio de sesion') || bodyText.includes('want to continue signing in')) return 'session_continuity';
      if (bodyText.includes('no se pudo crear una clave de paso') || bodyText.includes('could not create a passkey')) return 'passkey_interrupt';
      if (bodyText.includes('una nota rapida acerca de su cuenta') || bodyText.includes('quick note about your account')) return 'privacy_notice';

      const hasVisibleProfileInput = visibleInputs.some((entry) =>
        /firstname|lastname|firstnameinput|lastnameinput|first name|last name|given|surname|family|nombre|apellido/.test(entry)
      );
      const hasVisibleProfileSurface =
        visible('#FirstName, #LastName, #firstNameInput, #lastNameInput, input[name="FirstName"], input[name="LastName"], input[name="firstNameInput"], input[name="lastNameInput"]') ||
        visible('input[placeholder*="Nombre"], input[placeholder*="Apellido"]') ||
        visible('input[aria-label*="Nombre"], input[aria-label*="Apellido"], input[aria-label*="First"], input[aria-label*="Last"]') ||
        hasVisibleProfileInput;
      const hasVisibleBirthSurface =
        visible('#BirthMonth, #BirthDay, #BirthYear, #Country') ||
        visible('#BirthMonthDropdown, #BirthDayDropdown, #countryDropdownId') ||
        visible('select[name="BirthMonth"], select[name="BirthDay"], input[name="BirthYear"], select[name="Country"]') ||
        visible('button[name="BirthMonth"], button[name="BirthDay"], button[name="countryDropdownName"]') ||
        visible('[aria-label*="Birth month"], [aria-label*="Birth day"], [aria-label*="Birth year"], [aria-label*="Country"]') ||
        visible('[aria-label*="Mes de nacimiento"], [aria-label*="Dia de nacimiento"], [aria-label*="Día de nacimiento"], [aria-label*="Ano de nacimiento"], [aria-label*="Año de nacimiento"], [aria-label*="Pais o region"], [aria-label*="País o región"]');
      const hasProfileCopy =
        /agregar el nombre|agregue su nombre|add your name|your first name|your last name/.test(bodyText);
      const hasBirthCopy =
        /fecha de nacimiento|birth date|month day year|add some details|agregar algunos detalles|country or region|mes de nacimiento|dia de nacimiento|día de nacimiento|ano de nacimiento|año de nacimiento/.test(bodyText);
      const hasHumanVerificationCopy =
        /demostremos que es un humano|manten presionado el boton|manten pulsado el boton|desafio accesible|press and hold|prove you're human|let's prove you're human|humano/.test(bodyText);

      if (visible('#O365_AppName_Title, .ms-Icon--OutlookLogo, #BreakTheIce')) return 'success';
      if (visible('#MemberName, #i0117, input[name="loginfmt"], input[type="email"]')) return 'email';

      if (
        visible('#Password, #i0118, input[name="passwd"], input[type="password"]') ||
        /crear la contrasena|create a password|elige una contrasena|las contrasenas deben tener/.test(bodyText)
      ) return 'password';

      if (visible('#FirstName, #LastName, input[name="firstNameInput"], input[name="lastNameInput"]')) return 'profile';
      // Birth stage requires at least one date-specific element to avoid misdetecting country dropdowns as birth month
      const hasDateElement = visible('#BirthMonth, #BirthDay, #BirthYear, select[name="BirthMonth"], input[name="BirthYear"], [aria-label*="Mes"], [aria-label*="Día"], [aria-label*="Año"]');
      if (hasDateElement || visible('#Country, select[name="Country"]')) {
           // Double check it's not JUST a country dropdown on a non-birth page
           if (hasDateElement) return 'birth';
      }

      if (hasVisibleProfileSurface || (hasProfileCopy && !hasVisibleBirthSurface)) return 'profile';
      if (hasVisibleBirthSurface || hasBirthCopy) return 'birth';

      const isCaptchaSelector = visible('#recaptcha, #arkose, iframe[src*="arkoselabs"]') ||
        visible('button[aria-label*="mant"], button[aria-label*="press"], [data-testid*="captcha"], [data-testid*="challenge"]');
      
      if (isCaptchaSelector || hasHumanVerificationCopy) {
        (window as any).__stageDebug = `Captcha matched. Selector: ${isCaptchaSelector}, Text: ${hasHumanVerificationCopy}`;
        return 'captcha';
      }

      return 'unknown';
    }).catch(() => 'unknown' as BrowserStage);
  }
}
