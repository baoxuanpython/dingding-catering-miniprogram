import { request } from "../../../../utils/request";
import type { AddressBook, SetDefaultDTO } from "../../../../types/address";

Page({
  data: {
    addressList: [] as AddressBook[],
    selectMode: false,
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ selectMode: options.selectMode === "1" });
  },

  // onShow 已覆盖「首次进入」与「编辑后返回」两种场景，onLoad 不再重复请求
  onShow() {
    this.loadAddressList();
  },

  async loadAddressList() {
    try {
      const res = await request<AddressBook[]>({
        url: "/user/addressBook/list",
        showLoading: true,
      });
      this.setData({ addressList: res.data });
    } catch (err) {
      console.error("加载地址列表失败:", err);
    }
  },

  onTapAdd() {
    wx.navigateTo({ url: "/subpackages/order-flow/pages/address/edit" });
  },

  onTapEdit(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as number;
    wx.navigateTo({
      url: `/subpackages/order-flow/pages/address/edit?id=${id}`,
    });
  },

  async onSetDefault(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as number;

    try {
      await request<string>({
        url: "/user/addressBook/default",
        method: "PUT",
        data: { id } as SetDefaultDTO,
        showLoading: true,
      });
      wx.showToast({ title: "设置成功", icon: "success" });
      this.loadAddressList();
    } catch (err) {
      console.error("设置默认地址失败:", err);
    }
  },

  async onDelete(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as number;

    wx.showModal({
      title: "提示",
      content: "确定要删除该地址吗？",
      success: async (res) => {
        if (res.confirm) {
          try {
            await request<string>({
              url: "/user/addressBook",
              method: "DELETE",
              params: { id },
              showLoading: true,
            });
            wx.showToast({ title: "删除成功", icon: "success" });
            this.loadAddressList();
          } catch (err) {
            console.error("删除地址失败:", err);
          }
        }
      },
    });
  },

  onSelect(e: WechatMiniprogram.TouchEvent) {
    if (!this.data.selectMode) return;

    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2] as {
      setData: (data: Record<string, unknown>) => void;
    };
    const address = e.currentTarget.dataset.address as AddressBook;

    if (prevPage) {
      prevPage.setData({ address });
      wx.navigateBack();
    }
  },
});
