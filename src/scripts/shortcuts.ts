import { NAV } from '../lib/nav';

/** 单键导航（H / M / C / D）与 / 聚焦搜索；输入框内、带修饰键时不触发 */
export function installShortcuts() {
  const prefix = document.documentElement.dataset.prefix ?? '';
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key === '/') {
      const search = document.querySelector<HTMLInputElement>('[data-search-input]');
      if (search) {
        e.preventDefault();
        search.focus();
      }
      return;
    }
    const item = NAV.find((n) => n.key === e.key.toUpperCase());
    const href = item && prefix + item.href;
    if (href && location.pathname !== href) location.href = href;
  });
}
