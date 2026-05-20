export interface Product {
  name: string;
  price: string;
  url: string;
  brand?: string;
  description?: string;
  originalPrice?: string;
  discount?: string;
  currency?: string;
  stock?: string;
  availability?: string;
  rating?: string;
  reviewCount?: number;
  category?: string;
  subCategory?: string;
  tags?: string[];
  images?: string[];
  specs?: Record<string, string>;
  priceNumeric?: number;
  slug?: string;
}

export interface RawProductInput {
  name?: string;
  title?: string;
  productName?: string;
  price?: string | number;
  priceNumeric?: number;
  url?: string;
  image?: string;
  thumbnail?: string;
  images?: string[];
  slug?: string;
  id?: string;
  productId?: string;
  brand?: string;
  description?: string;
  originalPrice?: string;
  discount?: string;
  currency?: string;
  stock?: string;
  availability?: string;
  rating?: string;
  reviewCount?: number;
  category?: string;
  subCategory?: string;
  tags?: string[];
  specs?: Record<string, string>;
}

export interface HuskelConfig {
  siteId?: string;
  apiUrl?: string;
  apiToken?: string;
}

export interface SearchRequest {
  query: string;
  siteId: string;
  limit?: number;
}

export interface SearchResult {
  id: string;
  score: number;
  product: Product;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
}

export interface IngestResponse {
  success: boolean;
  message?: string;
  count?: number;
}

export interface HuskelError {
  status: number;
  message: string;
}
