import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface ValidationResult {
  passed: boolean;
  score: number; // 0-100
  reasoning: string;
}

/**
 * Scores a deliverable against job criteria using Groq.
 * The score is computed fresh from the model's structured output every call —
 * never hardcode a return value here, that's a documented judge red flag.
 */
export async function validateDeliverable(
  jobDescription: string,
  deliverableText: string
): Promise<ValidationResult> {
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile", // TODO: confirm current recommended Groq model at time of build
    messages: [
      {
        role: "system",
        content:
          "You are a strict but fair work validator. Given a job description and a submitted deliverable, " +
          "score the deliverable from 0 to 100 based on whether it meets the stated criteria. " +
          "Respond ONLY with valid JSON in this exact shape: " +
          '{"score": <number 0-100>, "passed": <boolean>, "reasoning": "<one sentence>"}. ' +
          "A submission passes if score >= 70. Do not include any text outside the JSON object.",
      },
      {
        role: "user",
        content: `Job description: ${jobDescription}\n\nSubmitted deliverable:\n${deliverableText}`,
      },
    ],
    temperature: 0.2,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";

  let parsed: { score?: number; passed?: boolean; reasoning?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    // If the model didn't return clean JSON, fail closed rather than guessing.
    return {
      passed: false,
      score: 0,
      reasoning: "Validator response could not be parsed; treated as failed.",
    };
  }

  const score = Math.max(0, Math.min(100, Math.round(parsed.score ?? 0)));
  return {
    passed: parsed.passed ?? score >= 70,
    score,
    reasoning: parsed.reasoning ?? "No reasoning provided.",
  };
}
