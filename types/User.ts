interface IAttemptedQuestion {
  question: string;
  answered: number;
}
import { SubscriptionPlan } from "../enums";
import { IChapter } from "./Chapter";

export interface IUser {
  _id: string;
  email: string;
  name: string;
  userId: string;
  subscription: {
    plan: SubscriptionPlan;
    expiresOn?: Date | null;
  };
  likes: IChapter[];
  image?: string;
  /** 256px avatar variant */
  imageMd?: string;
  /** 128px avatar variant */
  imageSm?: string;
  joinedSeries?: string;
  profileLevel: number;
  questionsAttempted: IAttemptedQuestion[];
  correctAnsStreak?: number;
  streakData?: {
    streak: number;
    lastDate: string;
  };
  recentReads?: {
    chapter: any;
    readtill: string;
    total: string;
    readAt: Date | string;
  }[];
  bio?: string;
  profession?: string;
  interests?: string[];
  visibility?: "Public" | "Private";
  isProfileCompleted?: boolean;
  usernameLastChangedAt?: Date | string | null;
  createdAt: Date;
  updatedAt: Date;
}
