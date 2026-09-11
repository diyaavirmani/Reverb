import { NextResponse } from "next/server";

import { requireReverbPermission } from "../../../../lib/auth/authorization";
import { saveReverbProfile } from "../../../../lib/venue/clerk-profile";
import { reverbVenueProfileSchema, type ReverbVenueProfile } from "../../../../lib/venue/profile";
import { analyzeVenueWebsite, WebsiteAnalysisError } from "../../../../lib/venue/website-analysis";

export async function POST(request: Request) {
  const { userId } = await requireReverbPermission("venue:manage");
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = reverbVenueProfileSchema.safeParse(value);
  if (!parsed.success) {
    return NextResponse.json({ error: "Complete the required venue details before analysis.", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await analyzeVenueWebsite(parsed.data);
    const profile = await saveReverbProfile(userId, {
      ...parsed.data,
      onboardingComplete: false,
      briefApproved: false,
      brand: { ...parsed.data.brand, ...removeEmptyBrandValues(result.brand) },
      analysis: {
        lastAnalyzedAt: result.lastAnalyzedAt,
        sourceUrls: result.sourceUrls,
        sourceStatuses: result.sourceStatuses,
        facts: result.facts,
        inferences: result.inferences,
        pageTitle: result.pageTitle,
        metaDescription: result.metaDescription,
        openGraphImage: result.openGraphImage
      }
    });
    return NextResponse.json({ profile, noWebsite: !profile.venue.websiteUrl });
  } catch (error) {
    if (error instanceof WebsiteAnalysisError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    }
    throw error;
  }
}

function removeEmptyBrandValues(values: Partial<ReverbVenueProfile["brand"]>) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value))
  ) as Partial<ReverbVenueProfile["brand"]>;
}
