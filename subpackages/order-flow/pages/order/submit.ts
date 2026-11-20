import { request } from "../../../../utils/request";
import { normalizeImageUrl } from "../../../../utils/image";
import { payOrder } from "../../../../utils/order";
import type { ShoppingCart } from "../../../../types/shoppingCart";
import type { AddressBook } from "../../../../types/address";
import type { OrderSubmitVO, OrdersSubmitDTO } from "../../../../types/order";

interface CartItem extends ShoppingCart {
  image: string;
  flavorText: string;
  lineAmountText: string;
}

interface IApp {
  updateCartData(cartList: ShoppingCart[]): void;
  globalData: {
    orderListDirty?: boolean;
    orderListStatus?: number;
  };
}

// 接口文档未定义打包费规则，后端只做透传，这里保持固定值
const PACK_AMOUNT = 2;
const MAX_TABLEWARE = 99;
const DELIVERY_MINUTES = 30;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

// 后端 OrdersSubmitDTO 用 @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")，传 ISO 字符串会解析失败
function formatDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function formatClock(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

// 立即送出 = 当前时间 + 30 分钟；选择具体时间 = 今天该时刻，若已过去则顺延到明天
function buildEstimatedDate(deliveryStatus: number, pickTime: string): Date {
  const now = new Date();

  if (deliveryStatus === 1) {
    return addMinutes(now, DELIVERY_MINUTES);
  }

  const [hour, minute] = pickTime.split(":").map((part) => Number(part));
  const target = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour || 0,
    minute || 0,
    0,
  );

  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return target;
}

// 后端把口味值存成逗号分隔字符串，这里拆开用于展示
function splitFlavorValues(flavorVal: string): string {
  if (!flavorVal) {
    return "";
  }

  return flavorVal
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join("、");
}

