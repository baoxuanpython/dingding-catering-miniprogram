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
    // 订单数据是否已变更：详情页/结算页改动后置真，订单列表按此决定是否重置
    orderListDirty: false as boolean,
    // 订单列表需要强制切换到的状态（0 表示不强制）；tabBar 页实例常驻，switchTab 无法带参
    orderListStatus: 0 as number,
  },

  reloginPromise: null as Promise<void> | null,

  initLoginPromise: null as Promise<void> | null,

  redirectingToLogin: false as boolean,

  // 登录世代号：每次退出登录递增。在飞的 wxLogin 返回后比对它，
  // 若已变化说明期间用户已退出，必须丢弃结果，否则会把刚清掉的 token 又写回去
  authEpoch: 0 as number,

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

    const pending = (async () => {
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
      }
    })();

    this.initLoginPromise = pending;

    // 上面两个「无 await」分支会同步跑完，若在内部 finally 里清空，会被随后的
    // 赋值覆盖，导致 initLoginPromise 永远停留在一个已完成的 Promise 上。
    // 因此把清空放在赋值之后，并加同一性判断避免清掉更新的一次初始化。
    const clear = () => {
      if (this.initLoginPromise === pending) {
        this.initLoginPromise = null;
      }
    };
    pending.then(clear, clear);

    return pending;
  },

  // 登录页主动登录：成功后放行门闩并清除"已退出"标记
  async login(): Promise<void> {
    resetLoginGate();
    await this.wxLogin();
    wx.removeStorageSync("loggedOut");
    openLoginGate();
  },

  // 退出登录：只清本地状态，服务端 openid 未变，无法真正注销
  logout() {
    // 先递增世代号：让所有在飞的登录/重登请求作废，避免它们稍后把 token 写回
    this.authEpoch += 1;

    wx.removeStorageSync("token");
    wx.removeStorageSync("userInfo");
    wx.setStorageSync("loggedOut", true);

    this.globalData.token = "";
    this.globalData.userInfo = null;
    this.globalData.cartList = [];
    this.globalData.cartCount = 0;
    this.globalData.cartTotal = 0;
    // 订单列表的跨页标记属于上一个账号，必须清掉，否则换账号后会被强制切到旧 tab
    this.globalData.orderListDirty = false;
    this.globalData.orderListStatus = 0;
    this.reloginPromise = null;
    this.initLoginPromise = null;

    // 重置门闩：旧的登录周期已结束，等待者应等下一次登录而不是立即放行
    resetLoginGate();

    // cartCount 已清零，角标必须同步移除，否则会一直显示上一个账号的数量
    this.syncCartBadge();

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
    const epoch = this.authEpoch;

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

    // 请求期间用户已退出登录：这次登录结果必须丢弃，
    // 否则会把 logout() 刚清掉的 token 重新写回本地，用户又被登回去
    if (epoch !== this.authEpoch) {
      throw new ApiError(1001, "已退出登录");
    }

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

  // skipAuthRetry 默认 true：checkLoginStatus/relogin 内部调用时不能再触发重登，
  // 否则 401 会递归重登形成死循环。页面主动刷新资料时应传 false，让过期 token 自动重登。
  async fetchUserInfo(skipAuthRetry = true) {
    const res = await request<User>({
      url: "/user/user/info",
      method: "GET",
      skipAuthRetry,
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
        // 用户已主动退出时，失败是预期结果，再弹「登录已过期」只会造成困扰
        if (!this.isLoggedOut()) {
          wx.showToast({ title: "登录已过期，请重新进入", icon: "none" });
        }
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
