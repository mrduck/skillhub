// Content Script - GitHub 页面注入安装按钮
// 检测 .md 文件链接并注入 SkillHub 安装按钮

(function() {
  'use strict';

  // ============================================
  // 配置
  // ============================================
  const DEBOUNCE_MS = 800;
  let debounceTimer = null;

  // ============================================
  // 按钮样式
  // ============================================
  const styleId = 'skillhub-injected-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .sh-install-btn {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        margin-left: 6px;
        padding: 1px 7px;
        font-size: 11px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-weight: 500;
        color: #7C3AED;
        background: #F5F3FF;
        border: 1px solid #C4B5FD;
        border-radius: 12px;
        cursor: pointer;
        vertical-align: middle;
        transition: all 0.15s ease;
        white-space: nowrap;
        line-height: 1.6;
      }
      .sh-install-btn:hover {
        background: #7C3AED;
        color: #fff;
        border-color: #7C3AED;
        transform: translateY(-1px);
        box-shadow: 0 2px 6px rgba(124, 58, 237, 0.3);
      }
      .sh-install-btn:active {
        transform: translateY(0);
      }
      .sh-toast {
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #1E1B4B;
        color: #fff;
        padding: 10px 18px;
        border-radius: 10px;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-weight: 500;
        z-index: 99999;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        gap: 8px;
        animation: shToastIn 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                   shToastOut 0.2s ease-in 2.6s forwards;
      }
      .sh-toast.success {
        background: #10B981;
      }
      .sh-toast.error {
        background: #EF4444;
      }
      @keyframes shToastIn {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes shToastOut {
        from { opacity: 1; transform: translateY(0); }
        to   { opacity: 0; transform: translateY(8px); }
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================
  // 查找 .md 文件链接
  // ============================================
  function findMdLinks() {
    const links = document.querySelectorAll('a[href$=".md"]');
    return Array.from(links).filter(link => {
      // 过滤掉导航类、非有效的 Skill 链接
      const href = link.getAttribute('href') || '';
      // 跳过已经是按钮本身的链接
      if (link.classList.contains('sh-install-btn')) return false;
      // 跳过纯锚点
      if (href.startsWith('#')) return false;
      return true;
    });
  }

  // ============================================
  // 注入安装按钮
  // ============================================
  function injectButtons() {
    const mdLinks = findMdLinks();
    mdLinks.forEach(link => {
      // 避免重复注入
      const existing = link.parentElement?.querySelector('.sh-install-btn');
      if (existing) return;

      const btn = document.createElement('button');
      btn.className = 'sh-install-btn';
      btn.innerHTML = '&#9670; 安装';
      btn.title = '使用 SkillHub 安装此 Skill';

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const url = link.href;
        const urlObj = new URL(url);
        const filename = urlObj.pathname.split('/').pop();
        const skillId = filename.replace(/\.md$/i, '');

        // 如果是 raw.githubusercontent.com 直接下载
        // 如果是 github.com/blob/ 需要转换为 raw URL
        let downloadUrl = url;
        if (url.includes('github.com') && url.includes('/blob/')) {
          downloadUrl = url
            .replace('github.com', 'raw.githubusercontent.com')
            .replace('/blob/', '/');
        }

        // 发送给 Service Worker 处理下载
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_SKILL',
          url: downloadUrl,
          filename: filename
        }, (response) => {
          if (response && response.success) {
            showToast(`已下载 ${filename} 到 skillhub 目录`, 'success');
          } else {
            showToast('下载失败，请重试', 'error');
          }
        });
      });

      // 插入到链接后面
      link.style.setProperty('position', 'relative');
      link.parentNode?.insertBefore(btn, link.nextSibling);
    });
  }

  // ============================================
  // Toast 通知
  // ============================================
  function showToast(message, type = '') {
    // 移除旧 Toast
    const oldToast = document.querySelector('.sh-toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.className = `sh-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  }

  // ============================================
  // 初始化
  // ============================================
  function init() {
    injectButtons();

    // 监听 DOM 变化（GitHub 的 SPA 导航）
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(injectButtons, DEBOUNCE_MS);
    });

    const target = document.body;
    if (target) {
      observer.observe(target, {
        childList: true,
        subtree: true
      });
    }
  }

  // 等待 DOM 就绪
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();