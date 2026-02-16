export interface Wine {
  id: string;
  brandName: string;
  wineName: string;
  ava: string;
  vintage: string;
  price: string;
  rating: string;
  review: string;
  region: string;
  type: string;
  mainVarietal: string;
  tastingDate: string;
  publicationDate: string;
  setting: string;
  purchasedProvided: string;
  temp: string;
  hyperlink: string;
}

export interface Meta {
  varietals: string[];
  regions: string[];
  types: string[];
  avaList: string[];
}
