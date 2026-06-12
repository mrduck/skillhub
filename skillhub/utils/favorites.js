// 收藏管理工具

import { getSync, setSync } from './storage.js';
import { MAX_FREE_FAVORITES } from './constants.js';

// 获取收藏列表（简单数组版本，Group 功能后续实现）
async function getFavorites() {
  return await getSync('skillhub:favorites') || [];
}

// 切换收藏状态
async function toggleFavorite(skillId) {
  let favorites = await getFavorites();
  const index = favorites.indexOf(skillId);

  if (index > -1) {
    // 取消收藏
    favorites.splice(index, 1);
    await setSync('skillhub:favorites', favorites);
    return false;
  } else {
    // 添加收藏
    favorites.push(skillId);
    await setSync('skillhub:favorites', favorites);
    return true;
  }
}

// 获取收藏数量
async function getFavoritesCount() {
  const favorites = await getFavorites();
  return favorites.length;
}

// 检查是否可以添加更多收藏（免费版限制）
async function canAddMoreFavorites(isPro) {
  if (isPro) return true;
  const count = await getFavoritesCount();
  return count < MAX_FREE_FAVORITES;
}

export { getFavorites, toggleFavorite, getFavoritesCount, canAddMoreFavorites };