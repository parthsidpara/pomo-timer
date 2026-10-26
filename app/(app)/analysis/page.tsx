import type { Metadata } from "next";
import { AnalysisPage } from "@/components/analysis-page";

export const metadata: Metadata = {
  title: "Analysis · Worklog",
};

export default function Page() {
  return <AnalysisPage />;
}
