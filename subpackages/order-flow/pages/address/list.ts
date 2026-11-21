import { request } from "../../../../utils/request";
import type { AddressBook, SetDefaultDTO } from "../../../../types/address";

Page({
  data: {
    addressList: [] as AddressBook[],
    selectMode: false,
    // 失败时列表为空，界面会显示「暂无收货地址」，用户会以为地址被删光了
    loadFailed: false,
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ selectMode: options.selectMode === "1" });
  },

  // 删除是不可逆操作，确认框渲染前的空窗会让双击发出两次
  deletingIds: {} as Record<number, boolean>,

  // 设置默认地址虽然是幂等 PUT，但连点会叠出多条成功提示
  defaultingIds: {} as Record<number, boolean>,

  // onShow 已覆盖「首次进入」与「编辑后返回」两种场景，onLoad 不再重复请求
  onShow() {
    // 首次进入需要 loading，之后每次返回只做静默刷新，避免全屏 loading 反复闪烁
    this.loadAddressList(this.inited);
    this.inited = true;
  },

  inited: false,

  async loadAddressList(silent = false) {
    try {
      const res = await request<AddressBook[]>({
        url: "/user/addressBook/list",
        showLoading: !silent,
      });
      this.setData({ addressList: res.data, loadFailed: false });
    } catch (err) {
      console.error("加载地址列表失败:", err);
      // 静默刷新失败保留现有列表；首屏失败必须给重试入口
      this.setData({ loadFailed: !silent });
    }
  },

  onRetryLoad() {
    this.setData({ loadFailed: false });
    this.loadAddressList();
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

    if (this.defaultingIds[id]) {
      return;
    }

    this.defaultingIds[id] = true;

    try {
      await request<string>({
        url: "/user/addressBook/default",
        method: "PUT",
        data: { id } as SetDefaultDTO,
        showLoading: true,
      });
      wx.showToast({ title: "设置成功", icon: "success" });
      this.loadAddressList(true);
    } catch (err) {
      console.error("设置默认地址失败:", err);
    } finally {
      delete this.defaultingIds[id];
    }
  },

  async onDelete(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as number;

    if (this.deletingIds[id]) {
      return;
    }

    wx.showModal({
      title: "提示",
      content: "确定要删除该地址吗？",
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        if (this.deletingIds[id]) {
          return;
        }

        this.deletingIds[id] = true;

        try {
          await request<string>({
            url: "/user/addressBook",
            method: "DELETE",
            params: { id },
            showLoading: true,
          });
          wx.showToast({ title: "删除成功", icon: "success" });
          this.loadAddressList(true);
        } catch (err) {
          console.error("删除地址失败:", err);
        } finally {
          this.deletingIds[id] = false;
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
