import type { User, UserLoginVO } from "./types/user";
import type { ShoppingCart } from "./types/shoppingCart";
import { request } from "./utils/request";

App({
  globalData: {
    token: "" as string,
    userInfo: null as User | null,
    cartList: [] as ShoppingCart[],
    cartTotal: 0 as number,
    cartCount: 0 as number,
    loginReady: false as boolean,
  },

  onLaunch() {
    this.checkLoginStatus().then(() => {
      this.globalData.loginReady = true;
      this.ensureAuth();
    });
  },

  ensureAuth() {
    const { userInfo } = this.globalData;
    if (!userInfo || !userInfo.name || !userInfo.avatar) {
      wx.redirectTo({ url: "/pages/auth/index" });
    }
  },

  async checkLoginStatus() {
    const token = wx.getStorageSync("token");

    if (token) {
      this.globalData.token = token;
      await this.fetchUserInfo();
    } else {
      await this.wxLogin();
    }
  },

  async wxLogin() {
    try {
      const loginRes =
        await new Promise<WechatMiniprogram.LoginSuccessCallbackResult>(
          (resolve, reject) => {
            wx.login({
              success: resolve,
              fail: reject,
            });
          },
        );

      const res = await request<UserLoginVO>({
        url: "/user/user/login",
        method: "POST",
        data: { code: loginRes.code },
      });

      this.globalData.token = res.data.token;
      this.globalData.userInfo = {
        id: res.data.id,
        openid: res.data.openid,
        name: res.data.name || "",
        avatar: res.data.avatar || "",
        phone: "",
        sex: "",
        idNumber: "",
        createTime: "",
      };

      wx.setStorageSync("token", res.data.token);
      wx.setStorageSync("userInfo", this.globalData.userInfo);
    } catch (err) {
      console.error("微信登录异常:", err);
    }
  },

  async fetchUserInfo() {
    try {
      const res = await request<User>({
        url: "/user/user/info",
        method: "GET",
      });

      this.globalData.userInfo = res.data;
      wx.setStorageSync("userInfo", res.data);
    } catch (err) {
      console.error("获取用户信息失败:", err);
    }
  },

  updateCartData(cartList: ShoppingCart[]) {
    this.globalData.cartList = cartList;
    this.globalData.cartCount = cartList.reduce(
      (sum, item) => sum + item.number,
      0,
    );
    this.globalData.cartTotal = cartList.reduce(
      (sum, item) => sum + item.amount * item.number,
      0,
    );
  },
});
