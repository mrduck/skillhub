// chrome.storage 封装

// storage.local 操作
async function getLocal(key) {
  const result = await chrome.storage.local.get(key);
  return result[key];
}

async function setLocal(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

async function removeLocal(key) {
  await chrome.storage.local.remove(key);
}

// storage.sync 操作
async function getSync(key) {
  const result = await chrome.storage.sync.get(key);
  return result[key];
}

async function setSync(key, value) {
  await chrome.storage.sync.set({ [key]: value });
}

async function removeSync(key) {
  await chrome.storage.sync.remove(key);
}

// 业务便捷方法
async function getLastUpdate() {
  return await getLocal('skillhub:lastUpdate') || 0;
}

async function setLastUpdate(timestamp) {
  await setLocal('skillhub:lastUpdate', timestamp);
}

async function getSettings() {
  return await getLocal('skillhub:settings') || {
    autoUpdate: true,
    sortByDefault: 'installs'
  };
}

async function setSettings(settings) {
  await setLocal('skillhub:settings', settings);
}

export {
  getLocal, setLocal, removeLocal,
  getSync, setSync, removeSync,
  getLastUpdate, setLastUpdate,
  getSettings, setSettings
};