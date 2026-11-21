import { normalizeImageUrl } from "../../utils/image";
import { addToCartTimes } from "../../utils/cart";
import { startLoading, endLoading } from "../../utils/request";
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
        // adding 在成功加购后会保持 true 直到弹窗关闭，这里必须复位，
        // 否则下次打开弹窗时「加入购物车」会一直被防重入拦掉
        this.setData({ quantity: 1, adding: false });
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
        adding: false,
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

      // 一份都没成功：保持弹窗打开，让用户可以重试
      if (result.successCount === 0) {
        this.setData({ adding: false });
        wx.showToast({ title: "加入购物车失败", icon: "none" });
        return;
      }

      // 部分成功：前几份已入库，必须给出准确份数并关闭弹窗，否则再点会重复加购
      if (result.failedCount > 0) {
        wx.showToast({
          title: `已加入 ${result.successCount} 份，其余失败`,
          icon: "none",
        });
      } else {
        wx.showToast({ title: "已加入购物车", icon: "none" });
      }

      // adding 保持为 true，由调用方关闭弹窗，避免关闭动画期间再次点击
      this.triggerEvent("added");
    },
  },
});
