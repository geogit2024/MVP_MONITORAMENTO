// src/components/types.ts
export interface SidebarProps {
  dateFrom: string;
  dateTo: string;
  cloudPct: number;
  satellite: string;
  satellites: string[];
  onDateFromChange(v: string): void;
  onDateToChange(v: string): void;
  onCloudPctChange(v: number): void;
  onSatelliteChange(v: string): void;
  imagesList: {
    id: string;
    date: string;
    thumbnailUrl: string;
  }[];
  onNdviRequest(imageId: string): void;
}
