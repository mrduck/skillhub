import { PLATFORMS, CATEGORIES } from '../utils/constants.js';

// ============================================
// Global App State
// ============================================
let appState = {
  currentPage: 'main',
  previousPage: null,
  currentSkillId: null,
  searchQuery: '',
  activePlatform: 'all',
  activeCategory: 'all',
  activeTab: 'hot',
  skills: [],
  favorites: [],
  isPro: false,
  totalFavorites: 0,
  totalSkills: 0
};

// ============================================
// DOM References
// ============================================
const pages = {
  main: document.getElementById('page-main'),
  detail: document.getElementById('page-detail'),
  favorites: document.getElementById('page-favorites'),
  settings: document.getElementById('page-settings')
};

const els = {
  searchInput: document.getElementById('search-input'),
  searchClear: document.getElementById('search-clear'),
  platformFilter: document.getElementById('platform-filter'),
  categoryFilter: document.getElementById('category-filter'),
  skillsContainer: document.getElementById('skills-container'),
  skillsCount: document.getElementById('skills-count'),
  detailContent: document.getElementById('detail-content'),
  favoritesContent: document.getElementById('favorites-content'),
  proModal: document.getElementById('pro-modal'),
  toast: document.getElementById('toast'),
  toastMessage: document.querySelector('.toast-message')
};

// ============================================
// Init
// ============================================
function initCategoryDropdown() {
  CATEGORIES.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    els.categoryFilter.appendChild(option);
  });
}

// ============================================
// Page Switching with animation
// ============================================
function switchPage(pageName) {
  if (appState.currentPage === pageName) return;

  const oldPage = pages[appState.currentPage];
  const newPage = pages[pageName];

  appState.previousPage = appState.currentPage;
  appState.currentPage = pageName;

  // Animate out old page
  if (oldPage) {
    oldPage.classList.add('page-leave');
    oldPage.addEventListener('animationend', function handler() {
      oldPage.removeEventListener('animationend', handler);
      oldPage.classList.remove('active', 'page-leave');
    }, { once: true });
  }

  // Show new page with animation
  newPage.classList.add('active', 'page-enter');
  newPage.addEventListener('animationend', function handler() {
    newPage.removeEventListener('animationend', handler);
    newPage.classList.remove('page-enter');
  }, { once: true });
}

// ============================================
// Toast
// ============================================
function showToast(message, type = '') {
  els.toastMessage.textContent = message;
  els.toast.className = 'toast';
  if (type) els.toast.classList.add(type);
  els.toast.classList.add('show');

  setTimeout(() => {
    els.toast.classList.add('hiding');
    els.toast.addEventListener('transitionend', function handler() {
      els.toast.removeEventListener('transitionend', handler);
      els.toast.classList.remove('show', 'hiding', 'success', 'error');
    }, { once: true });
  }, 2500);
}

// ============================================
// Pro Modal
// ============================================
function showProModal() {
  if (!els.proModal) {
    console.error('[SkillHub] pro-modal 元素未找到');
    return;
  }
  els.proModal.classList.add('show', 'entering');
  els.proModal.addEventListener('animationend', function handler() {
    els.proModal.removeEventListener('animationend', handler);
    els.proModal.classList.remove('entering');
  }, { once: true });
}

function hideProModal() {
  if (els.proModal) {
    els.proModal.classList.remove('show');
  }
}

// 点击遮罩关闭弹窗
if (els.proModal) {
  els.proModal.addEventListener('click', (e) => {
    if (e.target === els.proModal) {
      hideProModal();
    }
  });
}

// ============================================
// Search Clear Button
// ============================================
function updateSearchClear() {
  if (els.searchInput.value.trim()) {
    els.searchClear.classList.add('visible');
  } else {
    els.searchClear.classList.remove('visible');
  }
}

// ============================================
// Escape HTML
// ============================================
function escapeHtml(str) {
  if (!str) return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================
// Format number
// ============================================
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
  return String(num);
}

