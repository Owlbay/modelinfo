/** 全站导航的唯一来源：顶栏与快捷键共用，顺序即显示顺序；路径不含语言前缀 */
export type PageId = 'home' | 'models' | 'model' | 'docs' | '404';

export interface NavItem {
  id: 'home' | 'models' | 'docs';
  href: string;
  key: string;
}

export const NAV: readonly NavItem[] = [
  { id: 'home', href: '/', key: 'H' },
  { id: 'models', href: '/models/', key: 'M' },
  { id: 'docs', href: '/docs/', key: 'D' },
];

/** 模型详情页归属模型列表 */
export const navCurrent = (page: PageId) => (page === 'model' ? 'models' : page);
