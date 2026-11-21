import { request } from "../../../../utils/request";
import { normalizeImageUrl } from "../../../../utils/image";
import type { OrderDetail, OrderVO } from "../../../../types/order";
import type { SetMealDish } from "../../../../types/setmeal";
import {
  cancelOrder,
  getOrderStatusText,
  hasReminded,
  payOrder,
  repeatOrder,
  sendOrderReminder,
  showPayFailModal,
} from "../../../../utils/order";

// 状态副文案回答「我现在该做什么」，无对应文案的状态不渲染这一行
const STATUS_SUB_TEXT: Record<number, string> = {
  1: "请尽快完成支付，超时订单会自动取消",
  2: "商家正在确认订单，请耐心等待",
  3: "商家已接单，正在备餐",
  4: "骑手正在赶来，请注意接听电话",
  5: "订单已完成，感谢您的光临",
  6: "订单已取消",
  7: "退款已处理，请留意到账",
};

interface OrderItemView {
  key: string;
  name: string;
  image: string;
  priceText: string;
  copies: number;
  subDishes: string[];
  flavors: string[];
  isSetmeal: boolean;
}

interface OrderView extends Omit<OrderVO, "orderDetailList"> {
  statusText: string;
  statusSubText: string;
  itemList: OrderItemView[];
  amountLabel: string;
  goodsAmountText: string;
  packAmountText: string;
  showPackAmount: boolean;
  amountText: string;
  showRemark: boolean;
  tablewareText: string;
  deliveryText: string;
  deliveryTimeLabel: string;
  deliveryTimeText: string;
  showDeliveryTime: boolean;
  showCheckoutTime: boolean;
  showCancelCard: boolean;
  cancelReasonText: string;
  cancelTimeText: string;
  reminded: boolean;
}

function formatAmount(value: number | undefined | null): string {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : "0.00";
}

