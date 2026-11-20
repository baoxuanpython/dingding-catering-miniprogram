import { request } from "../../utils/request";
import { normalizeImageUrl } from "../../utils/image";
import { buildFlavorGroups, collectFlavorPayload } from "../../utils/flavor";
import type { FlavorGroup } from "../../utils/flavor";
import type { DishVO } from "../../types/dish";

const MAX_NUMBER = 99;

Component({
  properties: {
    visible: { type: Boolean, value: false },
    dish: { type: null, value: null },
  },

  data: {
    flavorGroups: [] as FlavorGroup[],
    quantity: 1,
    totalText: "0.00",
    adding: false,
    coverImage: "",
    dishName: "",
    dishDesc: "",
    dishPriceText: "¥0.00",
  },

  observers: {
    "visible, dish"(
      this: WechatMiniprogram.Component.TrivialInstance,
      visible: boolean,
      dish: DishVO | null,
    ) {
      if (!visible || !dish) {
        this.setData({ quantity: 1 });
        return;
      }

      this.setData({
        coverImage: normalizeImageUrl(dish.image),
        dishName: dish.name,
        dishDesc: dish.description || "暂无描述",
        dishPriceText: `¥${Number(dish.price).toFixed(2)}`,
        flavorGroups: buildFlavorGroups(dish.flavors),
        quantity: 1,
        totalText: Number(dish.price).toFixed(2),
      });
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
      this.updateQuantity(this.data.quantity - 1);
    },

    onPlus() {
      if (this.data.quantity >= MAX_NUMBER) {
        return;
      }
      this.updateQuantity(this.data.quantity + 1);
    },

    updateQuantity(quantity: number) {
      const dish = this.data.dish as DishVO | null;
      if (!dish) {
        return;
      }
      this.setData({
        quantity,
        totalText: (Number(dish.price) * quantity).toFixed(2),
      });
    },

    async onAdd() {
      if (this.data.adding) {
        return;
      }

      const dish = this.data.dish as DishVO | null;

      if (!dish) {
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
