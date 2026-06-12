// ExtPay license 模块
// 依赖 vendor/extpay.js 已通过 side-effect import 加载到 self.ExtPay

// ╔══════════════════════════════════════════════════════════════╗
// ║  TODO: 替换为 extensionpay.com 注册的真实 Extension ID       ║
// ║  当前占位值: 'skillhub' — 注册后将真实 ID 填在这里           ║
// ╚══════════════════════════════════════════════════════════════╝
export const EXTPAY_EXTENSION_ID = 'skillhub';

// 获取 ExtPay 实例（在 Service Worker 回调中需重新获取）
function getExtPay() {
  if (!self || !self.ExtPay) {
    throw new Error('ExtPay 未加载，请确保 vendor/extpay.js 已导入');
  }
  return self.ExtPay(EXTPAY_EXTENSION_ID);
}

/**
 * 检查用户是否为 Pro 付费用户
 * @returns {Promise<boolean>}
 */
export async function checkLicense() {
  try {
    const extpay = getExtPay();
    const user = await extpay.getUser();
    return !!(user && user.paid);
  } catch (e) {
    console.warn('[SkillHub] ExtPay getUser 失败:', e.message);
    return false;
  }
}

/**
 * 获取完整用户信息
 * @returns {Promise<Object>} user 对象 { paid, paidAt, email, plan, ... }
 */
export async function getUserInfo() {
  try {
    const extpay = getExtPay();
    return await extpay.getUser();
  } catch (e) {
    console.warn('[SkillHub] ExtPay getUserInfo 失败:', e.message);
    return { paid: false, paidAt: null, email: null };
  }
}

/**
 * 打开支付页面
 */
export async function openPaymentPage() {
  const extpay = getExtPay();
  await extpay.openPaymentPage();
}

/**
 * 打开登录页面（已付费用户换设备登录）
 */
export async function openLoginPage() {
  const extpay = getExtPay();
  await extpay.openLoginPage();
}

/**
 * 监听支付完成事件
 * @param {Function} callback
 */
export function onPaid(callback) {
  const extpay = getExtPay();
  extpay.onPaid.addListener(callback);
}

/**
 * @deprecated 旧版手动激活（保留向后兼容，实际不再使用）
 */
export async function activateLicense(key) {
  return { success: false, error: '请使用 ExtPay 在线支付' };
}

/**
 * @deprecated 旧版格式校验（保留向后兼容）
 */
export function isValidLicenseFormat(key) {
  return /^SKH-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
}