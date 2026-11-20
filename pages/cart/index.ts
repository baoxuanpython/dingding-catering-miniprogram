import { request } from "../../utils/request";
import { normalizeImageUrl } from "../../utils/image";
import type { ShoppingCart } from "../../types/shoppingCart";

interface CartItem extends ShoppingCart {
  flavorText: string;
  lineAmountText: string;
}

interface IApp {
  requireLogin(): boolean;
  updateCartData(cartList: ShoppingCart[]): void;
}

// 单个购物车条目允许的最大份数
const MAX_NUMBER = 99;

// 后端返回的口味值是逗号分隔字符串，这里拆开用于展示
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
    cartList: [] as CartItem[],
    totalCount: 0,
    totalAmountText: "0.00",
    loading: true,
  },

  // 正在提交的数量修改，避免同一行被连点重复请求
  pendingIds: {} as Record<number, boolean>,

  onShow() {
    const app = getApp<IApp>();

    if (!app.requireLogin()) {
      return;
    }

    this.loadCartList();
  },

  async loadCartList(silent = false) {
    if (!silent) {
      this.setData({ loading: true });
    }

    try {
      const res = await request<ShoppingCart[]>({
        url: "/user/shoppingCart/list",
        showLoading: !silent,
      });

      const app = getApp<IApp>();
      app.updateCartData(res.data);

      this.setData({
        cartList: res.data.map((item) => this.buildCartItem(item)),
        loading: false,
      });

      this.recalcSummary();
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

  // 汇总数量与金额，并同步全局购物车数据（tab 角标由 app 统一刷新）
  recalcSummary() {
    const cartList = this.data.cartList;
    const totalCount = cartList.reduce((sum, item) => sum + item.number, 0);
    const totalAmount = cartList.reduce(
      (sum, item) => sum + item.amount * item.number,
      0,
    );

    this.setData({
      totalCount,
      totalAmountText: totalAmount.toFixed(2),
    });

    getApp<IApp>().updateCartData(cartList);
  },

  onMinus(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as number;
    const item = this.data.cartList.find((cart) => cart.id === id);

    if (!item || item.number <= 1) {
      return;
    }

    this.changeNumber(item, item.number - 1);
  },

  onPlus(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as number;
    const item = this.data.cartList.find((cart) => cart.id === id);

    if (!item) {
      return;
    }

    if (item.number >= MAX_NUMBER) {
      wx.showToast({ title: `最多可选 ${MAX_NUMBER} 份`, icon: "none" });
      return;
    }

    this.changeNumber(item, item.number + 1);
  },

  // 先本地改数量，请求失败再回滚，避免每次点击都整表重载
  async changeNumber(item: CartItem, target: number) {
    if (this.pendingIds[item.id]) {
      return;
    }

    this.pendingIds[item.id] = true;
    const prevNumber = item.number;
    this.applyNumber(item.id, target);

    try {
      await request<string>({
        url: "/user/shoppingCart",
        method: "PUT",
        params: { id: item.id, number: target },
      });
    } catch (err) {
      console.error("修改购物车数量失败:", err);
      this.applyNumber(item.id, prevNumber);
      wx.showToast({ title: "修改数量失败", icon: "none" });
    } finally {
      this.pendingIds[item.id] = false;
    }
  },

  applyNumber(id: number, number: number) {
    const index = this.data.cartList.findIndex((cart) => cart.id === id);

    if (index < 0) {
      return;
    }

    const item = this.data.cartList[index];

    this.setData({
      [`cartList[${index}]`]: {
        ...item,
        number,
        lineAmountText: (item.amount * number).toFixed(2),
      },
    });

    this.recalcSummary();
  },

  onDelete(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as number;
    const item = this.data.cartList.find((cart) => cart.id === id);

    if (!item) {
      return;
    }

    wx.showModal({
      title: "提示",
      content: `确定删除「${item.name}」吗？`,
      success: (res) => {
        if (res.confirm) {
          this.doDelete(id);
        }
      },
    });
  },

  async doDelete(id: number) {
    if (this.pendingIds[id]) {
      return;
    }

    this.pendingIds[id] = true;

    try {
      await request<string>({
        url: "/user/shoppingCart",
        method: "DELETE",
        params: { id },
        showLoading: true,
      });
      wx.showToast({ title: "已删除", icon: "none" });
      await this.loadCartList(true);
    } catch (err) {
      console.error("删除购物车商品失败:", err);
    } finally {
      this.pendingIds[id] = false;
    }
  },

  onClean() {
    if (this.data.cartList.length === 0) {
      return;
    }

    wx.showModal({
      title: "提示",
      content: "确定清空购物车吗？",
      success: (res) => {
        if (res.confirm) {
          this.doClean();
        }
      },
    });
  },

  async doClean() {
    try {
      await request<string>({
        url: "/user/shoppingCart/clean",
        method: "DELETE",
        showLoading: true,
      });
      wx.showToast({ title: "已清空", icon: "none" });
      await this.loadCartList(true);
    } catch (err) {
      console.error("清空购物车失败:", err);
    }
  },

  onCheckout() {
    if (this.data.totalCount === 0) {
      wx.showToast({ title: "请先选购商品", icon: "none" });
      return;
    }

    wx.navigateTo({ url: "/subpackages/order-flow/pages/order/submit" });
  },

  onGoShopping() {
    wx.switchTab({ url: "/pages/index/index" });
  },
});
