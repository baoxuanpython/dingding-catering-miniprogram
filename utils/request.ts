import { ENV } from "./env";
import type { ApiResponse } from "../types/api";

interface RequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  data?: object;
  // 后端 @RequestParam 只认 URL 查询串，参数必须放这里而不是 data
  params?: Record<string, string | number | boolean | undefined>;
  header?: Record<string, string>;
  showLoading?: boolean;
  // 跳过 401 自动重登重试，用于重登流程内部的请求，避免自我等待
  skipAuthRetry?: boolean;
  // 业务错误不弹统一提示，由调用方按 code 自行决定文案，避免同一错误弹两次
  silentError?: boolean;
}

interface AppLike {
  globalData: { token: string };
  relogin: () => Promise<void>;
  redirectToLogin?: () => void;
  isLoggedOut?: () => boolean;
}

export class ApiError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export function isAuthErrorCode(code: number): boolean {
  return code >= 1001 && code <= 1004;
}

let loadingCount = 0;

// showLoading 与 showToast 共用同一个遮罩层，loading 未收起时弹的 toast 会被随后的
// hideLoading 一并关掉。这里把提示排到 loading 全部收起之后再弹，保证用户看得见
let pendingNotices: Array<() => void> = [];

let noticeScheduled = false;

// 统一的请求超时时间（毫秒），避免请求挂起时界面锁死
const REQUEST_TIMEOUT = 15000;

// 对外暴露：加购这类「一次业务操作 = 多次请求」的链路必须复用同一个计数器，
// 否则它们自己调 wx.showLoading/wx.hideLoading 会被 request 的 endLoading 提前关掉遮罩
export function startLoading(title = "加载中...") {
  loadingCount += 1;
  if (loadingCount === 1) {
    wx.showLoading({ title, mask: true });
  }
}

export function endLoading() {
  if (loadingCount <= 0) {
    return;
  }
  loadingCount -= 1;
  if (loadingCount === 0) {
    wx.hideLoading();
    // 延后一个宏任务：hideLoading 异步生效，同一 tick 内弹 toast 仍可能被它吞掉
    scheduleNotices();
  }
}

function scheduleNotices() {
  if (noticeScheduled) {
    return;
  }

  noticeScheduled = true;
  setTimeout(() => {
    noticeScheduled = false;
    const notices = pendingNotices;
    pendingNotices = [];
    notices.forEach((notice) => notice());
  }, 0);
}

function pushNotice(notice: () => void) {
  pendingNotices.push(notice);

  // loading 已收起时立即安排弹出；否则等最后一个 loading 收起时统一弹
  if (loadingCount === 0) {
    scheduleNotices();
  }
}

// 鉴权错误由重登链路负责提示，这里不再重复弹，避免同一错误弹两次
function notifyError(err: unknown) {
  if (err instanceof ApiError) {
    if (isAuthErrorCode(err.code)) {
      return;
    }
    handleBusinessError(err.code, err.message);
    return;
  }

  wx.showToast({ title: "网络异常，请检查网络", icon: "none" });
}

export function request<T>(options: RequestOptions): Promise<ApiResponse<T>> {
  const needLoading = options.showLoading === true;
  const silentError = options.silentError === true;

  if (needLoading) {
    startLoading();
  }

  return send<T>(options, options.skipAuthRetry !== true).then(
    (res) => {
      if (needLoading) {
        endLoading();
      }
      return res;
    },
    (err: Error) => {
      if (needLoading) {
        endLoading();
      }

      // 统一在 loading 收起之后弹提示；silentError 的调用方按 code 自行提示
      if (!silentError) {
        pushNotice(() => notifyError(err));
      }

      throw err;
    },
  );
}

function buildQuery(
  params?: Record<string, string | number | boolean | undefined>,
): string {
  if (!params) {
    return "";
  }

  const parts = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null)
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`,
    );

  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

function send<T>(
  options: RequestOptions,
  canRetry: boolean,
): Promise<ApiResponse<T>> {
  const { url, method = "GET", data, params, header = {} } = options;

  const app = getApp<AppLike>();
  const token =
    app?.globalData?.token || (wx.getStorageSync("token") as string);

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${ENV.BASE_URL}${url}${buildQuery(params)}`,
      method,
      // 兜底超时：请求挂起时也必须走 fail 分支，否则调用方的 loading/锁标记永远不释放
      timeout: REQUEST_TIMEOUT,
      data: data as Record<string, unknown>,
      header: {
        "Content-Type": "application/json",
        ...header,
        ...(token ? { authentication: token } : {}),
      },
      success(res) {
        const response = res.data as ApiResponse<T>;

        if (response.code === 1) {
          resolve(response);
          return;
        }

        if (isAuthErrorCode(response.code) && canRetry) {
          retryAfterRelogin(options, response, resolve, reject);
          return;
        }

        // 鉴权错误且不再重试时，交由调用方决定后续处理（如降级为重新登录）
        if (isAuthErrorCode(response.code)) {
          reject(new ApiError(response.code, response.msg));
          return;
        }

        // 提示统一由 request() 在 loading 收起后弹出，这里只 reject，避免重复提示
        reject(new ApiError(response.code, response.msg));
      },
      fail(err) {
        reject(err);
      },
    });
  });
}

