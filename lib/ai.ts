import OpenAI from "openai";
import { z } from "zod";
import {
  ApplicationData,
  REQUIRED_GOVERNMENT_WARNING,
  VerificationResult,
} from "./types";

const FieldAnalysisSchema = z.object({
  field: z.string(),
  applicationValue: z.string(),
  extractedValue: z.string(),
  status: z.enum(["exact_match", "fuzzy_match", "mismatch"]),
  explanation: z.string().min(1),
});

const VerificationResultSchema = z.object({
  overallStatus: z.enum(["pass", "issues"]),
  issuesCount: z.number().int().min(0),
  analyses: z.array(FieldAnalysisSchema),
  readabilityNote: z.string().optional(),
  warningFormatting: z
    .object({
      headerAllCaps: z.boolean(),
      appearsBold: z.boolean(),
      fullTextExact: z.boolean(),
      notes: z.string(),
    })
    .optional(),
});

function getClient() {
  const xaiKey = process.env.XAI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!xaiKey && !openaiKey) {
    throw new Error(
      "Missing API key. Set XAI_API_KEY (preferred) or OPENAI_API_KEY in .env.local (for local) or in your Vercel project Environment Variables."
    );
  }

  return new OpenAI({
    apiKey: xaiKey || openaiKey,
    baseURL: xaiKey ? "https://api.x.ai/v1" : undefined,
  });
}

const SYSTEM_PROMPT = `You are an expert, precise assistant to TTB (Alcohol and Tobacco Tax and Trade Bureau) label compliance agents.

Your job is to read a photograph of an alcohol beverage label and compare it, field-by-field, against the values submitted in the application (COLA data).

CRITICAL RULES — PAY EXTREME ATTENTION:

1. GOVERNMENT WARNING (mandatory on every label >= 0.5% ABV):
   The EXACT required text is:
   "${REQUIRED_GOVERNMENT_WARNING}"

   - The header must be "GOVERNMENT WARNING:" in ALL CAPITAL LETTERS.
   - It must be visually prominent (bold or heavier weight).
   - The full statement must match verbatim, including parentheses, numbers, and punctuation.
   - Common failures: title case ("Government Warning"), missing words, wrong punctuation, smaller text, creative wording.

2. For every other field:
   - Extract exactly what is visible on the label (preserve capitalization, numbers, abbreviations as written).
   - Then compare to the provided application value using human judgment:
     • "exact_match": identical or trivially different (spacing).
     • "fuzzy_match": clearly the same intended value despite minor differences in casing, punctuation, possessives, articles, or common abbreviations (example: "OLD TOM DISTILLERY" vs "Old Tom Distillery", "Stone's Throw" vs "STONE'S THROW", "45% Alc./Vol." vs "45% Alcohol by Volume").
     • "mismatch": different meaning or clearly wrong value.

FIELDS TO ALWAYS EXTRACT AND COMPARE:
- Brand Name
- Class/Type Designation (e.g. "Kentucky Straight Bourbon Whiskey")
- Alcohol Content (e.g. "45% Alc./Vol. (90 Proof)")
- Net Contents (e.g. "750 mL")
- Producer / Bottler / Importer name and address (if visible)
- Country of Origin (if visible and required)

OUTPUT FORMAT:
Return ONLY valid JSON matching this shape (no markdown, no extra text before or after):
{
  "overallStatus": "pass" | "issues",
  "issuesCount": number,
  "analyses": [
    {
      "field": "Brand Name",
      "applicationValue": "...",
      "extractedValue": "...",
      "status": "exact_match" | "fuzzy_match" | "mismatch",
      "explanation": "short, specific reason"
    },
    ... (one entry per field above + Government Warning)
  ],
  "readabilityNote": "optional short note if the photo was difficult (glare, angle, low contrast, etc.)",
  "warningFormatting": {
    "headerAllCaps": boolean,
    "appearsBold": boolean,
    "fullTextExact": boolean,
    "notes": "specific observations about the warning block"
  }
}

Be strict on the warning. Be intelligently forgiving (but honest) on brand names and minor variations for other fields. If text is unreadable, say so clearly in the explanation and readabilityNote.`;

export async function verifyLabel(
  imageDataUrl: string,
  application: ApplicationData
): Promise<VerificationResult> {
  const client = getClient();

  // Use a strong vision model. xAI Grok vision models work with the same format.
  // You can override by changing here or via env in the future.
  const model = process.env.VISION_MODEL || "grok-4";

  const userContent = [
    {
      type: "text" as const,
      text: `Here is the label photograph and the application data to compare against.

APPLICATION DATA (what the producer claims is on the label):
${JSON.stringify(application, null, 2)}

Please analyze the attached image and return the exact JSON structure described in your system instructions. Be precise and complete.`,
    },
    {
      type: "image_url" as const,
      image_url: {
        url: imageDataUrl,
        detail: "high" as const,
      },
    },
  ];

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent as any },
    ],
    temperature: 0.1,
    max_tokens: 1800,
    response_format: { type: "json_object" }, // many compatible models honor this
  });

  const raw = completion.choices[0]?.message?.content?.trim() || "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fallback: try to extract JSON block if the model added prose
    const jsonMatch = raw.match(/\{[\s\S]*\}$/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  }

  if (!parsed) {
    throw new Error("Model did not return valid JSON. Raw: " + raw.slice(0, 300));
  }

  // Validate + coerce with zod for safety
  const validated = VerificationResultSchema.safeParse(parsed);
  if (!validated.success) {
    // Return a graceful degraded result instead of crashing the UX
    return {
      overallStatus: "issues",
      issuesCount: 1,
      analyses: [
        {
          field: "Parse Error",
          applicationValue: "",
          extractedValue: "",
          status: "mismatch",
          explanation:
            "The model response could not be fully parsed. Please try again or use a clearer photo. Raw excerpt: " +
            raw.slice(0, 180),
        },
      ],
      readabilityNote: "Model output parsing issue",
    };
  }

  return validated.data;
}
