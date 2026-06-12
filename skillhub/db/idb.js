// IndexedDB 封装 - Skills 数据库操作
// Database: skillhub, Object Store: skills

const DB_NAME = 'skillhub';
const DB_VERSION = 2;
const STORE_NAME = 'skills';

let dbPromise = null;

// 打开数据库
function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[SkillHub] IndexedDB 打开失败:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('installs', 'installs', { unique: false });
        store.createIndex('stars', 'stars', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('isFavorited', 'isFavorited', { unique: false });
        store.createIndex('platforms', 'platforms', { unique: false, multiEntry: true });
        store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
      } else {
        // 升级: 添加 stars 索引
        const tx = event.target.transaction;
        const store = tx.objectStore(STORE_NAME);
        if (!store.indexNames.contains('stars')) {
          store.createIndex('stars', 'stars', { unique: false });
        }
      }
    };
  });

  return dbPromise;
}

// 初始化数据库
async function initDB() {
  await openDB();
}

// 获取数据库实例
async function getDB() {
  return await openDB();
}

// 事务辅助
function storeTx(db, mode = 'readonly') {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

// 获取所有 Skills
async function getAllSkills() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = storeTx(db).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 按条件查询 Skills
async function querySkills(params = {}) {
  const db = await getDB();
  let skills = await getAllSkills();

  // 搜索过滤
  if (params.search) {
    const q = params.search.toLowerCase();
    skills = skills.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      (s.tags && s.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  // 平台筛选
  if (params.platform) {
    skills = skills.filter(s =>
      s.platforms && s.platforms.includes(params.platform)
    );
  }

  // 分类筛选
  if (params.category) {
    skills = skills.filter(s => s.category === params.category);
  }

  // 收藏筛选
  if (params.isFavorited !== undefined) {
    skills = skills.filter(s => s.isFavorited === params.isFavorited);
  }

  // 排序
  const sortBy = params.sortBy || 'installs';
  const sortOrder = params.sortOrder || 'desc';
  skills.sort((a, b) => {
    const valA = a[sortBy] || 0;
    const valB = b[sortBy] || 0;
    return sortOrder === 'desc' ? valB - valA : valA - valB;
  });

  // 限制数量
  if (params.limit && params.limit > 0) {
    skills = skills.slice(0, params.limit);
  }

  return skills;
}

// 根据 id 获取单个 Skill
async function getSkill(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = storeTx(db).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// 批量添加/更新 Skills
async function bulkUpsertSkills(skills) {
  if (!skills || skills.length === 0) return;

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    let completed = 0;
    let errors = 0;

    skills.forEach(skill => {
      // 确保 isFavorited 字段存在
      if (skill.isFavorited === undefined) {
        skill.isFavorited = false;
      }

      const request = store.put(skill);
      request.onsuccess = () => {
        completed++;
        if (completed + errors === skills.length) resolve(completed);
      };
      request.onerror = () => {
        errors++;
        if (completed + errors === skills.length) resolve(completed);
      };
    });

    tx.oncomplete = () => resolve(completed);
    tx.onerror = () => reject(tx.error);
  });
}

// 更新 Skill 的收藏状态
async function updateFavorite(id, isFavorited) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const skill = getRequest.result;
      if (skill) {
        skill.isFavorited = isFavorited;
        store.put(skill);
      }
    };
    getRequest.onerror = () => reject(getRequest.error);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// 清空所有 Skills
async function clearAllSkills() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = storeTx(db, 'readwrite').clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// 关闭数据库连接
function closeDB() {
  if (dbPromise) {
    dbPromise.then(db => db.close());
    dbPromise = null;
  }
}

export {
  openDB,
  initDB,
  getAllSkills,
  getSkill,
  querySkills,
  bulkUpsertSkills,
  updateFavorite,
  clearAllSkills,
  closeDB
};