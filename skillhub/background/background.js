import '../vendor/extpay.js'; // Side-effect: 注册 self.ExtPay
import { initDB, getAllSkills, getSkill, querySkills, bulkUpsertSkills, updateFavorite } from '../db/idb.js';
import { mergeSkills, mergeWithLocal } from '../utils/merge.js';
import { getFavorites, toggleFavorite, getFavoritesCount } from '../utils/favorites.js';
import { checkLicense, getUserInfo, EXTPAY_EXTENSION_ID } from '../utils/license.js';
import { SKILLS_SH_API, GITHUB_AWESOME, LOCAL_SOURCE_PATH } from '../data/sources.js';

// ExtPay 初始化（必须在 top-level 调用一次）
const extpay = self.ExtPay(EXTPAY_EXTENSION_ID);
extpay.startBackground();

// 收藏操作互斥锁，防止并发绕过上限
let favoriteLock = Promise.resolve();

// 监听支付完成事件
extpay.onPaid.addListener((user) => {
  console.log('[SkillHub] 用户已完成支付!', user.email);
  // 支付后更新 Pro 状态
  chrome.storage.local.set({ 'skillhub:proPaidAt': Date.now() });
});

// ============================================
// 初始化
// ============================================
chrome.runtime.onInstalled.addListener(async (details) => {
  // 初始化 IndexedDB
  await initDB();

  // 加载 C 层数据（本地精选）
  try {
    const response = await fetch(chrome.runtime.getURL('data/skills.json'));
    const localSkills = await response.json();
    // 为没有 rawUrl 的本地 skill 自动推导
    const enriched = localSkills.map(s => ({
      ...s,
      rawUrl: s.rawUrl || deriveRawUrl(s.sourceUrl, s.id)
    }));
    await bulkUpsertSkills(enriched);
    console.log(`[SkillHub] 本地数据加载完成，${enriched.length} 条`);
  } catch (e) {
    console.error('[ SkillHub] 加载本地数据失败:', e);
  }

  // 设置定时更新（每小时检查一次）
  chrome.alarms.create('skillhub-update', {
    periodInMinutes: 60
  });

  // 首次安装时立即触发一次 A+B 更新
  if (details.reason === 'install') {
    updateDataSources();
  }

  // 注册右键菜单
  setupContextMenus();
});

// 插件启动时也确保 DB 初始化
chrome.runtime.onStartup.addListener(async () => {
  await initDB();
});

// ============================================
// 定时更新
// ============================================
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'skillhub-update') {
    updateDataSources();
  }
});

// ============================================
// 右键菜单
// ============================================
function setupContextMenus() {
  // 清除旧菜单再重建，避免重复
  chrome.contextMenus.removeAll(() => {
    const platforms = [
      { id: 'claude-code', title: '安装为 Claude Code Skill' },
      { id: 'cursor', title: '安装为 Cursor Rule' },
      { id: 'trae', title: '安装为 TRAE Skill' },
      { id: 'windsurf', title: '安装为 Windsurf Rule' },
      { id: 'copilot', title: '安装为 Copilot Instruction' },
    ];

    chrome.contextMenus.create({
      id: 'skillhub-install',
      title: '使用 SkillHub 安装',
      contexts: ['link'],
      targetUrlPatterns: [
        '*://*.github.com/*/*.md*',
        '*://raw.githubusercontent.com/*/*.md*'
      ]
    });

    platforms.forEach(platform => {
      chrome.contextMenus.create({
        id: `install-${platform.id}`,
        parentId: 'skillhub-install',
        title: platform.title,
        contexts: ['link'],
        targetUrlPatterns: [
          '*://*.github.com/*/*.md*',
          '*://raw.githubusercontent.com/*/*.md*'
        ]
      });
    });

    chrome.contextMenus.create({
      id: 'skillhub-separator',
      parentId: 'skillhub-install',
      type: 'separator',
      contexts: ['link'],
      targetUrlPatterns: [
        '*://*.github.com/*/*.md*',
        '*://raw.githubusercontent.com/*/*.md*'
      ]
    });

    chrome.contextMenus.create({
      id: 'skillhub-favorite',
      parentId: 'skillhub-install',
      title: '⭐ 收藏到 SkillHub',
      contexts: ['link'],
      targetUrlPatterns: [
        '*://*.github.com/*/*.md*',
        '*://raw.githubusercontent.com/*/*.md*'
      ]
    });
  });
}

