import { request } from "../../utils/request";
import type { OrderVO } from "../../types/order";
import type { PageResult } from "../../types/api";

Page({
  data: {
    orderList: [] as OrderVO[],
    page: 1,
    pageSize: 10,
    total: 0,
    status: 0,
    statusOptions: [
      { label: "全部", value: 0 },
      { label: "待付款", value: 1 },
      { label: "待接单", value: 2 },
      { label: "已接单", value: 3 },
      { label: "派送中", value: 4 },
      { label: "已完成", value: 5 },
      { label: "已取消", value: 6 },
      { label: "已退款", value: 7 },
    ],
  },

  onShow() {
    this.loadOrders();
  },

  onStatusChange(e: WechatMiniprogram.TouchEvent) {
    const status = e.currentTarget.dataset.status as number;
    this.setData({ status, page: 1 });
    this.loadOrders();
  },

  async loadOrders() {
    try {
      const res = await request<PageResult<OrderVO>>({
        url: "/user/order/historyOrders",
        data: {
          page: this.data.page,
          pageSize: this.data.pageSize,
          ...(this.data.status ? { status: this.data.status } : {}),
        },
        showLoading: true,
      });

      this.setData({
        orderList: res.data.records,
        total: res.data.total,
      });
    } catch (err) {
      console.error("加载订单失败:", err);
    }
  },

  onOrderTap(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as number;
    wx.navigateTo({
      url: `/subpackages/order-flow/pages/order/detail?id=${id}`,
    });
  },
});