// ============================================
// Render Skill Card
// ============================================
function renderSkillCard(skill) {
  const starClass = skill.isFavorited ? 'favorited' : '';
  const platformsHtml = skill.platforms.map(p => {
    const info = PLATFORMS.find(pi => pi.id === p);
    return info ? `<span class="platform-tag">${escapeHtml(info.name)}</span>` : '';
  }).join('');

  return `
    <div class="skill-card" data-skill-id="${escapeHtml(skill.id)}">
      <div class="skill-card-header">
        <span class="skill-name" data-action="detail" title="${escapeHtml(skill.name)}">
          ${escapeHtml(skill.name)}
        </span>
        <span class="skill-star ${starClass}" data-action="favorite" title="收藏">★</span>
      </div>
      <div class="skill-meta">
        ${escapeHtml(skill.author)} · ⭐ ${formatNumber(skill.stars)}
      </div>
      <div class="skill-description">${escapeHtml(skill.description)}</div>
      <div class="skill-tags">${platformsHtml}</div>
      <div class="skill-actions">
        <button class="btn" data-action="copy">复制命令</button>
        <button class="btn" data-action="detail">详情</button>
      </div>
    </div>
  `;
}

// ============================================
// Render Skills List
// ============================================
function renderSkills() {
  // Mark as loaded to hide skeleton
  els.skillsContainer.classList.add('loaded');

  if (appState.skills.length === 0) {
    els.skillsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">没有找到匹配的 Skills</div>
        <div class="empty-desc">试试更换筛选条件或搜索词</div>
      </div>
    `;
    els.skillsCount.textContent = '';
    return;
  }

  const html = appState.skills.map(renderSkillCard).join('');
  els.skillsContainer.innerHTML = html;
  els.skillsCount.textContent = `共 ${appState.skills.length} 个 Skill`;

  }

// ============================================
// Handle Skill Card Clicks
// ============================================
function handleSkillClick(e) {
  const target = e.target;
  const action = target.dataset.action;
  const card = target.closest('.skill-card');
  if (!card) return;

  const skillId = card.dataset.skillId;

  switch (action) {
    case 'detail':
      openDetail(skillId);
      break;
    case 'favorite':
      handleFavoriteClick(skillId, target);
      break;
    case 'copy':
      copyInstallCommand(skillId);
      break;
  }
}

// ============================================
// Load Skills
// ============================================
function loadSkills() {
  // Show skeleton
  els.skillsContainer.classList.remove('loaded');
  els.skillsContainer.innerHTML = `
    <div class="skeleton-list">
      ${Array.from({ length: 3 }, () => `
        <div class="skeleton-card">
          <div class="skeleton-line skeleton-title"></div>
          <div class="skeleton-line skeleton-meta"></div>
          <div class="skeleton-line skeleton-desc"></div>
          <div class="skeleton-line skeleton-desc short"></div>
          <div class="skeleton-tags">
            <div class="skeleton-tag"></div>
            <div class="skeleton-tag"></div>
            <div class="skeleton-tag"></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  const params = {
    search: appState.searchQuery || undefined,
    platform: appState.activePlatform !== 'all' ? appState.activePlatform : undefined,
    category: appState.activeCategory !== 'all' ? appState.activeCategory : undefined,
    isFavorited: appState.activeTab === 'favorites' ? true : undefined,
    sortBy: appState.activeTab === 'hot' ? 'stars' : 'updatedAt',
    sortOrder: 'desc',
    limit: 50
  };

  chrome.runtime.sendMessage(
    { type: 'SEARCH_SKILLS', params },
    (response) => {
      if (response && response.skills) {
        appState.skills = response.skills;
        appState.totalSkills = response.total || response.skills.length;
        renderSkills();
      } else {
        els.skillsContainer.classList.add('loaded');
        els.skillsContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <div class="empty-title">数据加载失败</div>
            <div class="empty-desc">请检查网络后重试</div>
          </div>
        `;
        els.skillsCount.textContent = '';
      }
    }
  );
}

