import { request } from "../../../../utils/request";
import { normalizeImageUrl } from "../../../../utils/image";
import { fetchShopOpen } from "../../../../utils/shop";
import { payOrder } from "../../../../utils/order";
import type { ShoppingCart } from "../../../../types/shoppingCart";
import type { AddressBook } from "../../../../types/address";
import type { OrderSubmitVO, OrdersSubmitDTO } from "../../../../types/order";

interface CartItem extends ShoppingCart {
  image: string;
  flavorText: string;
  lineAmountText: string;
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

function isNextDay(target: Date, now: Date): boolean {
  return (
    target.getFullYear() !== now.getFullYear() ||
    target.getMonth() !== now.getMonth() ||
    target.getDate() !== now.getDate()
  );
}

// 送达文案必须带上「明日」：选了已过去的时间会被静默顺延到明天，
// 只显示时钟会让用户以为今天送达，与后端实际记录的时间不一致
function buildDeliveryText(deliveryStatus: number, pickTime: string): string {
  const target = buildEstimatedDate(deliveryStatus, pickTime);
  const prefix = isNextDay(target, new Date()) ? "明日 " : "";

  return `预计 ${prefix}${formatClock(target)} 送达`;
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
    // 首屏购物车拉取失败时若落进空态，用户会以为购物车被清空，进而不下单直接离开
    loadFailed: false,
  },

  inited: false,

  onLoad() {
    this.initDeliveryTime();
    this.loadDefaultAddress();
    this.loadCartList();
  },

  onShow() {
    if (!this.inited) {
      return;
    }

    // 从地址列表返回时数据由上一页 setData 写入，这里只兜底刷新购物车
    this.loadCartList(true);

    // 用户在地址列表新增了首个地址却没点选就返回：这里兜底拉默认地址，
    // 否则页面仍停在「请选择收货地址」，必须再进一次列表才能选
    if (!this.data.address) {
      this.loadDefaultAddress();
    }
  },

  initDeliveryTime() {
    const pickTime = formatClock(addMinutes(new Date(), DELIVERY_MINUTES));

    this.setData({
      pickTime,
      deliveryTimeText: buildDeliveryText(1, pickTime),
    });
  },

  async loadDefaultAddress() {
    try {
      const res = await request<AddressBook>({
        url: "/user/addressBook/default",
        // 没有默认地址是正常状态（用户可手动去选），不该用错误提示打断结算
        silentError: true,
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
        loadFailed: false,
      });

      this.recalcSummary();
      this.inited = true;
    } catch (err) {
      console.error("加载购物车失败:", err);
      // 静默刷新失败保留现有清单；首屏失败必须给重试入口，不能伪装成空购物车
      this.setData({ loading: false, loadFailed: !silent });
    }
  },

  onRetryLoad() {
    this.setData({ loadFailed: false });
    this.loadCartList();
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
      deliveryTimeText: buildDeliveryText(
        status,
        status === 1
          ? formatClock(addMinutes(new Date(), DELIVERY_MINUTES))
          : this.data.pickTime,
      ),
    });
  },

  onPickTime(e: WechatMiniprogram.PickerChange) {
    const pickTime = String(e.detail.value);
    const target = buildEstimatedDate(0, pickTime);

    // 选到当天已过去的时刻会被顺延到明天，必须显式告知，否则用户以为今天送达
    if (isNextDay(target, new Date())) {
      wx.showToast({ title: "该时间已过，将安排明日送达", icon: "none" });
    }

    this.setData({
      pickTime,
      deliveryTimeText: buildDeliveryText(0, pickTime),
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

    // 锁必须在第一个 await 之前生效：营业状态查询是异步的，若等它返回再上锁，
    // 双击的第二次点击会趁这个空窗通过 submitting 守卫，产生两笔真实订单
    this.setData({ submitting: true });

    const shopOpen = await fetchShopOpen();

    // null 表示无法确认营业状态，按可下单放行，避免断网时把用户永久挡住
    if (shopOpen === false) {
      wx.showToast({ title: "店铺已打烊，暂不接单", icon: "none" });
      this.setData({ submitting: false });
      return;
    }

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
    const result = await payOrder(order.orderNumber, this.data.payMethod);

    // 「paying」表示同一订单的支付请求还在飞，属于重复点击，静默忽略
    if (result === "paying") {
      return;
    }

    if (result === "success") {
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
      // 跳转失败（如页面栈已满）时页面仍存活，不复位锁会让按钮永久停在「提交中」
      fail: () => {
        this.setData({ submitting: false });
      },
    });
  },

  async clearCart() {
    getApp<IApp>().updateCartData([]);
    this.setData({ cartList: [] });
    // 走统一重算，否则 totalAmountText/payAmountText 仍停在清空前的金额
    this.recalcSummary();

    try {
      await request<string>({
        url: "/user/shoppingCart/clean",
        method: "DELETE",
        // 订单已下单成功，这次清空只是幂等兜底，失败绝不能弹错误让用户以为下单失败
        silentError: true,
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
