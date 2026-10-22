import { request, uploadFile } from "../../../../utils/request";
import type { User, UserEditDTO } from "../../../../types/user";

Page({
  data: {
    form: {
      name: "",
      avatar: "",
      phone: "",
      sex: "",
      idNumber: "",
    } as UserEditDTO,
  },

  onLoad() {
    this.loadUserInfo();
  },

  async loadUserInfo() {
    try {
      const res = await request<User>({
        url: "/user/user/info",
        showLoading: true,
      });

      this.setData({
        form: {
          name: res.data.name || "",
          avatar: res.data.avatar || "",
          phone: res.data.phone || "",
          sex: res.data.sex || "",
          idNumber: res.data.idNumber || "",
        },
      });
    } catch (err) {
      console.error("加载用户信息失败:", err);
    }
  },

  onChooseAvatar(e: WechatMiniprogram.CustomEvent) {
    const { avatarUrl } = e.detail;
    this.uploadAvatar(avatarUrl);
  },

  async uploadAvatar(filePath: string) {
    try {
      const url = await uploadFile(filePath);
      this.setData({ "form.avatar": url });
      wx.showToast({ title: "头像上传成功", icon: "success" });
    } catch (err) {
      console.error("头像上传失败:", err);
    }
  },

  onInputNickname(e: WechatMiniprogram.Input) {
    this.setData({ "form.name": e.detail.value });
  },

  onInput(e: WechatMiniprogram.Input, field: keyof UserEditDTO) {
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  async onSave() {
    const { name } = this.data.form;

    if (!name) {
      wx.showToast({ title: "请输入昵称", icon: "none" });
      return;
    }

    try {
      const res = await request<User>({
        url: "/user/user/info",
        method: "PUT",
        data: this.data.form,
        showLoading: true,
      });

      wx.showToast({ title: "保存成功", icon: "success" });

      const app = getApp<{ globalData: { userInfo: User | null } }>();
      if (app) {
        app.globalData.userInfo = res.data;
        wx.setStorageSync("userInfo", res.data);
      }

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (err) {
      console.error("保存用户信息失败:", err);
    }
  },
});