// ============================================
// Detail Page
// ============================================
function openDetail(skillId) {
  els.detailContent.classList.remove('loaded');

  chrome.runtime.sendMessage(
    { type: 'GET_SKILL', id: skillId },
    (response) => {
      if (response && response.skill) {
        renderDetail(response.skill);
        appState.currentSkillId = skillId;
        switchPage('detail');
      } else {
        showToast('Skill 不存在', 'error');
      }
    }
  );
}

function renderDetail(skill) {
  els.detailContent.classList.add('loaded');

  const platformsHtml = skill.platforms.map(p => {
    const info = PLATFORMS.find(pi => pi.id === p);
    return info
      ? `<span class="platform-badge">${escapeHtml(info.name)}</span>`
      : '';
  }).join('');

  const pathsHtml = skill.platforms.map(p => {
    const info = PLATFORMS.find(pi => pi.id === p);
    return info
      ? `<div class="install-path-item">
           <strong>${escapeHtml(info.name)}:</strong>
           <code>${escapeHtml(info.installPath)}${escapeHtml(skill.id)}.md</code>
         </div>`
      : '';
  }).join('');

  const tagsHtml = skill.tags
    ? skill.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')
    : '';

  const starClass = skill.isFavorited ? 'favorited' : '';

  els.detailContent.innerHTML = `
    <div class="detail-hero">
      <div class="detail-hero-header">
        <span class="detail-hero-name">${escapeHtml(skill.name)}</span>
        <span class="skill-star ${starClass}" data-action="toggle-favorite" title="收藏">★</span>
      </div>
      <div class="detail-hero-meta">
        ${escapeHtml(skill.author)} · ⭐ ${formatNumber(skill.stars)} · 更新于 ${escapeHtml(skill.updatedAt)}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">简介</div>
      <div class="detail-description">${escapeHtml(skill.description)}</div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">适配平台</div>
      <div class="platform-list">${platformsHtml}</div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">安装方式</div>
      <div class="install-box">
        <div class="install-command">${escapeHtml(skill.installCommand)}</div>
        <button class="btn btn-primary btn-sm" data-action="copy-detail">复制命令</button>
      </div>
      <div class="install-paths">
        <p style="margin-bottom: 8px; font-size: 13px; color: var(--text-secondary);">
          或手动下载 skill.md 并移动到对应目录：
        </p>
        ${pathsHtml}
      </div>
    </div>

    ${tagsHtml ? `
    <div class="detail-section">
      <div class="detail-section-title">标签</div>
      <div class="tag-list">${tagsHtml}</div>
    </div>
    ` : ''}

    ${skill.sourceUrl ? `
    <div class="detail-section">
      <div style="display: flex; gap: 8px;">
        <a href="${escapeHtml(skill.sourceUrl)}" target="_blank" class="btn btn-secondary btn-sm flex-1">
          GitHub 主页
        </a>
        ${skill.rawUrl ? `
        <a href="${escapeHtml(skill.rawUrl)}" target="_blank" class="btn btn-secondary btn-sm flex-1">
          查看 raw.md
        </a>
        ` : ''}
      </div>
    </div>
    ` : ''}

    <div class="detail-actions">
      <button class="btn btn-primary" data-action="download-md">下载 skill.md</button>
      <button class="btn btn-secondary" data-action="toggle-favorite">
        ${skill.isFavorited ? '★ 取消收藏' : '★ 收藏'}
      </button>
    </div>
  `;

  // Attach detail events
  els.detailContent.querySelector('[data-action="copy-detail"]')
    ?.addEventListener('click', () => copyInstallCommand(skill.id));

  els.detailContent.querySelector('[data-action="download-md"]')
    ?.addEventListener('click', () => downloadSkillMd(skill));

  els.detailContent.querySelectorAll('[data-action="toggle-favorite"]')
    .forEach(btn => {
      btn.addEventListener('click', () => toggleFavorite(skill.id, () => {
        openDetail(skill.id);
      }));
    });
}