function retryAfterRelogin<T>(
  options: RequestOptions,
  response: ApiResponse<T>,
  resolve: (value: ApiResponse<T>) => void,
  reject: (reason: Error) => void,
) {
  wx.removeStorageSync("token");

  const app = getApp<AppLike>();
  if (app?.globalData) {
    app.globalData.token = "";
  }

  // 用户已主动退出：不再自动重登，直接送去登录页，避免把刚退出的用户又登回去
  if (app?.isLoggedOut?.()) {
    app.redirectToLogin?.();
    reject(new ApiError(response.code, response.msg));
    return;
  }

  if (!app || typeof app.relogin !== "function") {
    reject(new ApiError(response.code, response.msg));
    return;
  }

  app
    .relogin()
    .then(() => send<T>(options, false))
    .then(resolve)
    .catch((err: Error) => reject(err));
}

function handleBusinessError(code: number, msg: string) {
  switch (true) {
    case code >= 6001 && code <= 6003:
      wx.showToast({ title: msg || "订单操作失败", icon: "none" });
      break;

    case code >= 7001 && code <= 7002:
      wx.showToast({ title: msg || "购物车操作失败", icon: "none" });
      break;

    case code >= 8001 && code <= 8002:
      wx.showToast({ title: msg || "地址操作失败", icon: "none" });
      break;

    case code === 99001:
      wx.showToast({ title: msg || "参数错误", icon: "none" });
      break;

    case code === 99999:
      wx.showToast({ title: "系统繁忙，请稍后再试", icon: "none" });
      break;

    default:
      wx.showToast({ title: msg || "操作失败", icon: "none" });
  }
}

// 小程序只持有用户端令牌（header: authentication，user-secret-key 签发），
// 管理端 /admin/common/upload 由 JwtTokenAdminInterceptor 校验 header: token，
// 因此必然返回 1003「用户未登录」，必须走用户端上传端点
const UPLOAD_URL = "/user/common/upload";

function parseUploadBody(raw: string): ApiResponse<string> | null {
  try {
    return JSON.parse(raw) as ApiResponse<string>;
  } catch {
    return null;
  }
}

function retryUploadAfterRelogin(
  filePath: string,
  resolve: (value: string) => void,
  reject: (reason: Error) => void,
) {
  wx.removeStorageSync("token");

  const app = getApp<AppLike>();
  if (app?.globalData) {
    app.globalData.token = "";
  }

  if (app?.isLoggedOut?.()) {
    app.redirectToLogin?.();
    reject(new ApiError(1003, "用户未登录"));
    return;
  }

  if (!app || typeof app.relogin !== "function") {
    reject(new ApiError(1003, "用户未登录"));
    return;
  }

  app
    .relogin()
    .then(() => uploadFile(filePath, false))
    .then(resolve)
    .catch((err: Error) => reject(err));
}

export function uploadFile(filePath: string, canRetry = true): Promise<string> {
  const app = getApp<AppLike>();
  const token =
    app?.globalData?.token || (wx.getStorageSync("token") as string);
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${ENV.BASE_URL}${UPLOAD_URL}`,
      filePath,
      name: "file",
      timeout: REQUEST_TIMEOUT,
      header: {
        ...(token ? { authentication: token } : {}),
      },
      success(res) {
        const data = parseUploadBody(res.data);

        // 网关/404 返回 HTML 时直接 JSON.parse 会抛异常，Promise 将永不 settle
        if (!data) {
          wx.showToast({ title: "上传失败，请稍后重试", icon: "none" });
          reject(new Error(`上传响应解析失败: HTTP ${res.statusCode}`));
          return;
        }

        if (data.code === 1) {
          resolve(data.data);
          return;
        }

        // 令牌过期/无效：与 request() 保持一致，重登一次后重试
        if (isAuthErrorCode(data.code) && canRetry) {
          retryUploadAfterRelogin(filePath, resolve, reject);
          return;
        }

        if (isAuthErrorCode(data.code)) {
          wx.showToast({ title: "登录已过期，请重新进入", icon: "none" });
          reject(new ApiError(data.code, data.msg));
          return;
        }

        wx.showToast({ title: data.msg || "上传失败", icon: "none" });
        reject(new ApiError(data.code, data.msg));
      },
      fail(err) {
        wx.showToast({ title: "上传失败，请重试", icon: "none" });
        reject(err);
      },
    });
  });
}
