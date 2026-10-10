/**
 * 复制按钮：事件委托，全站共用。
 * <button data-copy data-copy-text="…">：复制 data-copy-text；
 * 否则复制所在 [data-code] 内 <code> 的文本。按钮内 [data-copy-label] 显示状态，文案取自 data-copied / data-failed。
 */
export function installCopy() {
  document.addEventListener('click', async (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLButtonElement>('[data-copy]');
    if (!btn) return;
    const text = btn.dataset.copyText ?? btn.closest('[data-code]')?.querySelector('code')?.textContent ?? '';
    const label = btn.querySelector<HTMLElement>('[data-copy-label]');
    const idle = label?.textContent ?? '';
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      ok = fallbackCopy(text);
    }
    if (!label) return;
    label.textContent = (ok ? btn.dataset.copied : btn.dataset.failed) ?? idle;
    setTimeout(() => (label.textContent = idle), 1600);
  });
}

/** 剪贴板 API 不可用（非安全上下文、权限受限）时退回 execCommand */
function fallbackCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}
