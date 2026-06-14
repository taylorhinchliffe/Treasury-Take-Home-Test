export interface ApplicationData {
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
  producer?: string;
  countryOfOrigin?: string;
  governmentWarning: string;
}

export type MatchStatus = "exact_match" | "fuzzy_match" | "mismatch";

export interface FieldAnalysis {
  field: string;
  applicationValue: string;
  extractedValue: string;
  status: MatchStatus;
  explanation: string;
}

export interface VerificationResult {
  overallStatus: "pass" | "issues";
  issuesCount: number;
  analyses: FieldAnalysis[];
  readabilityNote?: string;
  // Special structured notes for the critical warning check
  warningFormatting?: {
    headerAllCaps: boolean;
    appearsBold: boolean;
    fullTextExact: boolean;
    notes: string;
  };
}

export interface BatchItem {
  id: string;
  file: File | null; // null after processed for memory
  fileName: string;
  previewUrl: string; // local object URL
  data: ApplicationData;
  result?: VerificationResult;
  status: "idle" | "processing" | "done" | "error";
  error?: string;
}

// Default empty application data (helpful for UX)
export const emptyApplicationData: ApplicationData = {
  brandName: "",
  classType: "",
  alcoholContent: "",
  netContents: "",
  producer: "",
  countryOfOrigin: "",
  governmentWarning:
    "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.",
};

// The canonical required warning text (for prompt + UI)
export const REQUIRED_GOVERNMENT_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";
