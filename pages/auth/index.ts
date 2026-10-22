import { request, uploadFile } from "../../utils/request";
import type { User } from "../../types/user";
import type { UserEditDTO } from "../../types/user";

Page({
  data: {
    avatarUrl: "",
    nickname: "",
    saving: false,
  },

  onChooseAvatar(e: WechatMiniprogram.CustomEvent) {
    const { avatarUrl } = e.detail;
    this.setData({ avatarUrl });
  },

  onNicknameInput(e: WechatMiniprogram.Input) {
    this.setData({ nickname: e.detail.value });
  },

  async onSave() {
    const { avatarUrl, nickname } = this.data;

    if (!avatarUrl && !nickname) {
      wx.showToast({ title: "请至少完善一项信息", icon: "none" });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: "保存中...", mask: true });

    try {
      const dto: UserEditDTO = {};

      if (avatarUrl) {
        const ossUrl = await uploadFile(avatarUrl);
        dto.avatar = ossUrl;
      }

      if (nickname) {
        dto.name = nickname;
      }

      const res = await request<User>({
        url: "/user/user/info",
        method: "PUT",
        data: dto,
      });

      const app = getApp<{ globalData: { userInfo: User; token: string } }>();
      app.globalData.userInfo = res.data;
      wx.setStorageSync("userInfo", res.data);

      wx.hideLoading();
      wx.showToast({ title: "保存成功", icon: "success" });
      setTimeout(() => {
        wx.reLaunch({ url: "/pages/index/index" });
      }, 800);
    } catch {
      this.setData({ saving: false });
      wx.hideLoading();
    }
  },

  onSkip() {
    wx.reLaunch({ url: "/pages/index/index" });
  },
});
