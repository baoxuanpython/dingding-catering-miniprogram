import { request } from "../../utils/request";
import { normalizeImageUrl } from "../../utils/image";
import type { User } from "../../types/user";

Page({
  data: {
    userInfo: null as User | null,
    needProfile: false,
    // 失败时 userInfo 保持 null，界面会永远停在「加载中」且没有任何重试入口
    loadFailed: false,
  },

  // 退出登录会重置整个页面栈，双击容易让登录页出现白屏/闪烁
  loggingOut: false,

  async onShow() {
    const app = getApp<IApp>();

    // 冷启动时 initLogin 还在校验 token，必须先等门闩放行，
    // 否则会拿未经校验的旧 token 直接发请求（失效时还会触发并发重登）
    await app.waitForLogin();

    if (!app.requireLogin()) {
      return;
    }
    this.loadUserInfo();
  },

  async loadUserInfo() {
    const app = getApp<IApp>();

    if (app.globalData.userInfo) {
      this.applyUserInfo(app.globalData.userInfo);
    }

    // 昵称/头像可能在其它端被修改，静默拉一次保证展示的是最新值；
    // 传 false 让过期 token 走自动重登，否则这里会永远停在缓存旧值
    try {
      await app.fetchUserInfo(false);
      this.applyUserInfo(app.globalData.userInfo);
    } catch (err) {
      console.error("刷新用户信息失败:", err);
      // 缓存也没有资料时才需要兜底 UI，否则继续展示缓存值即可
      if (!this.data.userInfo) {
        this.setData({ loadFailed: true });
      }
    }
  },

  onRetryLoad() {
    this.setData({ loadFailed: false });
    this.loadUserInfo();
  },

  applyUserInfo(userInfo: User | null) {
    const app = getApp<IApp>();

    this.setData({
      // 后端可能返回相对路径，直接渲染会变成包内绝对路径导致加载失败
      userInfo: userInfo
        ? { ...userInfo, avatar: normalizeImageUrl(userInfo.avatar) }
        : null,
      needProfile: app.isProfileIncomplete(),
      loadFailed: false,
    });
  },

  onTapHeader() {
    // 失败态下没有资料可展示，点击改为重试，而不是跳到一个同样空白的个人信息页
    if (this.data.loadFailed) {
      this.onRetryLoad();
      return;
    }

    this.onTapEditProfile();
  },

  onTapOrders() {
    wx.switchTab({ url: "/pages/order/index" });
  },

  onTapEditProfile() {
    wx.navigateTo({ url: "/subpackages/order-flow/pages/user/info" });
  },

  onTapAddress() {
    wx.navigateTo({ url: "/subpackages/order-flow/pages/address/list" });
  },

  onTapLogout() {
    if (this.loggingOut) {
      return;
    }

    wx.showModal({
      title: "提示",
      content: "确定要退出登录吗？",
      success: (res) => {
        if (res.confirm) {
          this.doLogout();
        }
      },
    });
  },

  async doLogout() {
    if (this.loggingOut) {
      return;
    }

    this.loggingOut = true;

    try {
      // 跳过 401 自动重登：token 已过期时不应把用户又登回去
      await request({
        url: "/user/user/logout",
        method: "POST",
        skipAuthRetry: true,
        // 退出失败不阻断本地清理，也不该用 toast 打断用户
        silentError: true,
      });
    } catch {
      // 退出 API 失败不阻塞，继续清除本地数据
    }

    // logout 内部会 reLaunch 到登录页，本页随即销毁，无需复位标记
    const app = getApp<IApp>();
    app.logout();
  },
});