// ============================================
// Copy & Download
// ============================================
function copyInstallCommand(skillId) {
  const skill = appState.skills.find(s => s.id === skillId);
  if (!skill) return;

  navigator.clipboard.writeText(skill.installCommand).then(() => {
    showToast('安装命令已复制到剪贴板', 'success');
  }).catch(() => {
    showToast('复制失败', 'error');
  });
}

async function downloadSkillMd(skill) {
  // 如果有 content 直接用
  if (skill.content) {
    const blob = new Blob([skill.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${skill.id}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('skill.md 已下载', 'success');
    return;
  }

  // 尝试从 rawUrl 拉取
  if (skill.rawUrl) {
    showToast('正在从 GitHub 拉取...', 'info');
    try {
      const response = await fetch(skill.rawUrl);
      if (response.ok) {
        const content = await response.text();
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${skill.id}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('skill.md 已下载', 'success');
        return;
      }
    } catch (e) {
      console.warn('[SkillHub] 远程拉取失败，使用本地生成:', e.message);
    }
  }

  // 兜底：根据元数据生成 skill.md 模板
  const platforms = skill.platforms.map(p => {
    const info = PLATFORMS.find(pi => pi.id === p);
    return info ? info.name : p;
  }).join(', ');

  const md = `# ${skill.name}

> ${skill.description || 'AI 编程 Skill'}
>
> 作者: ${skill.author || 'Unknown'}  |  ⭐ Stars: ${skill.stars ? formatNumber(skill.stars) : '0'}  |  适配平台: ${platforms}

---

## 安装

\`\`\`bash
${skill.installCommand || `npx skills add ${skill.id}`}
\`\`\`

## 描述

${skill.description}

## 适配平台

${skill.platforms.map(p => `- ${p}`).join('\n')}

${skill.tags && skill.tags.length > 0 ? `## 标签\n\n${skill.tags.map(t => `- ${t}`).join('\n')}` : ''}

${skill.sourceUrl ? `## 源码\n\n${skill.sourceUrl}` : ''}

---

*由 SkillHub 生成 · 更新于 ${skill.updatedAt || 'N/A'}*
`;

  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${skill.id}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('skill.md 已下载（本地生成）', 'success');
}

// ============================================
// Favorite Toggle (with star pop animation)
// ============================================
function handleFavoriteClick(skillId, starEl) {
  // Add pop animation
  starEl.classList.add('popping');
  starEl.addEventListener('animationend', () => {
    starEl.classList.remove('popping');
  }, { once: true });

  toggleFavorite(skillId);
}

function toggleFavorite(skillId, callback) {
  console.log('[SkillHub] toggleFavorite:', skillId);
  chrome.runtime.sendMessage(
    { type: 'TOGGLE_FAVORITE', skillId },
    (response) => {
      console.log('[SkillHub] TOGGLE_FAVORITE response:', response);
      if (!response) {
        showToast('操作失败，请重试', 'error');
        return;
      }

      if (response.error) {
        console.error('[SkillHub] TOGGLE_FAVORITE error:', response.error);
        showToast('操作失败: ' + response.error, 'error');
        return;
      }

      if (response.proLimit) {
        console.log('[SkillHub] 达到免费版上限，显示 Pro 弹窗');
        showProModal();
        return;
      }

      // Update local state
      const skill = appState.skills.find(s => s.id === skillId);
      if (skill) {
        skill.isFavorited = response.isFavorited;
      }

      if (appState.currentPage === 'main') {
        renderSkills();
      }

      showToast(response.isFavorited ? '已收藏' : '已取消收藏');

      if (callback) callback();
    }
  );
}

// ============================================
// Favorites Page
// ============================================
function loadFavorites() {
  chrome.runtime.sendMessage(
    { type: 'GET_FAVORITES' },
    (response) => {
      const favIds = response.favorites || [];
      appState.totalFavorites = response.totalFavorites || 0;

      // 从 DB 获取收藏的完整 skill 对象以显示名称
      if (favIds.length > 0) {
        chrome.runtime.sendMessage(
          { type: 'SEARCH_SKILLS', params: { isFavorited: true, limit: 1000 } },
          (skillResp) => {
            const skillsMap = new Map();
            if (skillResp && skillResp.skills) {
              skillResp.skills.forEach(s => skillsMap.set(s.id, s));
            }
            appState.favorites = favIds.map(id => ({
              id,
              name: (skillsMap.get(id) && skillsMap.get(id).name) || id
            }));
            renderFavorites();
          }
        );
      } else {
        appState.favorites = [];
        renderFavorites();
      }
    }
  );
}

function renderFavorites() {
  if (!appState.favorites.length) {
    els.favoritesContent.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⭐</div>
        <div class="empty-title">还没有收藏任何 Skill</div>
        <div class="empty-desc">浏览热门 Skills，点击星标即可收藏</div>
      </div>
    `;
    document.querySelector('.topbar-title').textContent = '我的收藏';
    return;
  }

  document.querySelector('.topbar-title').textContent = `我的收藏 (${appState.favorites.length})`;

  // TODO: Group support — currently showing all in "未分组"
  const html = `
    <div class="group-section">
      <div class="group-header">
        <div class="group-header-left">
          <span class="group-icon">▾</span>
          <span class="group-title">未分组</span>
          <span class="group-count">(${appState.favorites.length})</span>
        </div>
      </div>
      <div class="group-content">
        ${appState.favorites.map(fav => `
          <div class="favorite-item">
            <div class="favorite-item-info" data-skill-id="${escapeHtml(fav.id)}" data-action="open-favorite">
              <span class="favorite-item-icon">◆</span>
              <span class="favorite-item-name">${escapeHtml(fav.name)}</span>
            </div>
            <button class="favorite-item-remove" data-skill-id="${escapeHtml(fav.id)}" data-action="remove-favorite" title="移除收藏">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  els.favoritesContent.innerHTML = html;

}

// ============================================
// License & Settings (ExtPay)
// ============================================
function loadLicenseStatus() {
  const statusEl = document.getElementById('license-status');
  const actionsEl = document.getElementById('license-actions');
  const proInfoEl = document.getElementById('license-pro-info');
  const upgradeSection = document.getElementById('pro-upgrade-section');

  chrome.runtime.sendMessage(
    { type: 'CHECK_LICENSE' },
    (response) => {
      appState.isPro = !!(response && response.isPro);

      if (appState.isPro) {
        statusEl.className = 'license-status activated';
        statusEl.textContent = 'Pro 已激活 — 全部功能已解锁';
        if (actionsEl) actionsEl.style.display = 'none';
        if (proInfoEl) proInfoEl.style.display = 'block';
        if (upgradeSection) upgradeSection.style.display = 'none';
        // 尝试显示邮箱
        const emailEl = document.getElementById('pro-email');
        if (emailEl && response.email) {
          emailEl.textContent = response.email;
        }
      } else {
        statusEl.className = 'license-status not-activated';
        statusEl.textContent = '免费版 · 最多收藏 10 个 Skill';
        if (actionsEl) actionsEl.style.display = 'block';
        if (proInfoEl) proInfoEl.style.display = 'none';
        if (upgradeSection) upgradeSection.style.display = 'block';
      }
    }
  );
}

// ============================================
// Event Bindings
// ============================================

// Tab buttons
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    appState.activeTab = btn.dataset.tab;
    loadSkills();
  });
});

