// 数据合并工具

// 合并 A (skills.sh) + B (GitHub awesome) 数据
// 取交集作为高质量数据，以 id 为唯一键
function mergeSkills(aSkills, bSkills) {
  if (!aSkills || !bSkills) return [];

  // 构建 B 的 id 集合，快速查找
  const bIds = new Set(bSkills.map(s => s.id));

  // 只保留在 A 和 B 中都存在的 Skill
  const merged = aSkills.filter(s => bIds.has(s.id));

  // 合并字段：A 的字段优先，B 补充缺失字段
  const bMap = new Map(bSkills.map(s => [s.id, s]));

  return merged.map(a => {
    const b = bMap.get(a.id);
    if (!b) return a;

    return {
      ...b,           // B 的字段作为基础
      ...a,           // A 的字段覆盖
      id: a.id,       // 确保 id 来自 A
      // 确保关键字段不为空
      description: a.description || b.description,
      author: a.author || b.author,
      platforms: a.platforms || b.platforms || [],
      tags: a.tags || b.tags || [],
      isFavorited: false
    };
  });
}

// 与本地 C 层数据合并
// C 的数据是人工审核的，质量最高，不被覆盖
function mergeWithLocal(localSkills, mergedSkills) {
  const localIds = new Set(localSkills.map(s => s.id));

  // 过滤掉本地已有的，只保留新增的
  const newSkills = mergedSkills.filter(s => !localIds.has(s.id));

  return [...localSkills, ...newSkills];
}

export { mergeSkills, mergeWithLocal };