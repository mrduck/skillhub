// 数据源配置

// ╔══════════════════════════════════════════════════════════════╗
// ║  skills.sh API 当前不可用 (Vercel DEPLOYMENT_NOT_FOUND)       ║
// ║  数据源 A 暂时不可用，当前仅使用 C 层本地 + B 层 GitHub       ║
// ╚══════════════════════════════════════════════════════════════╝
// A 数据源: skills.sh API
const SKILLS_SH_API = {
  url: 'https://api.skills.sh/v1/skills',
  limit: 500,
  updateInterval: 3600
};

// B 数据源: GitHub awesome-agent-skills 仓库 (1424+ real skills, verified)
const GITHUB_AWESOME = {
  rawUrl: 'https://raw.githubusercontent.com/VoltAgent/awesome-agent-skills/main/README.md',
  updateInterval: 3600
};

// C 数据源: 本地精选数据（打包在插件内）
const LOCAL_SOURCE_PATH = 'data/skills.json';

export { SKILLS_SH_API, GITHUB_AWESOME, LOCAL_SOURCE_PATH };