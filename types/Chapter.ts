import { MediaType, SubscriptionPlan } from "../enums";

import { IQuestion } from "./Question";

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
  questions?: IQuestion[];
  cover: string;
  category: string;
  series?: string;
  likes: number;
  author: string,
  total: number,
  isDownloadable: boolean;
  toc: {
    cut: string;
    title: string;
  }[];
  lyrics?: string; // in such a format "[00:01:00] - line 1\n[00:02:00] - line 2"
  createdAt: Date;
  updatedAt: Date;
}