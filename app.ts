import type { User, UserLoginVO } from "./types/user";
import type { ShoppingCart } from "./types/shoppingCart";
import { ApiError, isAuthErrorCode, request } from "./utils/request";

let resolveLoginGate: (() => void) | null = null;

let loginGate: Promise<void> = createLoginGate();

function createLoginGate(): Promise<void> {
  return new Promise<void>((resolve) => {
    resolveLoginGate = resolve;
  });
}

function openLoginGate() {
  if (resolveLoginGate) {
    resolveLoginGate();
    resolveLoginGate = null;
  }
}

// 每次登录周期重建门闩，避免退出后再次登录时旧的 Promise 永远处于已 resolve 状态
function resetLoginGate() {
  openLoginGate();
  loginGate = createLoginGate();
}

App({
  globalData: {
    token: "" as string,
    userInfo: null as User | null,
    cartList: [] as ShoppingCart[],
    cartTotal: 0 as number,
    cartCount: 0 as number,
    loginReady: false as boolean,
    // 订单数据是否已变更：详情页/结算页改动后置真，订单列表按此决定是否重置
    orderListDirty: false as boolean,
    // 订单列表需要强制切换到的状态（0 表示不强制）；tabBar 页实例常驻，switchTab 无法带参
    orderListStatus: 0 as number,
  },

  reloginPromise: null as Promise<void> | null,

  initLoginPromise: null as Promise<void> | null,

  redirectingToLogin: false as boolean,

  // 页面统一通过该方法等待"本次登录周期"完成
  waitForLogin(): Promise<void> {
    return loginGate;
  },

  isLoggedOut(): boolean {
    return wx.getStorageSync("loggedOut") === true;
  },

  // 未登录时跳转登录页；返回 false 表示调用方应立即停止后续逻辑
  requireLogin(): boolean {
    // globalData 可能尚未被 initLogin 填充，回落到本地缓存，避免冷启动误判
    if (this.globalData.token || (wx.getStorageSync("token") as string)) {
      return true;
    }

    if (!this.redirectingToLogin) {
      this.redirectingToLogin = true;
      wx.reLaunch({
        url: "/pages/login/index",
        complete: () => {
          this.redirectingToLogin = false;
        },
      });
    }

    return false;
  },

  onLaunch() {
    this.initLogin();
  },

  // 登录初始化：失败时提示并可重试
  // 并发调用复用同一个 Promise，避免连点重试导致重复登录
  initLogin(): Promise<void> {
    if (this.initLoginPromise) {
      return this.initLoginPromise;
    }

    this.initLoginPromise = (async () => {
      try {
        // 用户主动退出过：不做静默登录，直接放行等待者，由页面守卫统一跳登录页
        if (this.isLoggedOut()) {
          openLoginGate();
          return;
        }

        // 从未登录过（无本地 token）：同样不做静默登录，停在登录页等用户主动点击
        if (!(wx.getStorageSync("token") as string)) {
          openLoginGate();
          return;
        }

        // 有 token 才静默校验；校验失败且为鉴权错误时降级为静默重登
        await this.checkLoginStatus();
        this.globalData.loginReady = true;
        openLoginGate();
      } catch (err) {
        console.error("登录初始化失败:", err);
        // 门闩保持关闭：页面停在等待态，用户点"重试"成功后由 openLoginGate 统一放行
        wx.showModal({
          title: "登录失败",
          content: "网络异常或登录失败，请重试",
          confirmText: "重试",
          cancelText: "退出",
          success: (res) => {
            if (res.confirm) {
              this.initLogin();
            } else {
              wx.exitMiniProgram({});
            }
          },
        });
      } finally {
        this.initLoginPromise = null;
      }
    })();

    return this.initLoginPromise;
  },

  // 登录页主动登录：成功后放行门闩并清除"已退出"标记
  async login(): Promise<void> {
    resetLoginGate();
    await this.wxLogin();
    wx.removeStorageSync("loggedOut");
    this.globalData.loginReady = true;
    openLoginGate();
  },

  // 退出登录：只清本地状态，服务端 openid 未变，无法真正注销
  logout() {
    wx.removeStorageSync("token");
    wx.removeStorageSync("userInfo");
    wx.setStorageSync("loggedOut", true);

    this.globalData.token = "";
    this.globalData.userInfo = null;
    this.globalData.cartList = [];
    this.globalData.cartCount = 0;
    this.globalData.cartTotal = 0;
    this.globalData.loginReady = false;
    this.reloginPromise = null;

    wx.reLaunch({ url: "/pages/login/index" });
  },

  // 资料缺失只作引导提示，不再阻断主流程：调用方据此决定是否展示引导入口
  isProfileIncomplete(): boolean {
    const { userInfo } = this.globalData;

    return !userInfo || !userInfo.name || !userInfo.avatar;
  },

  async checkLoginStatus() {
    const token = wx.getStorageSync("token") as string;

    if (token) {
      this.globalData.token = token;
      try {
        await this.fetchUserInfo();
        return;
      } catch (err) {
        // 本地缓存 token 已失效：清除后降级为重新登录，避免陷入重试死循环
        if (!(err instanceof ApiError) || !isAuthErrorCode(err.code)) {
          throw err;
        }
        console.warn("本地 token 已失效，重新登录:", err.code);
        wx.removeStorageSync("token");
        this.globalData.token = "";
      }
    }

    await this.wxLogin();
  },

  async wxLogin() {
    const loginRes =
      await new Promise<WechatMiniprogram.LoginSuccessCallbackResult>(
        (resolve, reject) => {
          wx.login({
            success: resolve,
            fail: reject,
          });
        },
      );

    const res = await request<UserLoginVO>({
      url: "/user/user/login",
      method: "POST",
      data: { code: loginRes.code },
      skipAuthRetry: true,
    });

    this.globalData.token = res.data.token;
    this.globalData.userInfo = {
      id: res.data.id,
      openid: res.data.openid,
      name: res.data.name || "",
      avatar: res.data.avatar || "",
      phone: "",
      sex: "",
      idNumber: "",
      createTime: "",
    };

    wx.setStorageSync("token", res.data.token);
    wx.setStorageSync("userInfo", this.globalData.userInfo);
  },

  async fetchUserInfo() {
    const res = await request<User>({
      url: "/user/user/info",
      method: "GET",
      skipAuthRetry: true,
    });

    this.globalData.userInfo = res.data;
    wx.setStorageSync("userInfo", res.data);
  },

  // token 失效后静默重登（由 request.ts 触发）
  // 并发调用复用同一个 Promise，避免重复登录
  relogin(): Promise<void> {
    // 用户已主动退出：禁止自动重登，否则会把刚退出的用户又登回去
    if (this.isLoggedOut()) {
      this.redirectToLogin();
      return Promise.reject(new ApiError(1001, "已退出登录"));
    }

    if (this.reloginPromise) {
      return this.reloginPromise;
    }

    this.reloginPromise = (async () => {
      try {
        await this.wxLogin();
        await this.fetchUserInfo();
      } catch (err) {
        console.error("自动重登失败:", err);
        wx.showToast({ title: "登录已过期，请重新进入", icon: "none" });
        throw err;
      } finally {
        this.reloginPromise = null;
      }
    })();

    return this.reloginPromise;
  },

  // 供请求层调用的登录页跳转，带并发去重
  redirectToLogin() {
    this.requireLogin();
  },

  updateCartData(cartList: ShoppingCart[]) {
    this.globalData.cartList = cartList;
    this.globalData.cartCount = cartList.reduce(
      (sum, item) => sum + item.number,
      0,
    );
    this.globalData.cartTotal = cartList.reduce(
      (sum, item) => sum + item.amount * item.number,
      0,
    );

    this.syncCartBadge();
  },

  // 购物车 tab 角标统一在此处同步，避免各页面各自实现导致数值不一致
  syncCartBadge() {
    const count = this.globalData.cartCount;

    try {
      if (count > 0) {
        wx.setTabBarBadge({
          index: 1,
          text: count > 99 ? "99+" : `${count}`,
        });
      } else {
        wx.removeTabBarBadge({ index: 1 });
      }
    } catch (err) {
      console.error("更新购物车角标失败:", err);
    }
  },
});
