import { request, startLoading, endLoading } from "../../utils/request";
import { normalizeImageUrl } from "../../utils/image";
import { addToCartTimes } from "../../utils/cart";
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
    // 请求序号：只用于丢弃过期响应，不参与渲染
    loadSeq: 0,
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
        // adding 在成功加购后会保持 true 直到弹窗关闭，这里必须复位，
        // 否则下次打开弹窗时「加入购物车」会一直被防重入拦掉
        this.setData({ quantity: 1, adding: false });
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
        adding: false,
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
      // 快速切换套餐时旧请求可能后到并覆盖新套餐的菜品与口味，
      // 用序号丢弃过期响应，避免把 A 的口味提交到 B 的购物车项
      const seq = this.data.loadSeq + 1;
      this.setData({ loading: true, loadFailed: false, loadSeq: seq });

      try {
        const res = await request<SetMealDish[]>({
          url: `/user/setmeal/dish/${setmealId}`,
          // 失败状态由 loadFailed 展示并带重试按钮，不弹通用提示
          silentError: true,
        });

        // 已过期：本次响应属于上一个套餐，直接丢弃，loading 交给最新请求复位
        if (seq !== this.data.loadSeq) {
          return;
        }

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
        if (seq !== this.data.loadSeq) {
          return;
        }
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

      if (this.data.loading) {
        wx.showToast({ title: "套餐信息加载中，请稍候", icon: "none" });
        return;
      }

      if (this.data.loadFailed) {
        wx.showToast({ title: "套餐内容加载失败，请点击重试", icon: "none" });
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
