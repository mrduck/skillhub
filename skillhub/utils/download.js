// 下载工具

// 生成下载链接（用于 popup 内下载）
function downloadInPopup(skill, filename) {
  if (!skill.content) {
    // 如果没有 content，尝试从 sourceUrl 下载
    return false;
  }

  const blob = new Blob([skill.content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `${skill.id}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

// 通过 Chrome downloads API 下载（service worker）
async function downloadViaChrome(url, filename) {
  try {
    const downloadId = await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false // 静默下载，不给保存对话框
    });
    return { success: true, downloadId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export { downloadInPopup, downloadViaChrome };