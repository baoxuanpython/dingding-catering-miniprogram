import { request } from "../../utils/request";
import type { ShoppingCart } from "../../types/shoppingCart";

interface IApp {
  updateCartData(cartList: ShoppingCart[]): void;
}

Page({
  data: {
    cartList: [] as ShoppingCart[],
    totalAmount: 0,
    totalCount: 0,
  },

  onShow() {
    this.loadCartList();
  },

  async loadCartList() {
    try {
      const res = await request<ShoppingCart[]>({
        url: "/user/shoppingCart/list",
        showLoading: true,
      });

      const app = getApp<IApp>();
      app.updateCartData(res.data);

      this.setData({
        cartList: res.data,
        totalAmount: res.data.reduce(
          (sum: number, item: ShoppingCart) => sum + item.amount * item.number,
          0,
        ),
        totalCount: res.data.reduce(
          (sum: number, item: ShoppingCart) => sum + item.number,
          0,
        ),
      });
    } catch (err) {
      console.error("加载购物车失败:", err);
    }
  },
});
