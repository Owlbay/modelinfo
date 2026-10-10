/** 主题：localStorage 记住选择，未选择时跟随系统；切换时整页交叉淡化 */
type Scheme = 'dark' | 'light';
const KEY = 'modelinfo.scheme';
const root = document.documentElement;
const mq = matchMedia('(prefers-color-scheme: light)');

const current = (): Scheme => (root.dataset.scheme === 'light' ? 'light' : 'dark');

function sync() {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim();
}

function apply(s: Scheme) {
  if (root.dataset.scheme === s) return sync();
  const run = () => {
    root.dataset.scheme = s;
    sync();
  };
  if (!document.startViewTransition) return run();
  root.dataset.vt = 'scheme';
  document.startViewTransition(run).finished.finally(() => delete root.dataset.vt);
}

export function initTheme() {
  mq.addEventListener('change', () => {
    if (!localStorage.getItem(KEY)) apply(mq.matches ? 'light' : 'dark');
  });
  document.addEventListener('click', (e) => {
    if (!(e.target as Element | null)?.closest('[data-theme-toggle]')) return;
    const next: Scheme = current() === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* 隐私模式忽略 */
    }
    apply(next);
  });
  sync();
}
