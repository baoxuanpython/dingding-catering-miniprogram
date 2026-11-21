Component({
  options: {
    multipleSlots: true,
  },
  properties: {
    extClass: { type: String, value: "" },
    title: { type: String, value: "" },
    background: { type: String, value: "" },
    color: { type: String, value: "" },
    // 三态：null 自动判断栈深、true 强制显示、false 强制隐藏
    back: { type: null, value: null },
    loading: { type: Boolean, value: false },
    animated: { type: Boolean, value: true },
    show: { type: Boolean, value: true },
    delta: { type: Number, value: 1 },
  },

  data: {
    displayStyle: "",
    ios: false,
    safeAreaTop: "",
    innerPaddingRight: "",
    leftWidth: "",
    showBack: false,
  },

  lifetimes: {
    attached() {
      const { statusBarHeight, windowWidth } = wx.getWindowInfo();
      const { platform } = wx.getDeviceInfo();
      const ios = platform === "ios";
      const navBarHeight = ios ? 44 : 48;

      // Skyline 初始化时序下该 API 可能抛异常并返回 undefined，
      // 取不到胶囊位置就按「胶囊宽 87px + 右边距 9px」兜底，保证右侧留白不为 0
      let menuButtonLeft = windowWidth - 96;

      try {
        const menuButtonInfo = wx.getMenuButtonBoundingClientRect();

        if (menuButtonInfo && typeof menuButtonInfo.left === "number") {
          menuButtonLeft = menuButtonInfo.left;
        }
      } catch (err) {
        console.error("获取胶囊按钮位置失败，使用兜底值:", err);
      }

      // 高度与内边距必须来自同一个 statusBarHeight，
      // 不能一边用 env(safe-area-inset-top)、一边用 JS 计算，否则两者不等值会把标题挤出可视区
      this.setData({
        ios,
        safeAreaTop: `height: ${statusBarHeight + navBarHeight}px; padding-top: ${statusBarHeight}px`,
        innerPaddingRight: `padding-right: ${windowWidth - menuButtonLeft}px`,
        leftWidth: `width: ${windowWidth - menuButtonLeft}px`,
      });

      this.computeShowBack();
    },
  },

  // attached 可能早于页面入栈完成，show 时再算一次消除时序问题
  pageLifetimes: {
    show() {
      this.computeShowBack();
    },
  },

  methods: {
    computeShowBack() {
      const { back } = this.data;

      if (back === true) {
        this.setData({ showBack: true });
        return;
      }

      if (back === false) {
        this.setData({ showBack: false });
        return;
      }

      this.setData({ showBack: getCurrentPages().length > 1 });
    },

    back() {
      const delta = this.data.delta ? this.data.delta : 1;

      // 栈底时 navigateBack 会失败，按钮沦为死按钮，统一降级回首页
      if (getCurrentPages().length > delta) {
        wx.navigateBack({
          delta,
          fail: () => {
            wx.switchTab({ url: "/pages/index/index" });
          },
        });
        return;
      }

      wx.switchTab({ url: "/pages/index/index" });
    },
  },
});