// WXML 表达式不支持方法调用（如 split），口味文本必须在 TS 里拼好
function buildFlavorText(detail: OrderDetail): string {
  const names = (detail.flavorName || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const values = (detail.flavorVal || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (names.length === 0 && values.length === 0) {
    return "";
  }

  if (names.length === values.length) {
    return names.map((name, index) => `${name}：${values[index]}`).join("  ");
  }

  return values.join("、");
}

// 套餐内含菜品只在 setmealVO 被后端填充时才有，缺失时降级为不展开
function buildSetmealDishes(detail: OrderDetail): string[] {
  // order.d.ts 里 setmealVO 的类型未解析（skipLibCheck 跳过 .d.ts 检查），
  // 不显式标注会让回调参数退化成 any
  const dishes: SetMealDish[] = detail.setmealVO?.setmealDishes ?? [];

  return dishes
    .filter((dish) => dish.name)
    .map((dish) =>
      dish.copies > 1 ? `${dish.name} ×${dish.copies}` : dish.name,
    );
}

// 套餐在明细里被展开成多条、name 全等于套餐名，必须按 setmealId 归并，
// 否则同一个套餐会重复渲染成好几行
function buildItemList(details: OrderDetail[]): OrderItemView[] {
  const groups = new Map<string, OrderItemView>();

  details.forEach((detail) => {
    const isSetmeal = detail.setmealId != null;
    const key = isSetmeal ? `setmeal-${detail.setmealId}` : `dish-${detail.id}`;
    const flavorText = buildFlavorText(detail);
    const group = groups.get(key);

    if (!group) {
      groups.set(key, {
        key,
        name: detail.name,
        image: normalizeImageUrl(detail.image),
        priceText: formatAmount(detail.amount),
        copies: isSetmeal ? detail.setmealCopies || 1 : detail.dishCopies || 1,
        subDishes: isSetmeal ? buildSetmealDishes(detail) : [],
        flavors: flavorText ? [flavorText] : [],
        isSetmeal,
      });
      return;
    }

    if (isSetmeal) {
      // 同一套餐的多条明细份数相同，取较大值避免重复累加；单点菜品则累加
      group.copies = Math.max(group.copies, detail.setmealCopies || 1);
    } else {
      group.copies += detail.dishCopies || 1;
    }

    if (flavorText && !group.flavors.includes(flavorText)) {
      group.flavors.push(flavorText);
    }
  });

  return Array.from(groups.values());
}

function buildTablewareText(order: OrderVO): string {
  const number = order.tablewareNumber || 0;

  if (number <= 0) {
    return "无需餐具";
  }

  return order.tablewareStatus === 1
    ? `${number} 份（按餐量提供）`
    : `${number} 份`;
}

// 待付款阶段配送尚未启动，展示「预计送达」会误导用户
function buildDeliveryTime(order: OrderVO): {
  label: string;
  text: string;
  show: boolean;
} {
  if (order.status < 2 || order.status > 5) {
    return { label: "", text: "", show: false };
  }

  if (order.status === 5 && order.deliveryTime) {
    return { label: "实际送达", text: order.deliveryTime, show: true };
  }

  if (order.estimatedDeliveryTime) {
    return { label: "预计送达", text: order.estimatedDeliveryTime, show: true };
  }

  return { label: "", text: "", show: false };
}

function buildOrderView(order: OrderVO): OrderView {
  const packAmount = order.packAmount || 0;
  // 订单 amount 已含打包费，商品金额只能反推，避免对语义未证实的明细金额做乘法
  const goodsAmount = Math.max((order.amount || 0) - packAmount, 0);
  const deliveryTime = buildDeliveryTime(order);
  const cancelReason = order.cancelReason || order.rejectionReason || "";

  return {
    ...order,
    statusText: getOrderStatusText(order.status),
    statusSubText: STATUS_SUB_TEXT[order.status] ?? "",
    itemList: buildItemList(order.orderDetailList ?? []),
    amountLabel: order.status === 1 ? "应付金额" : "实付金额",
    goodsAmountText: formatAmount(goodsAmount),
    packAmountText: formatAmount(packAmount),
    showPackAmount: packAmount > 0,
    amountText: formatAmount(order.amount),
    showRemark: !!(order.remark && order.remark.trim()),
    tablewareText: buildTablewareText(order),
    deliveryText: order.deliveryStatus === 1 ? "立即送出" : "预约送达",
    deliveryTimeLabel: deliveryTime.label,
    deliveryTimeText: deliveryTime.text,
    showDeliveryTime: deliveryTime.show,
    showCheckoutTime: order.status >= 2 && !!order.checkoutTime,
    showCancelCard: order.status === 6 && cancelReason.length > 0,
    cancelReasonText: cancelReason,
    cancelTimeText: order.cancelTime || "",
    reminded: hasReminded(order.id),
  };
}

Page({
  data: {
    order: null as OrderView | null,
    cancelVisible: false,
    // 首屏加载失败或参数非法时置真，避免除导航栏外一片空白且没有重试入口
    loadFailed: false,
    // 参数非法时没有可重试的 id，用它决定兜底 UI 给「重新加载」还是「返回」
    orderId: 0,
  },

  loaded: false,

  onLoad(options: Record<string, string | undefined>) {
    // 详情接口要的是订单ID（数字），历史链接可能传订单号，这里做一次兜底校验
    const orderId = Number(options.id);

    if (Number.isNaN(orderId) || orderId <= 0) {
      wx.showToast({ title: "订单参数有误", icon: "none" });
      this.setData({ loadFailed: true });
      return;
    }

    this.setData({ orderId });
    this.loadOrderDetail(orderId);
  },

  // 订单状态由商家侧驱动，用户从催单弹窗等场景返回时需要静默拉取最新状态
  onShow() {
    if (!this.loaded || !this.data.order) {
      return;
    }

    this.loadOrderDetail(this.data.order.id, true);
  },

  async loadOrderDetail(id: number, silent = false) {
    try {
      const res = await request<OrderVO>({
        url: `/user/order/orderDetail/${id}`,
        showLoading: !silent,
      });

      this.setData({ order: buildOrderView(res.data), loadFailed: false });
      this.loaded = true;
    } catch (err) {
      console.error("加载订单详情失败:", err);
      // 静默刷新失败不改变当前展示，只有首屏失败才需要展示兜底 UI
      if (!silent) {
        this.setData({ loadFailed: true });
      }
    }
  },

  onRetryLoad() {
    const orderId = this.data.orderId;

    if (orderId <= 0) {
      return;
    }

    this.loadOrderDetail(orderId);
  },

  onBack() {
    wx.navigateBack();
  },

  async onReminder() {
    const order = this.data.order;

    if (!order) return;

    const result = await sendOrderReminder(order.id);

    // 成功或后端限流都意味着「本单已催」，催单不改变订单状态，只更新按钮态
    if (result === "success" || result === "reminded") {
      this.setData({ "order.reminded": true });
      return;
    }

    // 状态已被商家推进或订单已不存在，静默重拉详情让按钮组收敛到真实状态
    if (result === "stale") {
      await this.loadOrderDetail(order.id, true);
    }
  },

  async onPay() {
    const order = this.data.order;

    if (!order) return;

    const result = await payOrder(order.number, order.payMethod || 1);

    // 「paying」表示同一订单的支付请求还在飞，属于重复点击，静默忽略
    if (result === "paying") {
      return;
    }

    if (result === "failed") {
      showPayFailModal();
      return;
    }

    // 支付成功后订单进入「待接单」，重新拉详情保证状态与按钮组以服务端为准
    this.markOrderListDirty();
    await this.loadOrderDetail(order.id);
  },

  onCancel() {
    if (!this.data.order) return;

    this.setData({ cancelVisible: true });
  },

  onCancelClose() {
    this.setData({ cancelVisible: false });
  },

  async onCancelConfirm(e: WechatMiniprogram.CustomEvent<{ reason: string }>) {
    const order = this.data.order;

    if (!order) {
      return;
    }

    // 先收起弹层，避免请求期间用户继续点「确定取消」
    this.setData({ cancelVisible: false });

    const ok = await cancelOrder(order.id, e.detail.reason);

    if (ok) {
      this.markOrderListDirty();
      // 不能延迟返回：这期间用户若手动返回，定时器仍会执行并再退一层
      wx.navigateBack();
    }
  },

  async onRepetition() {
    if (!this.data.order) return;

    await repeatOrder(this.data.order.id);
  },

  // 详情页状态变更后通知订单列表重置，避免返回后仍显示旧状态
  markOrderListDirty() {
    getApp<IApp>().globalData.orderListDirty = true;
  },
});
