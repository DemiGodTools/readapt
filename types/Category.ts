export interface ICategoryCounts {
  total: number;
  pdf: number;
  audio: number;
}

export interface ISubCategory {
  _id: string;
  name: string;
  image?: string;
  description?: string;
  parentCategory?: string | null;
  isFeatured?: boolean;
  order?: number;
  counts?: ICategoryCounts;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ICategory {
  _id: string;
  name: string;
  image: string; // URL
  description?: string;
  parentCategory?: string | null;
  isFeatured?: boolean;
  order?: number;
  counts?: ICategoryCounts;
  subCategories?: ISubCategory[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
