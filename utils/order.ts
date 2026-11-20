import { request } from "./request";
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

// 催单节流：后端 sendReminder 无频率限制，前端同一订单 60 秒内只放行一次
const REMINDER_INTERVAL = 60 * 1000;
const lastReminderAt = new Map<number, number>();

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

export async function payOrder(
  orderNumber: string,
  payMethod: number,
): Promise<boolean> {
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
    return true;
  } catch (err) {
    console.error("支付失败:", err);
    return false;
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

// 返回 true 表示用户确认并取消成功，调用方据此决定是否刷新/更新列表
export function cancelOrder(orderId: number): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title: "取消订单",
      content: "确定要取消该订单吗？",
      editable: true,
      placeholderText: "请输入取消原因",
      success: async (res) => {
        if (!res.confirm) {
          resolve(false);
          return;
        }

        try {
          await request<string>({
            url: `/user/order/cancel/${orderId}`,
            method: "PUT",
            data: {
              cancelReason: res.content || "用户主动取消",
            } as OrdersCancelDTO,
            showLoading: true,
          });
          wx.showToast({ title: "订单已取消", icon: "success" });
          resolve(true);
        } catch (err) {
          console.error("取消订单失败:", err);
          resolve(false);
        }
      },
      fail: () => resolve(false),
    });
  });
}

export async function sendOrderReminder(orderId: number): Promise<boolean> {
  const now = Date.now();
  const last = lastReminderAt.get(orderId) ?? 0;

  if (now - last < REMINDER_INTERVAL) {
    wx.showToast({ title: "已催单，请稍候", icon: "none" });
    return false;
  }

  try {
    await request<string>({
      url: `/user/order/reminder/${orderId}`,
      method: "GET",
      showLoading: true,
    });
    lastReminderAt.set(orderId, Date.now());
    wx.showToast({ title: "催单成功", icon: "success" });
    return true;
  } catch (err) {
    console.error("催单失败:", err);
    return false;
  }
}

export async function repeatOrder(orderId: number): Promise<boolean> {
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
  }
}