// Filters
els.platformFilter.addEventListener('change', (e) => {
  appState.activePlatform = e.target.value;
  loadSkills();
});

els.categoryFilter.addEventListener('change', (e) => {
  appState.activeCategory = e.target.value;
  loadSkills();
});

// Search
els.searchInput.addEventListener('input', debounce(() => {
  appState.searchQuery = els.searchInput.value.trim();
  updateSearchClear();
  loadSkills();
}, 300));

els.searchClear.addEventListener('click', () => {
  els.searchInput.value = '';
  appState.searchQuery = '';
  updateSearchClear();
  loadSkills();
  els.searchInput.focus();
});

// Navigation
document.getElementById('detail-back').addEventListener('click', () => switchPage('main'));

document.getElementById('favorites-back').addEventListener('click', () => {
  switchPage('main');
  loadSkills();
});

document.getElementById('settings-back').addEventListener('click', () => switchPage('main'));

document.getElementById('btn-settings').addEventListener('click', () => {
  switchPage('settings');
  loadLicenseStatus();
});

// Favorites page entry (from tab)
const favoritesTabBtn = document.querySelector('[data-tab="favorites"]');
if (favoritesTabBtn) {
  favoritesTabBtn.addEventListener('click', () => {
    switchPage('favorites');
    loadFavorites();
  });
}

