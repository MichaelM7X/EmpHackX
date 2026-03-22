import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function callOpenAIJson(
  systemPrompt: string,
  userPrompt: string,
): Promise<Record<string, unknown>> {
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "{}";
    return JSON.parse(text);
  } catch (error) {
    console.error("OpenAI API error:", error);
    return {};
  }
}

export async function callOpenAIText(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content?.trim() ?? "";
  } catch (error) {
    console.error("OpenAI API error:", error);
    return "Report generation failed. Please review the structured findings.";
  }
}

export async function callOpenAIChat(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content?.trim() ?? "";
  } catch (error) {
    console.error("OpenAI API error:", error);
    return "";
  }
}
