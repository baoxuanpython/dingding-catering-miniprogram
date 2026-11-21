import { normalizeImageUrl } from "../../../../utils/image";
import { addToCartTimes } from "../../../../utils/cart";
import { startLoading, endLoading } from "../../../../utils/request";
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
    // 取不到商品数据时置真：没有详情接口可兜底，只能引导用户返回重选
    loadFailed: false,
  },

  onLoad() {
    this.receiveProduct();
  },

  // 列表页通过 eventChannel 传递菜品对象，详情页无需再发请求
  receiveProduct() {
    const channel = this.getOpenerEventChannel();

    if (!channel || typeof channel.on !== "function") {
      this.setData({ loadFailed: true });
      return;
    }

    channel.on("product", (payload: { type: string; product: DishVO }) => {
      const dish = payload?.product;
      if (!dish) {
        this.setData({ loadFailed: true });
        return;
      }
      this.setData({
        dish: { ...dish, image: normalizeImageUrl(dish.image) },
        flavorGroups: buildFlavorGroups(dish.flavors),
        loadFailed: false,
      });
    });
  },

  onBack() {
    wx.navigateBack();
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
    startLoading("加入中...");

    const data =
      payload.flavorId.length > 0
        ? {
            dishId: dish.id,
            flavorId: payload.flavorId,
            flavorVal: payload.flavorVal,
          }
        : { dishId: dish.id };

    const result = await addToCartTimes(data, this.data.quantity);

    endLoading();

    // 一份都没成功：保持原页面，让用户可以重试
    if (result.successCount === 0) {
      this.setData({ adding: false });
      wx.showToast({ title: "加入购物车失败", icon: "none" });
      return;
    }

    // 部分成功：前几份已入库，必须给出准确份数并离开本页，否则用户再点会重复加购
    if (result.failedCount > 0) {
      wx.showToast({
        title: `已加入 ${result.successCount} 份，其余失败`,
        icon: "none",
      });
    } else {
      wx.showToast({ title: "已加入购物车", icon: "none" });
    }

    // 成功路径不复位 adding：返回动画期间按钮仍可点击，会把同一份再加一次。
    // 立即返回：toast 是浮层，页面退出后仍会显示完；延迟返回期间用户手动返回会连退两层
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: "/pages/index/index" });
      },
    });
  },
});
