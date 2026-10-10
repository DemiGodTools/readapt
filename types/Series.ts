import { SubscriptionPlan } from "../enums";
import { IChapter } from "./Chapter";
import { IQuestion } from "./Question";

export type ISeriesContent =
  | { content: IChapter; contentModel: "Chapter"; order: number }
  | { content: IQuestion; contentModel: "Question"; order: number };

export interface ISeries {
  _id: string;
  title: string;
  author?: string;
  description: string;
  joinedBy: string[];
  chapters: ISeriesContent[]; // automatically populated from api
  for: SubscriptionPlan;
  cover: string;
  category: string;
  type?: 'normal' | 'framework';
  recommendationBookId?: any;  
  recommendationText?: string; 
  updatedAt: Date;
}