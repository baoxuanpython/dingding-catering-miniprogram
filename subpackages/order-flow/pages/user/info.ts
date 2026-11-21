import { request, uploadFile } from "../../../../utils/request";
import { normalizeImageUrl } from "../../../../utils/image";
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
    // 加载失败时表单里全是空串，此时保存会把后端的手机号/性别/身份证整体覆盖成空值
    loadFailed: false,
    uploading: false,
  },

  // 保存是不可逆操作，双击会发出两次 PUT
  saving: false,

  onLoad() {
    this.loadUserInfo();
  },

  async loadUserInfo() {
    this.setData({ loadFailed: false });

    try {
      const res = await request<User>({
        url: "/user/user/info",
        showLoading: true,
      });

      this.setData({
        form: {
          name: res.data.name || "",
          avatar: normalizeImageUrl(res.data.avatar),
          phone: res.data.phone || "",
          sex: res.data.sex || "",
          idNumber: res.data.idNumber || "",
        },
      });
    } catch (err) {
      console.error("加载用户信息失败:", err);
      // 没有原始资料时不允许保存，否则会用空表单覆盖服务端已有数据
      this.setData({ loadFailed: true });
    }
  },

  onRetryLoad() {
    this.loadUserInfo();
  },

  onChooseAvatar(e: WechatMiniprogram.CustomEvent) {
    const { avatarUrl } = e.detail;

    // 用户取消选择时 avatarUrl 为空，直接返回避免无谓上传
    if (!avatarUrl) {
      return;
    }

    // 连点会并发上传，先发起的请求可能后返回，最终保存的是用户已放弃的那张
    if (this.data.uploading) {
      return;
    }

    this.uploadAvatar(avatarUrl);
  },

  async uploadAvatar(filePath: string) {
    this.setData({ uploading: true });

    try {
      const url = await uploadFile(filePath);
      this.setData({ "form.avatar": url });
      wx.showToast({ title: "头像上传成功", icon: "success" });
    } catch (err) {
      console.error("头像上传失败:", err);
    } finally {
      this.setData({ uploading: false });
    }
  },

  onInputNickname(e: WechatMiniprogram.Input) {
    this.setData({ "form.name": e.detail.value });
  },

  // WXML 事件绑定只能写方法名，参数通过 data-field 传入
  onInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as keyof UserEditDTO;

    if (!field) {
      return;
    }

    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onRadioChange(e: WechatMiniprogram.RadioGroupChange) {
    this.setData({ "form.sex": e.detail.value });
  },

  async onSave() {
    if (this.saving) {
      return;
    }

    // 原始资料没拉到就保存，等于把后端已有的手机号/性别/身份证全部清空
    if (this.data.loadFailed) {
      wx.showToast({ title: "资料加载失败，请先重试", icon: "none" });
      return;
    }

    const { name } = this.data.form;

    if (!name) {
      wx.showToast({ title: "请输入昵称", icon: "none" });
      return;
    }

    this.saving = true;

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

      // toast 是浮层，页面退出后仍会显示完，不需要靠延迟来展示
      wx.navigateBack();
    } catch (err) {
      console.error("保存用户信息失败:", err);
    } finally {
      this.saving = false;
    }
  },
});
