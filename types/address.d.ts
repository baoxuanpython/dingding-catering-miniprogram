export interface SetDefaultDTO {
  id: number;
}

export interface AddressBookDTO {
  detail: string;
  phone: string;
  sex: string;
  consignee?: string;
  provinceCode?: string;
  provinceName?: string;
  cityCode?: string;
  cityName?: string;
  districtCode?: string;
  districtName?: string;
  label?: string;
  isDefault?: number;
  id?: number;
}

export interface AddressBook {
  id: number;
  userId: number;
  consignee: string;
  phone: string;
  sex: string;
  provinceCode: string;
  provinceName: string;
  cityCode: string;
  cityName: string;
  districtCode: string;
  districtName: string;
  detail: string;
  label: string;
  isDefault: number;
}
