import { ApiError, request } from "./request";
import type {
  OrderVO,
  OrdersCancelDTO,
  OrdersPaymentDTO,
  OrderPaymentVO,
} from "../types/order";

const ORDER_STATUS_TEXT: Record<number, string> = {
  1: "待付款",
  2: "待接单",
  3: "已接单",
  4: "派送中",
  5: "已完成",
  6: "已取消",
  7: "已退款",
};

// 催单记录：后端 OrderVO 没有催单次数/时间字段，无法提供权威状态，只能由客户端本地记录
// 已知边界：换设备或清小程序缓存后记录归零，同一订单可再次催单，这是不动后端的必然代价
const REMINDER_STORAGE_KEY = "order_reminded_ids";
const REMINDER_MAX_RECORDS = 100;

// storage 可能被写入脏数据，读取时必须先校验类型，否则 includes 会抛错
function readRemindedIds(): number[] {
  const cached: unknown = wx.getStorageSync(REMINDER_STORAGE_KEY);
  const ids: unknown[] = Array.isArray(cached) ? cached : [];

  return ids.filter((id): id is number => typeof id === "number");
}

export function hasReminded(orderId: number): boolean {
  return readRemindedIds().includes(orderId);
}

function markReminded(orderId: number): void {
  const ids = readRemindedIds();

  if (ids.includes(orderId)) {
    return;
  }

  ids.push(orderId);

  // 订单 id 不会复用，记录只需保留最近若干条，避免随订单数无限增长
  if (ids.length > REMINDER_MAX_RECORDS) {
    ids.splice(0, ids.length - REMINDER_MAX_RECORDS);
  }

  wx.setStorageSync(REMINDER_STORAGE_KEY, ids);
}

export function getOrderStatusText(status: number): string {
  return ORDER_STATUS_TEXT[status] ?? "未知状态";
}

// 套餐展开后每道菜的 name 都是套餐名，直接拼会出现「宫保套餐、宫保套餐」，
// 这里按名称归并：套餐按 setmealCopies 计份数，单点菜品累加 dishCopies
export function buildOrderDishesText(order: OrderVO): string {
  const detailList = order.orderDetailList ?? [];

  if (detailList.length === 0) {
    return order.orderDishes || "";
  }

  const groups = new Map<string, { name: string; count: number }>();

  detailList.forEach((detail) => {
    if (!detail.name) {
      return;
    }

    const group = groups.get(detail.name);
    const copies =
      detail.setmealId != null
        ? detail.setmealCopies || 1
        : detail.dishCopies || 1;

    if (!group) {
      groups.set(detail.name, { name: detail.name, count: copies });
      return;
    }

    // 同一套餐的多条明细份数相同，取较大值避免重复累加；单点菜品则累加
    group.count =
      detail.setmealId != null
        ? Math.max(group.count, copies)
        : group.count + copies;
  });

  return Array.from(groups.values())
    .map((group) =>
      group.count > 1 ? `${group.name}×${group.count}` : group.name,
    )
    .join("、");
}

export type PayResult = "success" | "paying" | "failed";

// 同一订单的支付请求在飞时直接忽略重复点击，避免双击造成重复扣款
const payingOrderNumbers = new Set<string>();

export async function payOrder(
  orderNumber: string,
  payMethod: number,
): Promise<PayResult> {
  if (payingOrderNumbers.has(orderNumber)) {
    return "paying";
  }

  payingOrderNumbers.add(orderNumber);

  try {
    await request<OrderPaymentVO>({
      url: "/user/order/payment",
      method: "PUT",
      data: {
        orderNumber,
        payMethod,
      } as OrdersPaymentDTO,
      showLoading: true,
    });
    wx.showToast({ title: "支付成功", icon: "success" });
    return "success";
  } catch (err) {
    console.error("支付失败:", err);
    return "failed";
  } finally {
    payingOrderNumbers.delete(orderNumber);
  }
}

// payOrder 只负责发请求与返回结果，失败提示交给调用方：
// 结算页需要附带跳转，列表页/详情页只需原地重试，两者诉求不同
export function showPayFailModal(): void {
  wx.showModal({
    title: "支付失败",
    content: "订单未支付成功，请稍后重试",
    showCancel: false,
    confirmText: "知道了",
  });
}

