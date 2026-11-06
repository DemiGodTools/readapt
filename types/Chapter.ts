// File: types/Chapter.ts
import { MediaType, SubscriptionPlan } from "../enums";

export type IChapter = {
  _id: string;
  title: string;
  details?: string;
  levelNumber?: number;
  shortDescription?: string;
  media: string; // URL
  type: "pdf" | "audio";
  for: SubscriptionPlan;
  isTrending: boolean;
  comments: number;
  questions?: any[];
  cover: string;
  category: string;
  series?: string;
  likes: number;
  author: string;
  total: number;
  isDownloadable: boolean;
  toc: {
    cut: string;
    title: string;
  }[];
  lyrics?: string;
  transcript?: string;
  createdAt: Date;
  updatedAt: Date;
};
