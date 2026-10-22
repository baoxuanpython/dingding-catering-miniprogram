export interface DishVO {
  id: number;
  name: string;
  price: number;
  categoryId: number;
  categoryName: string;
  description: string;
  image: string;
  status: number;
  updateTime: string;
  flavors: DishFlavorVO[];
}

export interface DishFlavorVO {
  id: number;
  dishId: number;
  flavorId: number;
  flavorName: string;
  valueList: string;
}
