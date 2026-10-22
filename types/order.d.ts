export interface OrderVO {
  id: number;
  number: string;
  orderDishes: string;
  status: number;
  userId: number;
  addressBookId: number;
  orderTime: string;
  checkoutTime: string;
  payMethod: number;
  payStatus: number;
  amount: number;
  remark: string;
  userName: string;
  phone: string;
  address: string;
  consignee: string;
  cancelReason: string;
  rejectionReason: string;
  cancelTime: string;
  estimatedDeliveryTime: string;
  deliveryStatus: number;
  deliveryTime: string;
  packAmount: number;
  tablewareNumber: number;
  tablewareStatus: number;
  createTime: string;
  updateTime: string;
  orderDetailList: OrderDetail[];
}

export interface OrderDetail {
  id: number;
  name: string;
  orderId: number;
  dishId: number | null;
  setmealId: number | null;
  flavorId: string;
  flavorName: string;
  flavorVal: string;
  dishCopies: number;
  setmealCopies: number;
  amount: number;
  image: string;
  dishVO?: DishVO;
  setmealVO?: SetMealVO;
}

export interface OrdersSubmitDTO {
  addressBookId: number;
  amount: number;
  deliveryStatus: number;
  estimatedDeliveryTime: string;
  packAmount: number;
  payMethod: number;
  remark: string;
  tablewareNumber: number;
  tablewareStatus: number;
}

export interface OrderSubmitVO {
  id: number;
  orderNumber: string;
  orderAmount: number;
  orderTime: string;
}

export interface OrdersPaymentDTO {
  orderNumber: string;
  payMethod: number;
}

export interface OrderPaymentVO {
  estimatedDeliveryTime: string;
}

export interface OrdersCancelDTO {
  cancelReason: string;
}
