import { request, startLoading, endLoading } from "../../../../utils/request";
import { normalizeImageUrl } from "../../../../utils/image";
import { addToCartTimes } from "../../../../utils/cart";
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
    dishesFailed: false,
    quantity: 1,
    adding: false,
    // 取不到套餐数据时置真：没有详情接口可兜底，只能引导用户返回重选
    loadFailed: false,
  },

  onLoad() {
    this.receiveProduct();
  },

  // 列表页只传套餐基础信息，包含菜品需要单独查询
  receiveProduct() {
    const channel = this.getOpenerEventChannel();

    if (!channel || typeof channel.on !== "function") {
      this.setData({ loadFailed: true });
      return;
    }

    channel.on("product", (payload: { type: string; product: Setmeal }) => {
      const setmeal = payload?.product;
      if (!setmeal) {
        this.setData({ loadFailed: true });
        return;
      }
      this.setData({
        setmeal: {
          ...setmeal,
          image: normalizeImageUrl(setmeal.image),
          setmealDishes: [],
        },
        loadFailed: false,
      });
      this.loadSetmealDishes(setmeal.id);
    });
  },

  onBack() {
    wx.navigateBack();
  },

  async loadSetmealDishes(id: number) {
    this.setData({ dishesLoading: true, dishesFailed: false });

    try {
      const res = await request<SetMealDish[]>({
        url: `/user/setmeal/dish/${id}`,
        // 下方 catch 会弹更具体的「套餐内容加载失败」，避免被通用提示覆盖
        silentError: true,
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
      this.setData({ dishesLoading: false, dishesFailed: true });
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

    if (this.data.dishesFailed) {
      wx.showToast({ title: "套餐内容加载失败，请返回重试", icon: "none" });
      return;
    }

    const payload = collectSetmealFlavorPayload(this.data.dishItems);

    if (!payload) {
      wx.showToast({ title: "请选择口味", icon: "none" });
      return;
    }

    this.setData({ adding: true });
    startLoading("加入中...");

    const data =
      payload.length > 0
        ? { setmealId: setmeal.id, setmealFlavors: payload }
        : { setmealId: setmeal.id };

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
