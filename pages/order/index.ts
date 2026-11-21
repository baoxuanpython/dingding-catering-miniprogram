import { request } from "../../utils/request";
import type { OrderVO } from "../../types/order";
import type { PageResult } from "../../types/api";
import {
  buildOrderDishesText,
  cancelOrder,
  getOrderStatusText,
  hasReminded,
  payOrder,
  repeatOrder,
  sendOrderReminder,
  showPayFailModal,
} from "../../utils/order";

interface OrderCard extends OrderVO {
  statusText: string;
  dishesText: string;
  reminded: boolean;
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

// 刷新头最短停留时长：请求过快时会一闪而过，看起来像页面抽动而不是刷新
const REFRESH_MIN_DURATION = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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
    cancelVisible: false,
    cancelOrderId: 0,
  },

  inited: false,

  // 请求序号：快速切 tab 时丢弃已过期请求的响应，避免旧数据覆盖新 tab
  requestSeq: 0,

  async onShow() {
    const app = getApp<IApp>();

    // 冷启动时 initLogin 还在校验 token，必须先等门闩放行，
    // 否则会拿未经校验的旧 token 直接发请求（失效时还会触发并发重登）
    await app.waitForLogin();

    if (!app.requireLogin()) {
      return;
    }

    // 结算页支付失败后会要求定位到待付款：tabBar 页 switchTab 无法带参，只能借全局标记
    const pendingStatus = app.globalData.orderListStatus || 0;
    const dirty = Boolean(app.globalData.orderListDirty);

    if (pendingStatus > 0) {
      app.globalData.orderListStatus = 0;
      app.globalData.orderListDirty = false;
      this.inited = true;
      this.applyStatus(pendingStatus);
    } else if (!this.inited) {
      this.inited = true;
      this.fetchOrders(true, false);
    } else if (dirty) {
      // 详情页做了取消/支付等操作后会置脏标记，此时才重置列表，避免打断分页位置
      app.globalData.orderListDirty = false;
      this.fetchOrders(true, true);
    }

    // 数据拉取决策已先行执行，这里只做按钮态重算，
    // 放在最后并用 try/catch 兜住，任何异常都不能再阻断首屏加载
    try {
      // 催单状态存在本地，详情页催过后返回这里必须重算，否则按钮还停在「催单」
      this.syncRemindedState();
    } catch (err) {
      console.error("同步催单状态失败:", err);
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

  async onRefresh() {
    if (this.data.refreshing) {
      return;
    }

    // 只要 refresher-triggered 保持 true，刷新头就停在下拉位置不回弹，请求结束才释放
    this.setData({ refreshing: true });

    const [ok] = await Promise.all([
      this.fetchOrders(true, true),
      delay(REFRESH_MIN_DURATION),
    ]);

    // 先回弹再提示，避免 toast 和回弹动画同时出现在屏幕顶部
    this.setData({ refreshing: false });

    // 失败时由 request 层弹出具体原因，这里只在真正刷新成功时给正向反馈
    if (ok) {
      wx.nextTick(() => {
        wx.showToast({ title: "已刷新", icon: "none" });
      });
    }
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

  // 返回值表示「本次响应是否真的写入了列表」，供下拉刷新决定要不要给成功反馈
  async fetchOrders(reset: boolean, silent: boolean): Promise<boolean> {
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

      // 已被更新的请求顶掉，本次响应作废，不能当作刷新成功
      if (seq !== this.requestSeq) {
        return false;
      }

      const records = res.data.records.map((item) => this.buildOrderCard(item));
      const orderList = reset ? records : [...this.data.orderList, ...records];

      this.setData({
        orderList,
        page,
        total: res.data.total,
        hasMore: orderList.length < res.data.total,
      });

      return true;
    } catch (err) {
      console.error("加载订单失败:", err);
      return false;
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
      reminded: hasReminded(order.id),
    };
  },

  // 只有状态真的变化才 setData，避免 Skyline 下对整列表做无意义的重渲染
  syncRemindedState() {
    let changed = false;

    const orderList = this.data.orderList.map((item) => {
      const reminded = hasReminded(item.id);

      if (item.reminded === reminded) {
        return item;
      }

      changed = true;
      return { ...item, reminded };
    });

    if (changed) {
      this.setData({ orderList });
    }
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

    const result = await payOrder(order.number, order.payMethod || 1);

    // 「paying」表示同一订单的支付请求还在飞，属于重复点击，静默忽略
    if (result === "paying") {
      return;
    }

    if (result === "failed") {
      showPayFailModal();
      return;
    }

    // 支付成功后订单进入「待接单」
    this.applyStatusChange(id, 2);
  },

  onCancelTap(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id);

    this.setData({ cancelVisible: true, cancelOrderId: id });
  },

  onCancelClose() {
    this.setData({ cancelVisible: false, cancelOrderId: 0 });
  },

  async onCancelConfirm(e: WechatMiniprogram.CustomEvent<{ reason: string }>) {
    const id = this.data.cancelOrderId;

    if (!id) {
      return;
    }

    // 先收起弹层，避免请求期间用户继续点「确定取消」
    this.setData({ cancelVisible: false, cancelOrderId: 0 });

    const ok = await cancelOrder(id, e.detail.reason);

    if (ok) {
      this.applyStatusChange(id, 6);
    }
  },

  async onReminderTap(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id);
    const result = await sendOrderReminder(id);

    // 成功或后端限流都意味着「本单已催」，统一重算按钮态，不在回调里手改单条
    if (result === "success" || result === "reminded") {
      this.syncRemindedState();
      return;
    }

    // 订单状态或归属已与服务端不符，静默重拉让列表收敛到真实状态
    if (result === "stale") {
      this.fetchOrders(true, true);
    }
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
