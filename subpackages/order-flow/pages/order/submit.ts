import { request } from "../../../../utils/request";
import type { ShoppingCart } from "../../../../types/shoppingCart";
import type { AddressBook } from "../../../../types/address";
import type {
  OrderSubmitVO,
  OrdersSubmitDTO,
  OrderPaymentVO,
  OrdersPaymentDTO,
} from "../../../../types/order";

Page({
  data: {
    address: null as AddressBook | null,
    cartList: [] as ShoppingCart[],
    totalAmount: 0,
    remark: "",
    payMethod: 1,
    tablewareStatus: 1,
    tablewareNumber: 0,
    packAmount: 2,
    deliveryStatus: 1,
    estimatedDeliveryTime: "",
  },

  onLoad() {
    this.loadDefaultAddress();
    this.loadCartData();
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

  loadCartData() {
    const app = getApp<{
      globalData: { cartList: ShoppingCart[]; cartTotal: number };
    }>();

    if (app.globalData.cartList.length > 0) {
      this.setData({
        cartList: app.globalData.cartList,
        totalAmount: app.globalData.cartTotal,
        tablewareNumber: app.globalData.cartList.reduce(
          (sum: number, item: ShoppingCart) => sum + item.number,
          0,
        ),
      });
    }
  },

  onTapSelectAddress() {
    wx.navigateTo({
      url: "/subpackages/order-flow/pages/address/list?selectMode=1",
    });
  },

  onRemarkInput(e: WechatMiniprogram.Input) {
    this.setData({ remark: e.detail.value });
  },

  async onSubmitOrder() {
    if (!this.data.address) {
      wx.showToast({ title: "请选择收货地址", icon: "none" });
      return;
    }

    try {
      const res = await request<OrderSubmitVO>({
        url: "/user/order/submit",
        method: "POST",
        data: {
          addressBookId: this.data.address.id,
          amount: this.data.totalAmount + this.data.packAmount,
          deliveryStatus: this.data.deliveryStatus,
          estimatedDeliveryTime:
            this.data.estimatedDeliveryTime || new Date().toISOString(),
          packAmount: this.data.packAmount,
          payMethod: this.data.payMethod,
          remark: this.data.remark,
          tablewareNumber: this.data.tablewareNumber,
          tablewareStatus: this.data.tablewareStatus,
        } as OrdersSubmitDTO,
        showLoading: true,
      });

      wx.showModal({
        title: "支付确认",
        content: `订单号：${res.data.orderNumber}\n金额：¥${res.data.orderAmount}`,
        confirmText: "立即支付",
        success: async (modalRes) => {
          if (modalRes.confirm) {
            await this.handlePayment(res.data.orderNumber);
          }
        },
      });
    } catch (err) {
      console.error("提交订单失败:", err);
    }
  },

  async handlePayment(orderNumber: string) {
    try {
      await request<OrderPaymentVO>({
        url: "/user/order/payment",
        method: "PUT",
        data: {
          orderNumber,
          payMethod: this.data.payMethod,
        } as OrdersPaymentDTO,
        showLoading: true,
      });

      wx.showModal({
        title: "支付成功",
        content: "订单已支付成功，商家正在准备中",
        showCancel: false,
        success() {
          wx.navigateTo({
            url: `/subpackages/order-flow/pages/order/detail?id=${orderNumber}`,
          });
        },
      });
    } catch (err) {
      console.error("支付失败:", err);
    }
  },
});
