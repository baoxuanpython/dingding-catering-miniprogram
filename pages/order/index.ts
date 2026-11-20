import { request } from "../../utils/request";
import type { OrderVO } from "../../types/order";
import type { PageResult } from "../../types/api";
import {
  buildOrderDishesText,
  cancelOrder,
  getOrderStatusText,
  payOrder,
  repeatOrder,
  sendOrderReminder,
  showPayFailModal,
} from "../../utils/order";

interface OrderCard extends OrderVO {
  statusText: string;
  dishesText: string;
}

interface IApp {
  requireLogin(): boolean;
  globalData: {
    orderListDirty?: boolean;
    orderListStatus?: number;
  };
}

const STATUS_OPTIONS = [
  { label: "全部", value: 0 },
  { label: "待付款", value: 1 },
  { label: "待接单", value: 2 },
  { label: "已接单", value: 3 },
  { label: "派送中", value: 4 },
  { label: "已完成", value: 5 },
  { label: "已取消", value: 6 },
  { label: "已退款", value: 7 },
];

Page({
  data: {
    orderList: [] as OrderCard[],
    page: 1,
    pageSize: 10,
    total: 0,
    status: 0,
    statusOptions: STATUS_OPTIONS,
    hasMore: true,
    loadingMore: false,
    refreshing: false,
    firstLoading: true,
    emptyText: "暂无订单",
  },

  inited: false,

  // 请求序号：快速切 tab 时丢弃已过期请求的响应，避免旧数据覆盖新 tab
  requestSeq: 0,

  onShow() {
    const app = getApp<IApp>();
    if (!app.requireLogin()) {
      return;
    }

    // 结算页支付失败后会要求定位到待付款：tabBar 页 switchTab 无法带参，只能借全局标记
    const pendingStatus = app.globalData.orderListStatus || 0;
    if (pendingStatus > 0) {
      app.globalData.orderListStatus = 0;
      app.globalData.orderListDirty = false;
      this.inited = true;
      this.applyStatus(pendingStatus);
      return;
    }

    if (!this.inited) {
      this.inited = true;
      this.fetchOrders(true, false);
      return;
    }

    // 详情页做了取消/支付等操作后会置脏标记，此时才重置列表，避免打断分页位置
    if (app.globalData.orderListDirty) {
      app.globalData.orderListDirty = false;
      this.fetchOrders(true, true);
    }
  },

  onStatusChange(e: WechatMiniprogram.TouchEvent) {
    const status = Number(e.currentTarget.dataset.status);

    if (status === this.data.status) {
      return;
    }

    this.applyStatus(status);
  },

  // 清空列表并按目标状态重新拉取，供 tab 点击与外部强制定位共用
  applyStatus(status: number) {
    // 先让在途请求失效，再清空列表，保证新 tab 的数据不会被旧响应污染
    this.requestSeq += 1;

    const option = STATUS_OPTIONS.find((item) => item.value === status);

    this.setData({
      status,
      orderList: [],
      page: 1,
      total: 0,
      hasMore: true,
      firstLoading: true,
      loadingMore: false,
      emptyText: status === 0 ? "暂无订单" : `暂无${option?.label ?? ""}订单`,
    });

    this.fetchOrders(true, true);
  },

  onRefresh() {
    if (this.data.refreshing) {
      return;
    }

    this.setData({ refreshing: true });

    this.fetchOrders(true, true).then(() => {
      this.setData({ refreshing: false });
    });
  },

  onLoadMore() {
    if (
      !this.data.hasMore ||
      this.data.loadingMore ||
      this.data.refreshing ||
      this.data.firstLoading
    ) {
      return;
    }

    this.setData({ loadingMore: true });
    this.fetchOrders(false, true);
  },

  async fetchOrders(reset: boolean, silent: boolean) {
    const seq = ++this.requestSeq;
    const page = reset ? 1 : this.data.page + 1;

    try {
      const res = await request<PageResult<OrderVO>>({
        url: "/user/order/historyOrders",
        params: {
          page,
          pageSize: this.data.pageSize,
          ...(this.data.status ? { status: this.data.status } : {}),
        },
        showLoading: !silent,
      });

      if (seq !== this.requestSeq) {
        return;
      }

      const records = res.data.records.map((item) => this.buildOrderCard(item));
      const orderList = reset ? records : [...this.data.orderList, ...records];

      this.setData({
        orderList,
        page,
        total: res.data.total,
        hasMore: orderList.length < res.data.total,
      });
    } catch (err) {
      console.error("加载订单失败:", err);
    } finally {
      if (seq === this.requestSeq) {
        this.setData({ loadingMore: false, firstLoading: false });
      }
    }
  },

  buildOrderCard(order: OrderVO): OrderCard {
    return {
      ...order,
      statusText: getOrderStatusText(order.status),
      dishesText: buildOrderDishesText(order),
    };
  },

  onOrderTap(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id);
    wx.navigateTo({
      url: `/subpackages/order-flow/pages/order/detail?id=${id}`,
    });
  },

  async onPayTap(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id);
    const order = this.data.orderList.find((item) => item.id === id);

    if (!order) {
      return;
    }

    const ok = await payOrder(order.number, order.payMethod || 1);

    if (!ok) {
      showPayFailModal();
      return;
    }

    // 支付成功后订单进入「待接单」
    this.applyStatusChange(id, 2);
  },

  async onCancelTap(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id);
    const ok = await cancelOrder(id);

    if (ok) {
      this.applyStatusChange(id, 6);
    }
  },

  async onReminderTap(e: WechatMiniprogram.TouchEvent) {
    await sendOrderReminder(Number(e.currentTarget.dataset.id));
  },

  async onRepeatTap(e: WechatMiniprogram.TouchEvent) {
    await repeatOrder(Number(e.currentTarget.dataset.id));
  },

  // 局部更新列表：状态与当前 tab 不符时直接移除卡片，不重新请求，保持滚动位置
  applyStatusChange(orderId: number, nextStatus: number) {
    const currentTab = this.data.status;

    if (currentTab !== 0 && currentTab !== nextStatus) {
      const orderList = this.data.orderList.filter(
        (item) => item.id !== orderId,
      );
      const total = Math.max(this.data.total - 1, 0);

      this.setData({
        orderList,
        total,
        hasMore: orderList.length < total,
      });
      return;
    }

    const orderList = this.data.orderList.map((item) =>
      item.id === orderId
        ? {
            ...item,
            status: nextStatus,
            statusText: getOrderStatusText(nextStatus),
          }
        : item,
    );

    this.setData({ orderList });
  },

  // 操作区容器拦截点击，避免点空白处误进详情
  noop() {},

  onGoShopping() {
    wx.switchTab({ url: "/pages/index/index" });
  },
});
