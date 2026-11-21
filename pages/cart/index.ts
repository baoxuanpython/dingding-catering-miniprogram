import { request } from "../../utils/request";
import { normalizeImageUrl } from "../../utils/image";
import type { ShoppingCart } from "../../types/shoppingCart";

interface CartItem extends ShoppingCart {
  flavorText: string;
  lineAmountText: string;
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
    // 首屏请求失败时若落进空态，用户会以为购物车被清空了，进而重复加购
    loadFailed: false,
  },

  // 每行的最新目标份数：连点多次时只提交最后的目标值，避免请求互相覆盖
  desiredNumbers: {} as Record<number, number>,

  // 每行是否有数量请求在飞（与删除锁分开，互不阻塞）
  numberPendingIds: {} as Record<number, boolean>,

  // 正在删除的行
  deletingIds: {} as Record<number, boolean>,

  // 清空是不可逆操作，确认框渲染前的空窗会让双击发出两次
  cleaning: false,

  // 确认框已弹出但尚未确认：防止双击叠出两个确认框，第二次确认会对已删项再发请求
  confirmingDeleteIds: {} as Record<number, boolean>,

  confirmingClean: false,

  // 首次进入才需要全屏加载态；之后每次切回 tab 静默刷新，避免已有列表被「加载中」顶掉
  inited: false,

  async onShow() {
    const app = getApp<IApp>();

    // 冷启动时 initLogin 还在校验 token，必须先等门闩放行，
    // 否则会拿未经校验的旧 token 直接发请求（失效时还会触发并发重登）
    await app.waitForLogin();

    if (!app.requireLogin()) {
      return;
    }

    const firstShow = !this.inited;
    this.inited = true;

    // 有请求在飞时本地已是乐观值，此时用服务端旧数据覆盖会让数字「回跳」
    if (this.hasPendingChange()) {
      return;
    }

    this.loadCartList(!firstShow);
  },

  hasPendingChange() {
    return (
      Object.keys(this.numberPendingIds).length > 0 ||
      Object.keys(this.deletingIds).length > 0
    );
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
        loadFailed: false,
      });

      this.recalcSummary();
    } catch (err) {
      console.error("加载购物车失败:", err);
      // 静默刷新失败保留现有列表；首屏失败必须给重试入口，不能伪装成空购物车
      this.setData({ loading: false, loadFailed: !silent });
    }
  },

  onRetryLoad() {
    this.setData({ loadFailed: false });
    this.loadCartList();
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

  // 先本地改数量，请求失败再以服务端数据为准，避免每次点击都整表重载
  async changeNumber(item: CartItem, target: number) {
    // 记录最新目标值：连点时先本地更新，再由 worker 串行提交最后的目标
    this.desiredNumbers[item.id] = target;
    this.applyNumber(item.id, target);

    // 该行已有 worker 在跑，它结束时会读取最新目标值继续提交
    if (this.numberPendingIds[item.id]) {
      return;
    }

    this.numberPendingIds[item.id] = true;
    let failed = false;

    try {
      let submitted = -1;

      // 串行提交，直到服务端拿到的值等于用户最后一次点出来的目标值
      while (submitted !== this.desiredNumbers[item.id]) {
        const next = this.desiredNumbers[item.id];
        submitted = next;

        await request<string>({
          url: "/user/shoppingCart",
          method: "PUT",
          params: { id: item.id, number: next },
          // 下方 catch 会弹更具体的「修改数量失败」，避免被通用提示覆盖
          silentError: true,
        });
      }
    } catch (err) {
      console.error("修改购物车数量失败:", err);
      failed = true;
      wx.showToast({ title: "修改数量失败", icon: "none" });
    } finally {
      // 排队期间可能已提交过多个中间值，本地无法推断服务端的真实份数，
      // 因此不做回滚猜测，改为拉一次服务端数据作为准
      delete this.desiredNumbers[item.id];
      delete this.numberPendingIds[item.id];
    }

    if (failed) {
      await this.loadCartList(true);
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

    // 双击会在第一个确认框之上再叠一个，第二次确认时该商品已被删掉
    if (this.deletingIds[id] || this.confirmingDeleteIds[id]) {
      return;
    }

    this.confirmingDeleteIds[id] = true;

    wx.showModal({
      title: "提示",
      content: `确定删除「${item.name}」吗？`,
      success: (res) => {
        if (res.confirm) {
          this.doDelete(id);
        }
      },
      // complete 在 success 之后执行，此时 deletingIds 已被 doDelete 接管
      complete: () => {
        delete this.confirmingDeleteIds[id];
      },
    });
  },

  async doDelete(id: number) {
    if (this.deletingIds[id]) {
      return;
    }

    this.deletingIds[id] = true;

    try {
      await request<string>({
        url: "/user/shoppingCart",
        method: "DELETE",
        params: { id },
        showLoading: true,
      });
      wx.showToast({ title: "已删除", icon: "none" });
      // 先在本地移除：静默刷新有往返延迟，不先移除会让已删项短暂「复活」
      this.removeItem(id);
      await this.loadCartList(true);
    } catch (err) {
      console.error("删除购物车商品失败:", err);
    } finally {
      delete this.deletingIds[id];
    }
  },

  removeItem(id: number) {
    this.setData({
      cartList: this.data.cartList.filter((cart) => cart.id !== id),
    });
    this.recalcSummary();
  },

  onClean() {
    if (this.data.cartList.length === 0) {
      return;
    }

    if (this.cleaning || this.confirmingClean) {
      return;
    }

    this.confirmingClean = true;

    wx.showModal({
      title: "提示",
      content: "确定清空购物车吗？",
      success: (res) => {
        if (res.confirm) {
          this.doClean();
        }
      },
      complete: () => {
        this.confirmingClean = false;
      },
    });
  },

  async doClean() {
    if (this.cleaning) {
      return;
    }

    this.cleaning = true;

    try {
      await request<string>({
        url: "/user/shoppingCart/clean",
        method: "DELETE",
        showLoading: true,
      });
      wx.showToast({ title: "已清空", icon: "none" });
      // 服务端已清空，先本地清空：否则刷新失败时界面仍显示已删除的商品，
      // 用户会直接去结算一份已经不存在的数据
      this.setData({ cartList: [] });
      this.recalcSummary();
      await this.loadCartList(true);
    } catch (err) {
      console.error("清空购物车失败:", err);
    } finally {
      this.cleaning = false;
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