// 右键菜单点击处理
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl;
  if (!url) return;

  const filename = extractFilename(url);
  if (!filename) return;

  // 处理收藏
  if (info.menuItemId === 'skillhub-favorite') {
    const skillId = filename.replace('.md', '');
    const isPro = await checkLicense();
    const count = await getFavoritesCount();

    if (!isPro && count >= 10) {
      // 通知用户已达上限
      chrome.notifications?.create('skillhub-pro-limit', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'SkillHub · 收藏已达上限',
        message: `免费版最多收藏 10 个 Skill，升级 Pro 解锁无限收藏`,
      });
      return;
    }

    await toggleFavorite(skillId);
    await updateFavorite(skillId, true);
    // 尝试下载到本地（静默）
    chrome.downloads.download({
      url: url,
      filename: `skillhub/${filename}`,
      saveAs: false,
      conflictAction: 'overwrite'
    });
    return;
  }

  // 处理安装
  const platform = String(info.menuItemId).replace('install-', '');
  chrome.downloads.download({
    url: url,
    filename: `skillhub/${filename}`,
    saveAs: true
  });
});

// ============================================
// 消息处理
// ============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case 'GET_SKILLS':
      return { skills: await getAllSkills() };

    case 'GET_SKILL': {
      const skill = await getSkill(message.id);
      if (!skill) return { error: 'Skill not found' };
      // 兼容旧数据：rawUrl 缺失时自动推导
      if (!skill.rawUrl) {
        skill.rawUrl = deriveRawUrl(skill.sourceUrl, skill.id);
      }
      return { skill };
    }

    case 'SEARCH_SKILLS': {
      const skills = await querySkills(message.params);
      // 兼容旧数据：rawUrl 缺失时自动推导
      const enriched = skills.map(s =>
        s.rawUrl ? s : { ...s, rawUrl: deriveRawUrl(s.sourceUrl, s.id) }
      );
      return { skills: enriched, total: enriched.length };
    }

    case 'TOGGLE_FAVORITE': {
      // 互斥锁防止并发绕过上限
      return new Promise((resolve) => {
        favoriteLock = favoriteLock.then(async () => {
          console.log('[SkillHub] TOGGLE_FAVORITE 开始检查 license...');
          const isPro = await checkLicense();
          console.log('[SkillHub] isPro:', isPro);
          const favs = await getFavorites();
          const count = favs.length;
          console.log('[SkillHub] 当前收藏数:', count);

          // 免费版限制：最多收藏 10 个
          if (!isPro && count >= 10 && !favs.includes(message.skillId)) {
            console.log('[SkillHub] 返回 proLimit: true');
            resolve({ proLimit: true });
            return;
          }

          const isFavorited = await toggleFavorite(message.skillId);
          await updateFavorite(message.skillId, isFavorited);
          console.log('[SkillHub] 收藏切换完成:', isFavorited);
          resolve({ isFavorited, proLimit: false });
        }).catch(err => {
          console.error('[SkillHub] TOGGLE_FAVORITE 异常:', err);
          resolve({ error: err.message || String(err) });
        });
      });
    }

    case 'GET_FAVORITES': {
      const favs = await getFavorites();
      return { favorites: favs, totalFavorites: favs.length };
    }

    case 'CHECK_LICENSE': {
      // 在 SW callback 中重新获取 ExtPay 实例
      const _extpay = self.ExtPay(EXTPAY_EXTENSION_ID);
      let isPro = false;
      let email = null;
      try {
        const user = await _extpay.getUser();
        isPro = !!(user && user.paid);
        email = (user && user.email) || null;
      } catch (e) { /* 网络错误，返回 false */ }
      return { isPro, email };
    }

    case 'ACTIVATE_LICENSE':
      // ExtPay 不再使用手动 License Key，返回引导
      return { success: false, message: '请通过 "升级 Pro" 按钮在线支付' };

    case 'OPEN_PAYMENT_PAGE': {
      const _extpay2 = self.ExtPay(EXTPAY_EXTENSION_ID);
      try {
        await _extpay2.openPaymentPage();
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    case 'OPEN_LOGIN_PAGE': {
      const _extpay3 = self.ExtPay(EXTPAY_EXTENSION_ID);
      try {
        await _extpay3.openLoginPage();
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    case 'FORCE_UPDATE':
      await updateDataSources();
      return { success: true };

    case 'DOWNLOAD_SKILL': {
      if (!message.url) return { success: false, error: 'No URL' };
      try {
        await chrome.downloads.download({
          url: message.url,
          filename: `skillhub/${message.filename}`,
          saveAs: false,
          conflictAction: 'overwrite'
        });
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}

// ============================================
// 数据源更新
// ============================================
async function updateDataSources() {
  const lastUpdate = await getLastUpdateTime();
  const now = Date.now();

  // 一小时内不重复更新
  if (lastUpdate && (now - lastUpdate) < 3600 * 1000) {
    console.log('[SkillHub] 距上次更新不足1小时，跳过');
    return;
  }

  try {
    console.log('[SkillHub] 开始数据源更新...');

    // 并行拉取 A + B
    const [aSkills, bSkills] = await Promise.allSettled([
      fetchSkillsShApi(),
      fetchGitHubAwesome()
    ]);

    let allMerged = [];

    // 处理 A 数据源
    if (aSkills.status === 'fulfilled' && aSkills.value.length > 0) {
      console.log(`[SkillHub] skills.sh API: ${aSkills.value.length} 条`);
      if (bSkills.status === 'fulfilled' && bSkills.value.length > 0) {
        // A ∩ B 取交集
        const merged = mergeSkills(aSkills.value, bSkills.value);
        allMerged = [...allMerged, ...merged];
        console.log(`[SkillHub] A ∩ B 交集: ${merged.length} 条`);
      } else {
        // B 失败了，直接使用 A
        allMerged = [...allMerged, ...aSkills.value];
      }
    }

    if (bSkills.status === 'rejected') {
      console.warn('[SkillHub] GitHub Awesome 拉取失败:', bSkills.reason);
    } else {
      console.log(`[SkillHub] GitHub Awesome: ${bSkills.value.length} 条`);
    }

    if (aSkills.status === 'rejected') {
      console.warn('[SkillHub] skills.sh API 拉取失败:', aSkills.reason);
    }

    // 如果 A 完全失败但 B 有数据，单独用 B
    if (aSkills.status === 'rejected' && bSkills.status === 'fulfilled' && bSkills.value.length > 0) {
      allMerged = [...allMerged, ...bSkills.value];
    }

    // 与本地 C 层数据合并
    if (allMerged.length > 0) {
      const localSkills = await getAllSkills();
      const final = mergeWithLocal(localSkills, allMerged);

      if (final.length > localSkills.length) {
        const newCount = final.length - localSkills.length;
        await bulkUpsertSkills(final);
        console.log(`[SkillHub] 数据更新完成，新增 ${newCount} 条，总数 ${final.length}`);
      } else {
        console.log('[SkillHub] 无新数据，跳过更新');
      }
    } else {
      console.log('[SkillHub] 两个数据源均无数据，跳过更新');
    }

    await setLastUpdateTime(now);
  } catch (e) {
    console.error('[SkillHub] 数据更新失败:', e);
  }
}

// ============================================
// A 数据源: skills.sh API
// ============================================
async function fetchSkillsShApi() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${SKILLS_SH_API.url}?limit=${SKILLS_SH_API.limit}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SkillHub/1.0'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // API 可能返回 { skills: [...] } 或直接是数组
    const rawSkills = Array.isArray(data) ? data : (data.skills || data.data || []);

    // 规范化字段名
    return rawSkills.map(normalizeSkillFromApi);

  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn('[SkillHub] skills.sh API 请求超时');
    }
    throw e;
  }
}

// ============================================
// B 数据源: GitHub Awesome 仓库
// ============================================
async function fetchGitHubAwesome() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(GITHUB_AWESOME.rawUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/plain, text/markdown',
        'User-Agent': 'SkillHub/1.0'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const markdown = await response.text();
    return parseAwesomeReadme(markdown);

  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn('[SkillHub] GitHub Awesome 请求超时');
    }
    throw e;
  }
}