Page({
  data: {
    loading: true,
    cartList: [] as CartItem[],
    totalCount: 0,
    totalAmount: 0,
    totalAmountText: "0.00",
    packAmountText: PACK_AMOUNT.toFixed(2),
    payAmountText: "0.00",
    address: null as AddressBook | null,
    remark: "",
    payMethod: 1,
    tablewareStatus: 1,
    tablewareNumber: 0,
    deliveryStatus: 1,
    deliveryTimeText: "",
    pickTime: "",
    submitting: false,
    // 订单是否已创建：下单成功后购物车会被清空，此时不能再展示「购物车是空的」
    orderCreated: false,
  },

  inited: false,

  onLoad() {
    this.initDeliveryTime();
    this.loadDefaultAddress();
    this.loadCartList();
  },

  onShow() {
    // 从地址列表返回时数据由上一页 setData 写入，这里只兜底刷新购物车
    if (this.inited) {
      this.loadCartList(true);
    }
  },

  initDeliveryTime() {
    const pickTime = formatClock(addMinutes(new Date(), DELIVERY_MINUTES));

    this.setData({
      pickTime,
      deliveryTimeText: `预计 ${pickTime} 送达`,
    });
  },

  async loadDefaultAddress() {
    try {
      const res = await request<AddressBook>({
        url: "/user/addressBook/default",
      });
      if (res.data) {
        this.setData({ address: res.data });
      }
    } catch (err) {
      console.error("加载默认地址失败:", err);
    }
  },

  // 结算页不依赖全局缓存，直接查一次，保证金额与口味都是后端最新数据
  async loadCartList(silent = false) {
    if (!silent) {
      this.setData({ loading: true });
    }

    try {
      const res = await request<ShoppingCart[]>({
        url: "/user/shoppingCart/list",
        showLoading: !silent,
      });

      const cartList = res.data.map((item) => this.buildCartItem(item));

      getApp<IApp>().updateCartData(res.data);

      this.setData({
        cartList,
        loading: false,
      });

      this.recalcSummary();
      this.inited = true;
    } catch (err) {
      console.error("加载购物车失败:", err);
      this.setData({ loading: false });
    }
  },

  buildCartItem(item: ShoppingCart): CartItem {
    const flavorValues = splitFlavorValues(item.flavorVal);

    return {
      ...item,
      image: normalizeImageUrl(item.image),
      flavorText:
        item.setmealId != null && flavorValues
          ? `套餐口味：${flavorValues}`
          : flavorValues,
      lineAmountText: (item.amount * item.number).toFixed(2),
    };
  },

  recalcSummary() {
    const cartList = this.data.cartList;
    const totalCount = cartList.reduce((sum, item) => sum + item.number, 0);
    const totalAmount = cartList.reduce(
      (sum, item) => sum + item.amount * item.number,
      0,
    );
    const payAmount = totalAmount + PACK_AMOUNT;

    this.setData({
      totalCount,
      totalAmount,
      totalAmountText: totalAmount.toFixed(2),
      payAmountText: payAmount.toFixed(2),
      // 按餐量提供时餐具数量跟随商品总件数
      tablewareNumber:
        this.data.tablewareStatus === 1
          ? totalCount
          : this.data.tablewareNumber,
    });
  },

  onTapSelectAddress() {
    wx.navigateTo({
      url: "/subpackages/order-flow/pages/address/list?selectMode=1",
    });
  },

  onSelectDelivery(e: WechatMiniprogram.TouchEvent) {
    const status = Number(e.currentTarget.dataset.status);

    if (status === this.data.deliveryStatus) {
      return;
    }

    this.setData({
      deliveryStatus: status,
      deliveryTimeText:
        status === 1
          ? `预计 ${formatClock(addMinutes(new Date(), DELIVERY_MINUTES))} 送达`
          : `预计 ${this.data.pickTime} 送达`,
    });
  },

  onPickTime(e: WechatMiniprogram.PickerChange) {
    const pickTime = String(e.detail.value);

    this.setData({
      pickTime,
      deliveryTimeText: `预计 ${pickTime} 送达`,
    });
  },

  onSelectTableware(e: WechatMiniprogram.TouchEvent) {
    const status = Number(e.currentTarget.dataset.status);

    this.setData({
      tablewareStatus: status,
      tablewareNumber:
        status === 1 ? this.data.totalCount : this.data.tablewareNumber,
    });
  },

  onTablewareMinus() {
    if (this.data.tablewareStatus !== 0 || this.data.tablewareNumber <= 0) {
      return;
    }
    this.setData({ tablewareNumber: this.data.tablewareNumber - 1 });
  },

  onTablewarePlus() {
    if (
      this.data.tablewareStatus !== 0 ||
      this.data.tablewareNumber >= MAX_TABLEWARE
    ) {
      return;
    }
    this.setData({ tablewareNumber: this.data.tablewareNumber + 1 });
  },

  onSelectPayMethod(e: WechatMiniprogram.TouchEvent) {
    this.setData({ payMethod: Number(e.currentTarget.dataset.method) });
  },

  onRemarkInput(e: WechatMiniprogram.Input) {
    this.setData({ remark: e.detail.value });
  },

  async onSubmitOrder() {
    if (this.data.submitting) {
      return;
    }

    if (this.data.cartList.length === 0) {
      wx.showToast({ title: "购物车为空", icon: "none" });
      return;
    }

    if (!this.data.address) {
      wx.showToast({ title: "请选择收货地址", icon: "none" });
      return;
    }

    // submitting 贯穿「建单 → 支付」全程，避免支付期间按钮恢复可点导致二次下单
    this.setData({ submitting: true });

    try {
      const estimated = buildEstimatedDate(
        this.data.deliveryStatus,
        this.data.pickTime,
      );

      const res = await request<OrderSubmitVO>({
        url: "/user/order/submit",
        method: "POST",
        data: {
          addressBookId: this.data.address.id,
          amount: this.data.totalAmount + PACK_AMOUNT,
          deliveryStatus: this.data.deliveryStatus,
          estimatedDeliveryTime: formatDateTime(estimated),
          packAmount: PACK_AMOUNT,
          payMethod: this.data.payMethod,
          remark: this.data.remark,
          tablewareNumber: this.data.tablewareNumber,
          tablewareStatus: this.data.tablewareStatus,
        } as OrdersSubmitDTO,
        showLoading: true,
      });

      // 先标记订单已创建，再清空购物车，避免两者之间出现「购物车是空的」空态
      this.setData({ orderCreated: true });

      // 后端下单已清空数据库，这里同步本地状态并幂等兜底一次
      await this.clearCart();

      // 新订单已生成，通知订单列表下次展示时重置
      getApp<IApp>().globalData.orderListDirty = true;

      await this.handlePayment(res.data);
    } catch (err) {
      console.error("提交订单失败:", err);
      this.setData({ submitting: false });
    }
  },

  // 支付失败时唯一的补救入口是待付款列表，因此 submitting 只在失败分支复位
  async handlePayment(order: OrderSubmitVO) {
    const paid = await payOrder(order.orderNumber, this.data.payMethod);

    if (paid) {
      this.redirectToDetail(order.id);
      return;
    }

    // switchTab 的 fail 回调可能不生效，若不复位按钮会永久停在「提交中...」
    this.setData({ submitting: false });

    wx.showModal({
      title: "支付失败",
      content: "订单已提交，可在订单列表中继续支付",
      showCancel: false,
      confirmText: "去支付",
      success: () => {
        // 订单列表是 tabBar 页且会记忆上次停留的 tab，只能借全局标记强制定位到待付款
        getApp<IApp>().globalData.orderListStatus = 1;
        wx.switchTab({ url: "/pages/order/index" });
      },
    });
  },

  // 详情页要的是订单ID（数字），不是订单号
  redirectToDetail(orderId: number) {
    wx.redirectTo({
      url: `/subpackages/order-flow/pages/order/detail?id=${orderId}`,
    });
  },

  async clearCart() {
    getApp<IApp>().updateCartData([]);
    this.setData({ cartList: [], totalCount: 0, totalAmount: 0 });

    try {
      await request<string>({
        url: "/user/shoppingCart/clean",
        method: "DELETE",
      });
    } catch (err) {
      console.error("清空购物车失败:", err);
    }
  },

  onGoShopping() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  // 支付失败且未成功跳转时的兜底入口：直接定位到待付款
  onGoOrderList() {
    getApp<IApp>().globalData.orderListStatus = 1;
    wx.switchTab({ url: "/pages/order/index" });
  },
});
