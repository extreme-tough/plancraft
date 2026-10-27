import "server-only";
import { FinishReason, GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { AiProvider, ModelRequest, ModelResult } from "./provider";

/**
 * Gemini on Vertex AI (ENG-02): authenticated as the App Hosting service account through
 * Application Default Credentials, so no API key exists anywhere.
 */
export class VertexProvider implements AiProvider {
  private readonly client: GoogleGenAI;

  constructor(
    readonly model: string,
    project: string,
    location: string,
  ) {
    this.client = new GoogleGenAI({ vertexai: true, project, location });
  }

  async generate(request: ModelRequest): Promise<ModelResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: "user", parts: [{ text: request.user }] }],
        config: {
          systemInstruction: request.system,
          responseMimeType: "application/json",
          responseJsonSchema: request.responseSchema,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          // Day-1 check: LOW keeps a plan inside the 45 s budget; deeper thinking risked the timeout.
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: controller.signal,
        },
      });
      const finish = response.candidates?.[0]?.finishReason;
      if (response.promptFeedback?.blockReason || finish === FinishReason.SAFETY || finish === FinishReason.PROHIBITED_CONTENT) {
        return { kind: "error", code: "AI_BLOCKED" };
      }
      // Truncated or empty text still goes to validation: it fails there and gets one repair attempt.
      return { kind: "ok", text: response.text ?? "" };
    } catch {
      return { kind: "error", code: controller.signal.aborted ? "AI_TIMEOUT" : "AI_UNAVAILABLE" };
    } finally {
      clearTimeout(timer);
    }
  }
}
