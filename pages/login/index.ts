interface IApp {
  globalData: {
    token: string;
  };
  login(): Promise<void>;
}

Page({
  data: {
    logging: false,
  },

  async onTapLogin() {
    if (this.data.logging) {
      return;
    }

    const app = getApp<IApp>();
    this.setData({ logging: true });

    try {
      await app.login();
      // 资料缺失不再拦截进入首页，改由「我的」页展示引导入口
      wx.reLaunch({ url: "/pages/index/index" });
    } catch (err) {
      console.error("登录失败:", err);
      wx.showToast({ title: "登录失败，请重试", icon: "none" });
      this.setData({ logging: false });
    }
  },
});
