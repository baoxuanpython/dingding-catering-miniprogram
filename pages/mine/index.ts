import { request } from "../../utils/request";
import type { User } from "../../types/user";

interface IApp {
  globalData: {
    token: string;
    userInfo: User | null;
  };
  requireLogin(): boolean;
  logout(): void;
  fetchUserInfo(): Promise<void>;
  isProfileIncomplete(): boolean;
}

Page({
  data: {
    userInfo: null as User | null,
    needProfile: false,
  },

  onShow() {
    const app = getApp<IApp>();
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

    // 昵称/头像可能在其它端被修改，静默拉一次保证展示的是最新值
    try {
      await app.fetchUserInfo();
      this.applyUserInfo(app.globalData.userInfo);
    } catch (err) {
      console.error("刷新用户信息失败:", err);
    }
  },

  applyUserInfo(userInfo: User | null) {
    const app = getApp<IApp>();

    this.setData({
      userInfo,
      needProfile: app.isProfileIncomplete(),
    });
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
    try {
      // 跳过 401 自动重登：token 已过期时不应把用户又登回去
      await request({
        url: "/user/user/logout",
        method: "POST",
        skipAuthRetry: true,
      });
    } catch {
      // 退出 API 失败不阻塞，继续清除本地数据
    }

    const app = getApp<IApp>();
    app.logout();
  },
});
