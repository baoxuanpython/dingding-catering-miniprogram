import { request } from "../../../../utils/request";
import type { AddressBook, AddressBookDTO } from "../../../../types/address";

Page({
  data: {
    isEdit: false,
    form: {
      id: 0,
      consignee: "",
      phone: "",
      sex: "",
      provinceName: "",
      cityName: "",
      districtName: "",
      detail: "",
      label: "",
      isDefault: 0,
    } as AddressBookDTO & {
      provinceCode?: string;
      cityCode?: string;
      districtCode?: string;
    },
    region: [] as string[],
  },

  onLoad(options: Record<string, string | undefined>) {
    if (options.id) {
      this.setData({ isEdit: true });
      this.loadAddressDetail(Number(options.id));
    }
  },

  async loadAddressDetail(id: number) {
    try {
      const res = await request<AddressBook>({
        url: `/user/addressBook/${id}`,
        showLoading: true,
      });

      const data = res.data;
      this.setData({
        form: {
          ...data,
        },
        region: [data.provinceName, data.cityName, data.districtName],
      });
    } catch (err) {
      console.error("加载地址详情失败:", err);
    }
  },

  onRegionChange(e: WechatMiniprogram.PickerChange) {
    const [provinceName, cityName, districtName] = e.detail.value as string[];
    const [provinceCode, cityCode, districtCode] = e.detail.code as string[];

    this.setData({
      region: e.detail.value as string[],
      "form.provinceName": provinceName,
      "form.cityName": cityName,
      "form.districtName": districtName,
      "form.provinceCode": provinceCode,
      "form.cityCode": cityCode,
      "form.districtCode": districtCode,
    });
  },

  onInput(e: WechatMiniprogram.Input, field: keyof AddressBookDTO) {
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  validateForm(): boolean {
    const { consignee, phone, sex, detail } = this.data.form;

    if (!consignee) {
      wx.showToast({ title: "请输入收件人", icon: "none" });
      return false;
    }
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: "请输入正确的手机号", icon: "none" });
      return false;
    }
    if (!sex) {
      wx.showToast({ title: "请选择性别", icon: "none" });
      return false;
    }
    if (!detail) {
      wx.showToast({ title: "请输入详细地址", icon: "none" });
      return false;
    }

    return true;
  },

  async onSave() {
    if (!this.validateForm()) return;

    try {
      const method = this.data.isEdit ? "PUT" : "POST";
      await request<AddressBook>({
        url: "/user/addressBook",
        method,
        data: this.data.form,
        showLoading: true,
      });

      wx.showToast({
        title: this.data.isEdit ? "修改成功" : "添加成功",
        icon: "success",
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (err) {
      console.error("保存地址失败:", err);
    }
  },
});
