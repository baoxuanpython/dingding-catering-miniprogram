export interface Setmeal {
  id: number;
  categoryId: number;
  name: string;
  price: number;
  status: number;
  description: string;
  image: string;
  createTime: string;
  updateTime: string;
  createUser: number;
  updateUser: number;
  createEmployeeName: string;
  updateEmployeeName: string;
}

export interface SetMealDish {
  id: number;
  setmealId: number;
  dishId: number;
  name: string;
  price: number;
  copies: number;
  setmealDishFlavors: SetmealDishFlavor[];
}

export interface SetmealDishFlavor {
  id: number;
  setmealDishId: number;
  flavorId: number;
  flavorValue: string;
  flavorName: string;
  valueList: string;
}

export interface SetMealVO {
  id: number;
  categoryId: number;
  name: string;
  price: number;
  status: number;
  description: string;
  image: string;
  updateTime: string;
  categoryName: string;
  createEmployeeName: string;
  updateEmployeeName: string;
  setmealDishes: SetMealDish[];
}
