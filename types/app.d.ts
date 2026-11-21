import type { User } from "./user";
import type { ShoppingCart } from "./shoppingCart";

// 全局唯一的 App 实例类型：各页面通过 getApp<IApp>() 复用，
// 避免每个页面各写一份字段不同的局部声明（改 app.ts 签名时不会报错）。
declare global {
  interface IApp {
    globalData: {
      token: string;
      userInfo: User | null;
      cartList: ShoppingCart[];
      cartCount: number;
      cartTotal: number;
      orderListDirty: boolean;
      orderListStatus: number;
    };
    initLogin(): Promise<void>;
    waitForLogin(): Promise<void>;
    requireLogin(): boolean;
    isLoggedOut(): boolean;
    login(): Promise<void>;
    logout(): void;
    relogin(): Promise<void>;
    redirectToLogin(): void;
    fetchUserInfo(skipAuthRetry?: boolean): Promise<void>;
    isProfileIncomplete(): boolean;
    updateCartData(cartList: ShoppingCart[]): void;
    syncCartBadge(): void;
  }
}
