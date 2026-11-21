const REASON_OPTIONS = [
  "不想要了",
  "点错了",
  "商家接单太慢",
  "配送太慢",
  "其他原因",
];

const OTHER_INDEX = REASON_OPTIONS.length - 1;

const MAX_CUSTOM_LENGTH = 100;

Component({
  properties: {
    visible: { type: Boolean, value: false },
  },

  data: {
    options: REASON_OPTIONS,
    maxLength: MAX_CUSTOM_LENGTH,
    selectedIndex: -1,
    customReason: "",
    countText: `0/${MAX_CUSTOM_LENGTH}`,
    isOther: false,
    confirming: false,
  },

  observers: {
    // 关闭时清空选择，避免下次打开还残留上一次的原因
    visible(
      this: WechatMiniprogram.Component.TrivialInstance,
      visible: boolean,
    ) {
      if (visible) {
        return;
      }

      this.setData({
        selectedIndex: -1,
        customReason: "",
        countText: `0/${MAX_CUSTOM_LENGTH}`,
        isOther: false,
        confirming: false,
      });
    },
  },

  methods: {
    noop() {
      // 阻止点击面板空白处穿透到遮罩
    },

    onClose() {
      if (this.data.confirming) {
        return;
      }

      this.triggerEvent("close");
    },

    onSelect(e: WechatMiniprogram.TouchEvent) {
      const index = e.currentTarget.dataset.index as number;

      this.setData({
        selectedIndex: index,
        isOther: index === OTHER_INDEX,
      });
    },

    onInput(e: WechatMiniprogram.Input) {
      const value = e.detail.value;

      this.setData({
        customReason: value,
        countText: `${value.length}/${MAX_CUSTOM_LENGTH}`,
      });
    },

    // 组件只负责收集原因，发请求与成功后的页面跳转交给调用方
    onConfirm() {
      if (this.data.confirming) {
        return;
      }

      const { selectedIndex, customReason } = this.data;

      if (selectedIndex < 0) {
        wx.showToast({ title: "请选择取消原因", icon: "none" });
        return;
      }

      const custom = customReason.trim();

      if (selectedIndex === OTHER_INDEX && !custom) {
        wx.showToast({ title: "请填写取消原因", icon: "none" });
        return;
      }

      // 面板收起前存在空窗，双击会触发两次，这里先置位挡住第二次
      this.setData({ confirming: true });

      this.triggerEvent("confirm", {
        reason:
          selectedIndex === OTHER_INDEX
            ? custom
            : REASON_OPTIONS[selectedIndex],
      });
    },
  },
});
