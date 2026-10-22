import { request } from "../../../../utils/request";
import type { OrderVO, OrdersCancelDTO } from "../../../../types/order";

Page({
  data: {
    order: null as OrderVO | null,
  },

  onLoad(options: Record<string, string | undefined>) {
    if (options.id) {
      this.loadOrderDetail(Number(options.id));
    }
  },

  async loadOrderDetail(id: number) {
    try {
      const res = await request<OrderVO>({
        url: `/user/order/orderDetail/${id}`,
        showLoading: true,
      });
      this.setData({ order: res.data });
    } catch (err) {
      console.error("加载订单详情失败:", err);
    }
  },

  async onReminder() {
    if (!this.data.order) return;

    try {
      await request<string>({
        url: `/user/order/reminder/${this.data.order.id}`,
        method: "GET",
        showLoading: true,
      });
      wx.showToast({ title: "催单成功", icon: "success" });
    } catch (err) {
      console.error("催单失败:", err);
    }
  },

  onCancel() {
    wx.showModal({
      title: "取消订单",
      content: "确定要取消该订单吗？",
      editable: true,
      placeholderText: "请输入取消原因",
      success: async (res) => {
        if (res.confirm && this.data.order) {
          try {
            await request<string>({
              url: `/user/order/cancel/${this.data.order.id}`,
              method: "PUT",
              data: {
                cancelReason: res.content || "用户主动取消",
              } as OrdersCancelDTO,
              showLoading: true,
            });
            wx.showToast({ title: "订单已取消", icon: "success" });
            setTimeout(() => {
              wx.navigateBack();
            }, 1500);
          } catch (err) {
            console.error("取消订单失败:", err);
          }
        }
      },
    });
  },

  async onRepetition() {
    if (!this.data.order) return;

    try {
      await request<string>({
        url: `/user/order/repetition/${this.data.order.id}`,
        method: "POST",
        showLoading: true,
      });
      wx.showToast({ title: "已加入购物车", icon: "success" });
      wx.switchTab({ url: "/pages/cart/index" });
    } catch (err) {
      console.error("再来一单失败:", err);
    }
  },
});