// Pro modal
document.getElementById('modal-cancel').addEventListener('click', hideProModal);

document.getElementById('modal-upgrade').addEventListener('click', () => {
  hideProModal();
  chrome.runtime.sendMessage({ type: 'OPEN_PAYMENT_PAGE' });
});

// ExtPay: 升级 Pro
const btnUpgradePro = document.getElementById('btn-upgrade-pro');
if (btnUpgradePro) {
  btnUpgradePro.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_PAYMENT_PAGE' }, (resp) => {
      if (resp && !resp.success) {
        showToast('打开支付页面失败', 'error');
      }
    });
  });
}

// ExtPay: 登录已有账号
const btnLoginPage = document.getElementById('btn-login-page');
if (btnLoginPage) {
  btnLoginPage.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_LOGIN_PAGE' }, (resp) => {
      if (resp && !resp.success) {
        showToast('打开登录页面失败', 'error');
      }
    });
  });
}

// ExtPay: 管理订阅
const btnManageSub = document.getElementById('btn-manage-subscription');
if (btnManageSub) {
  btnManageSub.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_PAYMENT_PAGE' });
  });
}

// Data management
document.getElementById('btn-refresh-data').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'FORCE_UPDATE' }, () => {
    showToast('已触发数据更新', 'success');
    loadSkills();
  });
});

document.getElementById('btn-export-favorites').addEventListener('click', () => {
  chrome.runtime.sendMessage(
    { type: 'GET_FAVORITES' },
    (response) => {
      const dataStr = JSON.stringify(response, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'skillhub-favorites.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('收藏已导出', 'success');
    }
  );
});

// Buy Pro (settings page upgrade section)
const btnBuyPro = document.getElementById('btn-buy-pro');
if (btnBuyPro) {
  btnBuyPro.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_PAYMENT_PAGE' });
  });
}

// Debounce utility
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ============================================
// Bootstrap
// ============================================
initCategoryDropdown();

// 卡片点击事件委托 — 只绑定一次，避免 renderSkills 重复绑定
els.skillsContainer.addEventListener('click', handleSkillClick);

// 收藏页点击事件委托 — 处理分组折叠、打开详情、移除收藏
els.favoritesContent.addEventListener('click', (e) => {
  // 处理分组折叠
  const groupHeader = e.target.closest('.group-header');
  if (groupHeader) {
    const content = els.favoritesContent.querySelector('.group-content');
    const icon = els.favoritesContent.querySelector('.group-icon');
    if (content) content.classList.toggle('collapsed');
    if (icon) icon.classList.toggle('collapsed');
    return;
  }

  // 处理收藏项操作
  const actionBtn = e.target.closest('[data-action]');
  if (!actionBtn) return;
  const skillId = actionBtn.dataset.skillId;
  if (!skillId) return;

  if (actionBtn.dataset.action === 'open-favorite') {
    openDetail(skillId);
  } else if (actionBtn.dataset.action === 'remove-favorite') {
    toggleFavorite(skillId, () => loadFavorites());
  }
});

loadSkills();
loadLicenseStatus();