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
    } as AddressBookDTO,
    region: [] as string[],
    // WXML 表达式不支持方法调用（如 region.join），只能由 TS 预先拼好
    regionText: "请选择省/市/区",
  },

  // 保存是不可逆操作，双击会新增两条完全相同的地址
  saving: false,

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
        regionText: [data.provinceName, data.cityName, data.districtName]
          .filter((item) => item)
          .join(" "),
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
      regionText: [provinceName, cityName, districtName]
        .filter((item) => item)
        .join(" "),
      "form.provinceName": provinceName,
      "form.cityName": cityName,
      "form.districtName": districtName,
      "form.provinceCode": provinceCode,
      "form.cityCode": cityCode,
      "form.districtCode": districtCode,
    });
  },

  // WXML 事件绑定只能写方法名，参数通过 data-field 传入
  onInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as keyof AddressBookDTO;

    if (!field) {
      return;
    }

    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onRadioChange(e: WechatMiniprogram.RadioGroupChange) {
    this.setData({ "form.sex": e.detail.value });
  },

  onSwitchChange(e: WechatMiniprogram.SwitchChange) {
    this.setData({ "form.isDefault": e.detail.value ? 1 : 0 });
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
    if (this.saving) {
      return;
    }

    if (!this.validateForm()) return;

    this.saving = true;

    // 新增时 id 无业务语义，带着 id:0 提交等于赌后端宽容，这里显式剔除
    const { id, ...rest } = this.data.form;
    const payload: AddressBookDTO = this.data.isEdit ? { ...rest, id } : rest;

    try {
      const method = this.data.isEdit ? "PUT" : "POST";
      await request<AddressBook>({
        url: "/user/addressBook",
        method,
        data: payload,
        showLoading: true,
      });

      wx.showToast({
        title: this.data.isEdit ? "修改成功" : "添加成功",
        icon: "success",
      });
      // toast 是浮层，页面退出后仍会显示完；延迟返回期间用户若手动返回会连退两层
      wx.navigateBack();
    } catch (err) {
      console.error("保存地址失败:", err);
    } finally {
      this.saving = false;
    }
  },
});
