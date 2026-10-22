Component({
  options: {
    multipleSlots: true,
  },
  properties: {
    extClass: { type: String, value: "" },
    title: { type: String, value: "" },
    background: { type: String, value: "" },
    color: { type: String, value: "" },
    back: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
    homeButton: { type: Boolean, value: false },
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
  },

  lifetimes: {
    attached() {
      const { statusBarHeight } = wx.getWindowInfo();
      const { platform } = wx.getDeviceInfo();
      const menuButtonInfo = wx.getMenuButtonBoundingClientRect();

      this.setData({
        ios: platform === "ios",
        safeAreaTop: `padding-top: ${statusBarHeight}px`,
        innerPaddingRight: `padding-right: ${wx.getWindowInfo().windowWidth - menuButtonInfo.left}px`,
        leftWidth: `width: ${wx.getWindowInfo().windowWidth - menuButtonInfo.left}px`,
      });
    },
  },

  methods: {
    back() {
      const delta = this.data.delta ? this.data.delta : 1;
      if (getCurrentPages().length > 1) {
        wx.navigateBack({ delta });
      }
    },
    home() {
      wx.switchTab({ url: "/pages/index/index" });
    },
  },
});