// 后端 cancelReason 必填，用户没选到具体原因时用这句兜底
const CANCEL_REASON_FALLBACK = "用户主动取消";

// 面板收起前有一个空窗，快速双击会发出两次不可逆的取消请求
const cancellingIds = new Set<number>();

// 只负责发请求，原因由调用方的取消原因弹层收集；
// 返回 true 表示取消成功，调用方据此决定是否刷新/更新列表
export async function cancelOrder(
  orderId: number,
  reason?: string,
): Promise<boolean> {
  if (cancellingIds.has(orderId)) {
    return false;
  }

  cancellingIds.add(orderId);

  try {
    await request<string>({
      url: `/user/order/cancel/${orderId}`,
      method: "PUT",
      data: {
        cancelReason: reason?.trim() || CANCEL_REASON_FALLBACK,
      } as OrdersCancelDTO,
      showLoading: true,
    });
    wx.showToast({ title: "订单已取消", icon: "success" });
    return true;
  } catch (err) {
    console.error("取消订单失败:", err);
    return false;
  } finally {
    cancellingIds.delete(orderId);
  }
}

export type ReminderResult = "success" | "reminded" | "stale" | "failed";

// 同 id 请求进行中直接忽略：遮罩渲染出来之前有一个空窗，快速双击仍会发两次
const remindingIds = new Set<number>();

const REMIND_ERROR_TEXT: Record<number, string> = {
  6001: "当前订单状态不能催单",
  6002: "订单不存在，请刷新",
};

export async function sendOrderReminder(
  orderId: number,
): Promise<ReminderResult> {
  // 每个订单只允许催一次，重复点击直接提示，不发请求
  if (hasReminded(orderId)) {
    wx.showToast({ title: "已催单，请耐心等待", icon: "none" });
    return "reminded";
  }

  if (remindingIds.has(orderId)) {
    return "failed";
  }

  remindingIds.add(orderId);

  try {
    await request<string>({
      url: `/user/order/reminder/${orderId}`,
      method: "GET",
      showLoading: true,
      // 后端 6001/6002/6004 的文案与界面状态需要对齐，统一由本函数提示
      silentError: true,
    });
    // 只在成功后落记录：失败仍允许重试，否则一次网络抖动会把用户永久锁死
    markReminded(orderId);
    wx.showToast({ title: "催单成功", icon: "success" });
    return "success";
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === 6004) {
        // 后端 60 秒限流，用户视角同样是「已催单」，锁定按钮让提示与界面保持一致
        markReminded(orderId);
        wx.showToast({ title: "已催单，请耐心等待", icon: "none" });
        return "reminded";
      }

      if (err.code === 6001 || err.code === 6002) {
        wx.showToast({ title: REMIND_ERROR_TEXT[err.code], icon: "none" });
        // 本地状态已与服务端不符，交由调用方重拉数据收敛
        return "stale";
      }

      wx.showToast({
        title: err.message || "催单失败，请稍后重试",
        icon: "none",
      });
      return "failed";
    }

    // 网络异常已由 request 层统一提示，这里只兜底「静默失败」场景，避免连弹两个 toast
    if (!(err as { errMsg?: string }).errMsg) {
      wx.showToast({ title: "催单失败，请稍后重试", icon: "none" });
    }
    return "failed";
  } finally {
    remindingIds.delete(orderId);
  }
}

// 同 id 请求进行中直接忽略：双击会把同一份订单重复加进购物车
const repeatingIds = new Set<number>();

export async function repeatOrder(orderId: number): Promise<boolean> {
  if (repeatingIds.has(orderId)) {
    return false;
  }

  repeatingIds.add(orderId);

  try {
    await request<string>({
      url: `/user/order/repetition/${orderId}`,
      method: "POST",
      showLoading: true,
    });
    wx.showToast({ title: "已加入购物车", icon: "success" });
    wx.switchTab({ url: "/pages/cart/index" });
    return true;
  } catch (err) {
    console.error("再来一单失败:", err);
    return false;
  } finally {
    repeatingIds.delete(orderId);
  }
}