// 解析 GitHub Awesome 仓库 README，提取 Skill 条目
function parseAwesomeReadme(markdown) {
  const skills = [];
  const lines = markdown.split('\n');

  let currentCategory = 'Other';
  let inSkillsSection = false;

  for (const line of lines) {
    // 检测分类标题（## Section）
    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      const isSkillSection = h2Match[1].toLowerCase().includes('skill');
      inSkillsSection = isSkillSection;
      if (isSkillSection) {
        currentCategory = h2Match[1].trim();
      }
      continue;
    }

    // 检测子分类（### Subsection）
    const h3Match = line.match(/^###\s+(.+)/);
    if (h3Match && inSkillsSection) {
      currentCategory = h3Match[1].trim();
      continue;
    }

    // 仅在 Skills 相关区域解析
    if (!inSkillsSection && !line.trim().startsWith('- [')) {
      continue;
    }

    // 解析列表项: - [name](url) - description
    const listMatch = line.match(/^\s*[-*+]\s*\[([^\]]+)\]\(([^)]+)\)\s*(?:[-–—]\s*(.+))?/);
    if (!listMatch) continue;

    const [, name, url, description] = listMatch;

    // 根据 URL 生成唯一 id
    const id = generateSkillId(name, url);

    // 推断平台支持
    const platforms = inferPlatforms(name, description || '', markdown);

    // 推断标签
    const tags = inferTags(name, description || '', currentCategory);

    skills.push({
      id,
      name: name.trim(),
      description: (description || `${name} 的 AI 编程 Skill`).trim(),
      author: extractAuthorFromUrl(url),
      installs: 0,
      stars: 0,
      category: currentCategory,
      tags,
      platforms,
      installCommand: `npx skills add ${id}`,
      content: '',
      sourceUrl: url,
      rawUrl: deriveRawUrl(url, id),
      updatedAt: new Date().toISOString().split('T')[0],
      createdAt: '',
      isFavorited: false
    });
  }

  return skills;
}

