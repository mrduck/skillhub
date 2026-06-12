// 搜索 & 筛选逻辑（纯函数工具）

// 搜索 Skills 列表
function searchSkills(skills, query) {
  if (!query) return skills;

  const q = query.toLowerCase();
  return skills.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    (s.tags && s.tags.some(t => t.toLowerCase().includes(q)))
  );
}

// 按平台筛选
function filterByPlatform(skills, platform) {
  if (!platform || platform === 'all') return skills;
  return skills.filter(s => s.platforms && s.platforms.includes(platform));
}

// 按分类筛选
function filterByCategory(skills, category) {
  if (!category || category === 'all') return skills;
  return skills.filter(s => s.category === category);
}

// 排序
function sortSkills(skills, sortBy = 'installs', order = 'desc') {
  return [...skills].sort((a, b) => {
    const va = a[sortBy] || 0;
    const vb = b[sortBy] || 0;
    return order === 'desc' ? vb - va : va - vb;
  });
}

export { searchSkills, filterByPlatform, filterByCategory, sortSkills };