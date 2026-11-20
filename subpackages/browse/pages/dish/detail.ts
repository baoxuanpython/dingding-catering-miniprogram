import { request } from "../../../../utils/request";
import { normalizeImageUrl } from "../../../../utils/image";
import {
  buildFlavorGroups,
  collectFlavorPayload,
} from "../../../../utils/flavor";
import type { FlavorGroup } from "../../../../utils/flavor";
import type { DishVO } from "../../../../types/dish";

Page({
  data: {
    dish: null as DishVO | null,
    flavorGroups: [] as FlavorGroup[],
    quantity: 1,
    adding: false,
  },

  onLoad() {
    this.receiveProduct();
  },

  // 列表页通过 eventChannel 传递菜品对象，详情页无需再发请求
  receiveProduct() {
    const channel = this.getOpenerEventChannel();

    if (!channel || typeof channel.on !== "function") {
      wx.showToast({ title: "菜品信息加载失败", icon: "none" });
      return;
    }

    channel.on("product", (payload: { type: string; product: DishVO }) => {
      const dish = payload?.product;
      if (!dish) {
        wx.showToast({ title: "菜品信息加载失败", icon: "none" });
        return;
      }
      this.setData({
        dish: { ...dish, image: normalizeImageUrl(dish.image) },
        flavorGroups: buildFlavorGroups(dish.flavors),
      });
    });
  },

  onSelectFlavor(e: WechatMiniprogram.TouchEvent) {
    const { fid, vi } = e.currentTarget.dataset as unknown as {
      fid: number;
      vi: number;
    };
    const index = this.data.flavorGroups.findIndex(
      (group) => group.flavorId === fid,
    );

    if (index < 0) {
      return;
    }

    this.setData({ [`flavorGroups[${index}].selectedIndex`]: vi });
  },

  onMinus() {
    if (this.data.quantity <= 1) {
      return;
    }
    this.setData({ quantity: this.data.quantity - 1 });
  },

  onPlus() {
    if (this.data.quantity >= 99) {
      return;
    }
    this.setData({ quantity: this.data.quantity + 1 });
  },

  async onAddToCart() {
    if (this.data.adding) {
      return;
    }

    const dish = this.data.dish;

    if (!dish) {
      return;
    }

    if (dish.status !== 1) {
      wx.showToast({ title: "该商品已停售", icon: "none" });
      return;
    }

    const payload = collectFlavorPayload(this.data.flavorGroups);

    if (!payload) {
      wx.showToast({ title: "请选择口味", icon: "none" });
      return;
    }

    this.setData({ adding: true });
    wx.showLoading({ title: "加入中...", mask: true });

    try {
      for (let i = 0; i < this.data.quantity; i++) {
        await request({
          url: "/user/shoppingCart/add",
          method: "POST",
          data:
            payload.flavorId.length > 0
              ? {
                  dishId: dish.id,
                  flavorId: payload.flavorId,
                  flavorVal: payload.flavorVal,
                }
              : { dishId: dish.id },
        });
      }
      wx.hideLoading();
      wx.showToast({ title: "已加入购物车", icon: "none" });
      setTimeout(() => {
        wx.navigateBack();
      }, 600);
    } catch (err) {
      wx.hideLoading();
      console.error("加入购物车失败:", err);
      wx.showToast({ title: "加入购物车失败", icon: "none" });
    } finally {
      this.setData({ adding: false });
    }
  },
});
