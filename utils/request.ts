import { ENV } from "./env";
import type { ApiResponse } from "../types/api";

interface RequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  data?: object;
  header?: Record<string, string>;
  showLoading?: boolean;
}

export function request<T>(options: RequestOptions): Promise<ApiResponse<T>> {
  const {
    url,
    method = "GET",
    data,
    header = {},
    showLoading = false,
  } = options;

  const app = getApp<{ globalData: { token: string } }>();

  if (showLoading) {
    wx.hideLoading();
    wx.showLoading({ title: "加载中...", mask: true });
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${ENV.BASE_URL}${url}`,
      method,
      data: data as Record<string, unknown>,
      header: {
        "Content-Type": "application/json",
        ...header,
        ...(app.globalData.token ? { token: app.globalData.token } : {}),
      },
      success(res) {
        if (showLoading) {
          wx.hideLoading();
        }

        const response = res.data as ApiResponse<T>;

        if (response.code === 1) {
          resolve(response);
        } else {
          handleBusinessError(response);
          reject(new Error(response.msg));
        }
      },
      fail(err) {
        if (showLoading) {
          wx.hideLoading();
        }

        wx.showToast({
          title: "网络异常，请检查网络",
          icon: "none",
        });
        reject(err);
      },
    });
  });
}

function handleBusinessError(response: ApiResponse<unknown>) {
  const { code, msg } = response;

  switch (true) {
    case code >= 1001 && code <= 1004: {
      wx.removeStorageSync("token");
      const app = getApp<{ globalData: { token: string } }>();
      app.globalData.token = "";
      wx.showToast({ title: "登录已过期，请重新进入", icon: "none" });
      break;
    }

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

export function uploadFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const app = getApp<{ globalData: { token: string } }>();

    wx.uploadFile({
      url: `${ENV.BASE_URL}/admin/common/upload`,
      filePath,
      name: "file",
      header: {
        ...(app.globalData.token ? { token: app.globalData.token } : {}),
      },
      success(res) {
        const data = JSON.parse(res.data) as ApiResponse<string>;

        if (data.code === 1) {
          resolve(data.data);
        } else {
          wx.showToast({ title: data.msg || "上传失败", icon: "none" });
          reject(new Error(data.msg));
        }
      },
      fail(err) {
        wx.showToast({ title: "上传失败，请重试", icon: "none" });
        reject(err);
      },
    });
  });
}
