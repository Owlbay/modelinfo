/**
 * 比较选择：存在 localStorage，模型列表、详情页与比较页共用，可跨页面累积。
 * 比较页以网址参数 ?m= 为准，打开后回写这里。
 */
export const COMPARE_MAX = 6;
const KEY = 'modelinfo.compare';
const EVENT = 'modelinfo:compare';

export function readPicked(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, COMPARE_MAX) : [];
  } catch {
    return [];
  }
}

export function writePicked(ids: string[]) {
  const list = [...new Set(ids)].slice(0, COMPARE_MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 隐私模式忽略 */
  }
  document.dispatchEvent(new CustomEvent(EVENT, { detail: list }));
}

/** 加入或移出；已满时返回 false 且不改动 */
export function togglePicked(id: string): boolean {
  const list = readPicked();
  if (list.includes(id)) {
    writePicked(list.filter((x) => x !== id));
    return true;
  }
  if (list.length >= COMPARE_MAX) return false;
  writePicked([...list, id]);
  return true;
}

/** 选择变化（本页或其他标签页） */
export function onPickedChange(fn: (ids: string[]) => void) {
  document.addEventListener(EVENT, () => fn(readPicked()));
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) fn(readPicked());
  });
}

/** 比较页地址：prefix 为语言前缀（<html data-prefix>） */
export const compareHref = (prefix: string, ids: string[]) =>
  `${prefix}/compare/${ids.length ? `?m=${ids.map(encodeURIComponent).join(',')}` : ''}`;
