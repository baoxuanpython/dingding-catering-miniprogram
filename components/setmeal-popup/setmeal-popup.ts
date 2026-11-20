import { request } from "../../utils/request";
import { normalizeImageUrl } from "../../utils/image";
import {
  buildSetmealFlavorItems,
  collectSetmealFlavorPayload,
} from "../../utils/flavor";
import type { SetmealFlavorItem } from "../../utils/flavor";
import type { Setmeal, SetMealDish } from "../../types/setmeal";

const MAX_NUMBER = 99;

Component({
  properties: {
    visible: { type: Boolean, value: false },
    setmeal: { type: null, value: null },
  },

  data: {
    loading: false,
    loadFailed: false,
    dishItems: [] as SetmealFlavorItem[],
    quantity: 1,
    totalText: "0.00",
    adding: false,
    coverImage: "",
    setmealName: "",
    setmealDesc: "",
    setmealPriceText: "¥0.00",
  },

  observers: {
    "visible, setmeal"(
      this: WechatMiniprogram.Component.TrivialInstance,
      visible: boolean,
      setmeal: Setmeal | null,
    ) {
      if (!visible || !setmeal) {
        this.setData({ quantity: 1 });
        return;
      }

      const price = Number(setmeal.price) || 0;

      this.setData({
        coverImage: normalizeImageUrl(setmeal.image),
        setmealName: setmeal.name,
        setmealDesc: setmeal.description || "暂无描述",
        setmealPriceText: `¥${price.toFixed(2)}`,
        dishItems: [],
        quantity: 1,
        totalText: price.toFixed(2),
        loadFailed: false,
      });

      this.loadDishes(setmeal.id);
    },
  },

  methods: {
    noop() {
      // 阻止点击面板空白处穿透到遮罩
    },

    onClose() {
      if (this.data.adding) {
        return;
      }
      this.triggerEvent("close");
    },

    // 套餐包含菜品需要单独查询，弹窗打开时才拉取
    async loadDishes(setmealId: number) {
      this.setData({ loading: true });

      try {
        const res = await request<SetMealDish[]>({
          url: `/user/setmeal/dish/${setmealId}`,
        });

        const flavorItems = buildSetmealFlavorItems(res.data);

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

        this.setData({ dishItems, loading: false });
      } catch (err) {
        console.error("加载套餐包含菜品失败:", err);
        this.setData({ loading: false, loadFailed: true });
      }
    },

    onRetry() {
      const setmeal = this.data.setmeal as Setmeal | null;
      if (!setmeal || this.data.loading) {
        return;
      }
      this.loadDishes(setmeal.id);
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

      const groupIndex = dish.groups.findIndex(
        (group) => group.flavorId === fid,
      );

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
      this.updateQuantity(this.data.quantity - 1);
    },

    onPlus() {
      if (this.data.quantity >= MAX_NUMBER) {
        return;
      }
      this.updateQuantity(this.data.quantity + 1);
    },

    updateQuantity(quantity: number) {
      const setmeal = this.data.setmeal as Setmeal | null;

      if (!setmeal) {
        return;
      }

      const price = Number(setmeal.price) || 0;

      this.setData({
        quantity,
        totalText: (price * quantity).toFixed(2),
      });
    },

    async onAdd() {
      if (this.data.adding) {
        return;
      }

      const setmeal = this.data.setmeal as Setmeal | null;

      if (!setmeal) {
        return;
      }

      if (this.data.loading || this.data.loadFailed) {
        wx.showToast({ title: "套餐信息加载中，请稍候", icon: "none" });
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
        this.triggerEvent("added");
      } catch (err) {
        wx.hideLoading();
        console.error("加入购物车失败:", err);
        wx.showToast({ title: "加入购物车失败", icon: "none" });
      } finally {
        this.setData({ adding: false });
      }
    },
  },
});
