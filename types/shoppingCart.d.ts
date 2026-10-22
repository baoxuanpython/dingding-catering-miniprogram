export interface ShoppingCartDTO {
  dishId?: number;
  setmealId?: number;
  flavorId?: number[];
  flavorVal?: string[];
}

export interface ShoppingCart {
  id: number;
  userId: number;
  dishId: number | null;
  setmealId: number | null;
  name: string;
  image: string;
  amount: number;
  number: number;
  flavorId: string;
  flavorVal: string;
  createTime: string;
}
