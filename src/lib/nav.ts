/** 全站导航的唯一来源：顶栏与快捷键共用，顺序即显示顺序；路径不含语言前缀 */
export type PageId = 'home' | 'models' | 'model' | 'compare' | 'docs' | '404';

export interface NavItem {
  id: 'home' | 'models' | 'compare' | 'docs';
  href: string;
  key: string;
}

export const NAV: readonly NavItem[] = [
  { id: 'home', href: '/', key: 'H' },
  { id: 'models', href: '/models/', key: 'M' },
  { id: 'compare', href: '/compare/', key: 'C' },
  { id: 'docs', href: '/docs/', key: 'D' },
];

/** 模型详情页归属模型列表 */
export const navCurrent = (page: PageId) => (page === 'model' ? 'models' : page);

/** 反馈入口：GitHub Issues 新建页（中英双语模板） */
export const REPO_URL = 'https://github.com/Owlbay/modelinfo';
export const FEEDBACK_URL = `${REPO_URL}/issues/new/choose`;
/** 某个模型的数据更正：预填数据更正模板的模型 ID 字段 */
export const correctionUrl = (id: string) =>
  `${REPO_URL}/issues/new?template=data-correction.yml&model=${encodeURIComponent(id)}&title=${encodeURIComponent(`[数据 / Data] ${id}: `)}`;
