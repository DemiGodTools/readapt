import React from "react";
import Svg, { Path, Rect, Circle, Polyline } from "react-native-svg";

export type ProfessionType =
  | "Student"
  | "Professional"
  | "Researcher"
  | "Entrepreneur"
  | "Content Creator"
  | "Educator"
  | "Developer"
  | "Designer"
  | "Writer"
  | "Other"
  | "";

export const PROFESSION_OPTIONS: Exclude<ProfessionType, "">[] = [
  "Student",
  "Professional",
  "Researcher",
  "Entrepreneur",
  "Content Creator",
  "Educator",
  "Developer",
  "Designer",
  "Writer",
  "Other",
];

export const ProfessionIcon = ({
  type,
  color,
  size = 18,
}: {
  type: string;
  color: string;
  size?: number;
}) => {
  const norm = (type || "").trim();
  switch (norm) {
    case "Student":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <Path d="M6 12v5c3 3 9 3 12 0v-5" />
        </Svg>
      );
    case "Professional":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Rect x="2" y="7" width="20" height="14" rx="2" />
          <Path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </Svg>
      );
    case "Researcher":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M6 18h8" />
          <Path d="M3 22h18" />
          <Path d="M14 22a7 7 0 1 0 0-14h-1" />
          <Path d="M9 14h2" />
          <Path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
        </Svg>
      );
    case "Entrepreneur":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <Path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        </Svg>
      );
    case "Content Creator":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="m22 8-6 4 6 4V8Z" />
          <Rect x="2" y="6" width="14" height="12" rx="2" />
        </Svg>
      );
    case "Educator":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <Path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </Svg>
      );
    case "Developer":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Polyline points="16 18 22 12 16 6" />
          <Polyline points="8 6 2 12 8 18" />
        </Svg>
      );
    case "Designer":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 19l7-7 3 3-7 7-3-3z" />
          <Path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          <Circle cx="11" cy="11" r="2" />
        </Svg>
      );
    case "Writer":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </Svg>
      );
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Circle cx="12" cy="12" r="9" />
          <Circle cx="12" cy="12" r="1.5" fill={color} />
          <Circle cx="16.5" cy="12" r="1.5" fill={color} />
          <Circle cx="7.5" cy="12" r="1.5" fill={color} />
        </Svg>
      );
  }
};
