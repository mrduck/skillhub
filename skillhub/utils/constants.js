// 常量定义 - 平台信息、分类等

// 平台信息映射
const PLATFORMS = [
  { id: 'claude-code', name: 'Claude Code', installPath: '.claude/skills/' },
  { id: 'cursor', name: 'Cursor', installPath: '.cursor/rules/' },
  { id: 'trae', name: 'TRAE', installPath: '.trae/skills/' },
  { id: 'windsurf', name: 'Windsurf', installPath: '.windsurf/rules/' },
  { id: 'copilot', name: 'GitHub Copilot', installPath: '.github/copilot-instructions/' },
  { id: 'codex', name: 'Codex', installPath: '.codex/skills/' },
  { id: 'gemini-cli', name: 'Gemini CLI', installPath: '.gemini/skills/' }
];

// 分类预设
const CATEGORIES = [
  '前端开发',
  '后端开发',
  'AI 开发',
  'DevOps',
  '测试',
  '文档',
  '安全',
  '移动开发',
  '数据库',
  '架构'
];

// 收藏限制
const MAX_FREE_FAVORITES = 10;

// Lemon Squeezy 购买链接
const LEMON_SQUEEZY_URL = 'https://store.lemonsqueezy.com/skillhub';

export { PLATFORMS, CATEGORIES, MAX_FREE_FAVORITES, LEMON_SQUEEZY_URL };