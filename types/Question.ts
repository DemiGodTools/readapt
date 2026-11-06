export interface IQuestion {
  _id: string;
  question: string;
  options: string[];
  correct: number; // index (0-based)
  explanation?: string;
  comments?: any;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
}
