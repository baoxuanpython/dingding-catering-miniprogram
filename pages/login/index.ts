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

      // wx.request 的 fail 回调给的是带 errMsg 的普通对象，request 层已弹过「网络异常」，
      // 这里再弹会把信息量更大的那条覆盖掉；但 wx.login 失败（login:fail）没有任何层提示过，必须自己弹
      const errMsg = (err as { errMsg?: string })?.errMsg ?? "";
      const isRequestFail = errMsg.startsWith("request:");

      if (!isRequestFail) {
        wx.showToast({ title: "登录失败，请重试", icon: "none" });
      }

      this.setData({ logging: false });
    }
  },
});
