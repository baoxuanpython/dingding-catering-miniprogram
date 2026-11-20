import { request } from "../../../../utils/request";
import { normalizeImageUrl } from "../../../../utils/image";
import {
  buildSetmealFlavorItems,
  collectSetmealFlavorPayload,
} from "../../../../utils/flavor";
import type { SetmealFlavorItem } from "../../../../utils/flavor";
import type { Setmeal, SetMealDish } from "../../../../types/setmeal";

type SetmealDetail = Setmeal & { setmealDishes: SetMealDish[] };

Page({
  data: {
    setmeal: null as SetmealDetail | null,
    dishItems: [] as SetmealFlavorItem[],
    dishesLoading: true,
    quantity: 1,
    adding: false,
  },

  onLoad() {
    this.receiveProduct();
  },

  // 列表页只传套餐基础信息，包含菜品需要单独查询
  receiveProduct() {
    const channel = this.getOpenerEventChannel();

    if (!channel || typeof channel.on !== "function") {
      wx.showToast({ title: "套餐信息加载失败", icon: "none" });
      return;
    }

    channel.on("product", (payload: { type: string; product: Setmeal }) => {
      const setmeal = payload?.product;
      if (!setmeal) {
        wx.showToast({ title: "套餐信息加载失败", icon: "none" });
        return;
      }
      this.setData({
        setmeal: {
          ...setmeal,
          image: normalizeImageUrl(setmeal.image),
          setmealDishes: [],
        },
      });
      this.loadSetmealDishes(setmeal.id);
    });
  },

  async loadSetmealDishes(id: number) {
    try {
      const res = await request<SetMealDish[]>({
        url: `/user/setmeal/dish/${id}`,
      });

      if (!this.data.setmeal) {
        return;
      }

      const flavorItems = buildSetmealFlavorItems(res.data);

      // 所有菜品都要展示，只有带口味类型的菜品才渲染可选芯片
      const dishItems: SetmealFlavorItem[] = (res.data || []).map((dish) => {
        const flavorItem = flavorItems.find(
          (item) => item.dishId === dish.dishId,
        );
        return {
          dishId: dish.dishId,
          dishName: dish.name,
          copies: dish.copies,
          groups: flavorItem ? flavorItem.groups : [],
        };
      });

      this.setData({
        "setmeal.setmealDishes": res.data,
        dishItems,
        dishesLoading: false,
      });
    } catch (err) {
      console.error("加载套餐包含菜品失败:", err);
      this.setData({ dishesLoading: false });
      wx.showToast({ title: "套餐内容加载失败", icon: "none" });
    }
  },

  onSelectFlavor(e: WechatMiniprogram.TouchEvent) {
    const { di, fid, vi } = e.currentTarget.dataset as unknown as {
      di: number;
      fid: number;
      vi: number;
    };

    const dish = this.data.dishItems[di];

    if (!dish) {
      return;
    }

    const groupIndex = dish.groups.findIndex((group) => group.flavorId === fid);

    if (groupIndex < 0) {
      return;
    }

    this.setData({
      [`dishItems[${di}].groups[${groupIndex}].selectedIndex`]: vi,
    });
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

    const setmeal = this.data.setmeal;

    if (!setmeal) {
      return;
    }

    if (setmeal.status !== 1) {
      wx.showToast({ title: "该商品已停售", icon: "none" });
      return;
    }

    if (this.data.dishesLoading) {
      wx.showToast({ title: "套餐内容加载中，请稍候", icon: "none" });
      return;
    }

    const payload = collectSetmealFlavorPayload(this.data.dishItems);

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
            payload.length > 0
              ? { setmealId: setmeal.id, setmealFlavors: payload }
              : { setmealId: setmeal.id },
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