// ============================================
// 辅助函数
// ============================================

// 从 skills.sh API 规范化 Skill 数据
function normalizeSkillFromApi(raw) {
  const id = raw.id || raw.name || raw.slug || '';
  const sourceUrl = raw.sourceUrl || raw.source_url || raw.repository || '';

  return {
    id,
    name: raw.name || raw.id || '',
    description: raw.description || '',
    author: raw.author || raw.maintainer || '',
    installs: raw.installs || raw.downloads || raw.install_count || 0,
    stars: raw.stars || raw.github_stars || 0,
    category: raw.category || raw.categories?.[0] || '',
    tags: raw.tags || raw.keywords || [],
    platforms: raw.platforms || raw.supported_platforms || [],
    installCommand: raw.installCommand || raw.install_command || `npx skills add ${id}`,
    content: raw.content || raw.readme || '',
    sourceUrl,
    rawUrl: raw.rawUrl || raw.raw_url || deriveRawUrl(sourceUrl, id),
    updatedAt: raw.updatedAt || raw.updated_at || '',
    createdAt: raw.createdAt || raw.created_at || '',
    isFavorited: false
  };
}

// 从 GitHub sourceUrl 推导 rawUrl（原始 .md 文件直链）
function deriveRawUrl(sourceUrl, skillId) {
  if (!sourceUrl) return '';

  try {
    const urlObj = new URL(sourceUrl);

    // 只处理 github.com
    if (!urlObj.hostname.includes('github.com')) return sourceUrl;

    const pathname = urlObj.pathname;
    // github.com/{owner}/{repo}/tree/{branch}/{path...}
    const match = pathname.match(/^\/([^/]+)\/([^/]+)\/(?:tree|blob)\/([^/]+)\/(.+)/);
    if (match) {
      const [, owner, repo, branch, path] = match;
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}/SKILL.md`;
    }

    // github.com/{owner}/{repo} (with nothing else)
    const simpleMatch = pathname.match(/^\/([^/]+)\/([^/]+)\/?$/);
    if (simpleMatch) {
      const [, owner, repo] = simpleMatch;
      return `https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${skillId}/SKILL.md`;
    }
  } catch {}

  return '';
}
function extractAuthorFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/').filter(Boolean);
    // github.com/author/repo/... → author
    if (parts.length >= 1) {
      return parts[0];
    }
  } catch {}
  return '';
}

// 生成 Skill 唯一 ID
function generateSkillId(name, url) {
  if (!url) return name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      // 使用 repo 名作为 id
      return parts[1].toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }
  } catch {}

  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// 根据 Skill 名称/描述推断适配平台
function inferPlatforms(name, description, fullText) {
  const platforms = [];
  const text = `${name} ${description} ${fullText}`.toLowerCase();

  const platformMap = {
    'claude-code': ['claude', 'anthropic', 'claude code'],
    'cursor': ['cursor'],
    'trae': ['trae'],
    'windsurf': ['windsurf'],
    'copilot': ['copilot', 'github copilot'],
    'codex': ['codex', 'openai codex'],
    'gemini-cli': ['gemini', 'gemini cli'],
  };

  for (const [platform, keywords] of Object.entries(platformMap)) {
    if (keywords.some(kw => text.includes(kw))) {
      platforms.push(platform);
    }
  }

  // 至少标记通用平台
  if (platforms.length === 0) {
    platforms.push('claude-code', 'cursor');
  }

  return platforms;
}

// 推断标签
function inferTags(name, description, category) {
  const tags = new Set();
  const text = `${name} ${description} ${category}`.toLowerCase();

  const tagPatterns = [
    { tag: 'frontend', keywords: ['frontend', 'react', 'vue', 'angular', 'css', 'html', 'ui', 'design', '前端'] },
    { tag: 'backend', keywords: ['backend', 'api', 'server', 'express', 'fastapi', '后端'] },
    { tag: 'devops', keywords: ['devops', 'docker', 'kubernetes', 'ci', 'cd', 'deploy', '部署'] },
    { tag: 'ai', keywords: ['ai', 'llm', 'gpt', 'prompt', 'machine learning', 'ml', '智能'] },
    { tag: 'testing', keywords: ['test', 'testing', 'unit test', 'e2e', '测试'] },
    { tag: 'database', keywords: ['database', 'sql', 'prisma', 'orm', 'mongodb', '数据库'] },
    { tag: 'security', keywords: ['security', 'auth', '安全'] },
    { tag: 'typescript', keywords: ['typescript', 'ts'] },
    { tag: 'python', keywords: ['python', 'django', 'flask'] },
    { tag: 'rust', keywords: ['rust', 'cargo'] },
  ];

  for (const { tag, keywords } of tagPatterns) {
    if (keywords.some(kw => text.includes(kw))) {
      tags.add(tag);
    }
  }

  return Array.from(tags).slice(0, 5);
}

// 提取文件名
function extractFilename(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const parts = pathname.split('/');
    return parts[parts.length - 1];
  } catch {
    return null;
  }
}

// 获取/设置最后更新时间
function getLastUpdateTime() {
  return chrome.storage.local.get('skillhub:lastUpdate')
    .then(r => r['skillhub:lastUpdate'] || 0);
}

function setLastUpdateTime(timestamp) {
  return chrome.storage.local.set({ 'skillhub:lastUpdate': timestamp });
}