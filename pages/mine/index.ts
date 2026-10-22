import { request } from "../../utils/request";
import type { User } from "../../types/user";

interface IApp {
  globalData: {
    token: string;
    userInfo: User | null;
  };
}

Page({
  data: {
    userInfo: null as User | null,
  },

  onShow() {
    this.loadUserInfo();
  },

  async loadUserInfo() {
    const app = getApp<IApp>();

    if (app.globalData.userInfo) {
      this.setData({ userInfo: app.globalData.userInfo });
    }
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
      await request({ url: "/user/user/logout", method: "POST" });
    } catch {
      // 退出 API 失败不阻塞，继续清除本地数据
    }

    wx.removeStorageSync("token");
    wx.removeStorageSync("userInfo");
    const app = getApp<IApp>();
    app.globalData.token = "";
    app.globalData.userInfo = null;
    wx.reLaunch({ url: "/pages/index/index" });
  },
});
