import { AuditRequest, AuditFinding, EvidenceItem } from "../../../src/types";
import { client, callOpenAIJson } from "../../openaiClient";
import { extractSnippet } from "../../utils";
import type {
  ChatCompletionTool,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

const REVIEW_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "cross_check_feature",
      description:
        "Cross-check a specific feature for BOTH proxy leakage and temporal leakage simultaneously. Use when a feature was flagged by one detector but might also have issues detectable by the other.",
      parameters: {
        type: "object",
        properties: {
          feature_name: {
            type: "string",
            description: "The name of the feature to cross-check",
          },
          reason: {
            type: "string",
            description: "Why you think this feature needs cross-checking",
          },
        },
        required: ["feature_name", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deep_dive_feature",
      description:
        "Do a deeper analysis of a feature that was flagged with low or medium confidence. Produces a more thorough assessment with additional evidence.",
      parameters: {
        type: "object",
        properties: {
          feature_name: {
            type: "string",
            description: "The name of the feature to analyze deeper",
          },
          current_finding_summary: {
            type: "string",
            description:
              "Summary of what was already found about this feature",
          },
        },
        required: ["feature_name", "current_finding_summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_feature_interaction",
      description:
        "Check if two features together create a leakage risk that neither has individually. For example, two features that when combined can reconstruct the label.",
      parameters: {
        type: "object",
        properties: {
          feature_a: {
            type: "string",
            description: "First feature name",
          },
          feature_b: {
            type: "string",
            description: "Second feature name",
          },
          hypothesis: {
            type: "string",
            description:
              "Why you suspect these features interact to cause leakage",
          },
        },
        required: ["feature_a", "feature_b", "hypothesis"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finalize_review",
      description:
        "Call this when you are satisfied with the audit and have no more checks to perform.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description:
              "Brief summary of what the review found or confirmed",
          },
        },
        required: ["summary"],
      },
    },
  },
];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

async function executeCrossCheck(
  request: AuditRequest,
  featureName: string,
  reason: string,
): Promise<AuditFinding[]> {
  if (!request.csv_columns.includes(featureName)) return [];

  const result = await callOpenAIJson(
    `You are an ML auditor doing a thorough cross-check of a single feature for ALL types of leakage. Based on the prediction task, infer when the prediction happens. You must respond with ONLY valid JSON.`,
    `Prediction task: ${request.prediction_goal}
Target: ${request.target_column}

Feature to cross-check: ${featureName}
Reason for cross-check: ${reason}

Preprocessing code context:
${request.preprocessing_code}

Analyze this feature for:
1. Proxy leakage: Is it causally downstream of the target?
2. Temporal leakage: Could it use future data?
3. Any other leakage concern?

Respond in JSON:
{
  "findings": [
    {
      "leakage_type": "proxy" or "temporal" or "other",
      "is_issue": true or false,
      "reasoning": "explanation",
      "confidence": "high" or "medium" or "low",
      "evidence": [
        {
          "claim": "one concrete factual observation",
          "source": {
            "filename": "dataset.csv or preprocessing_code.py",
            "location": "column name or line reference"
          }
        }
      ]
    }
  ]
}`,
  );

  const findings: AuditFinding[] = [];
  for (const item of (result.findings as Array<Record<string, unknown>>) ?? []) {
    if (!item.is_issue) continue;
    const bucket =
      item.leakage_type === "temporal" ? "Time leakage" : "Feature / proxy leakage";

    const rawEvidence = (item.evidence as Array<Record<string, unknown>>) ?? [];
    const code = request.preprocessing_code ?? "";
    const evidence: EvidenceItem[] = rawEvidence.length > 0
      ? rawEvidence.map((e) => {
          const fname = String(((e.source as Record<string, unknown>)?.filename) ?? "dataset.csv");
          const loc = String(((e.source as Record<string, unknown>)?.location) ?? `column '${featureName}'`);
          const snippet = fname.includes(".py") || fname.includes("code")
            ? extractSnippet(code, featureName)
            : featureName;
          return {
            claim: String((e.claim as string) ?? item.reasoning ?? "Issue detected"),
            source: { filename: fname, location: loc, snippet },
          };
        })
      : [
          {
            claim: `Review Agent cross-check: ${item.reasoning}`,
            source: { filename: "dataset.csv", location: `column '${featureName}'`, snippet: featureName },
          },
          {
            claim: `Triggered because: ${reason}`,
            source: { filename: "dataset.csv", location: `column '${featureName}'`, snippet: featureName },
          },
        ];

    findings.push({
      id: `review-crosscheck-${slugify(featureName)}-${item.leakage_type}`,
      title: `[Review Agent] Cross-check found ${item.leakage_type} issue in ${featureName}`,
      macro_bucket: bucket as AuditFinding["macro_bucket"],
      fine_grained_type: (
        item.leakage_type === "temporal" ? "temporal" : "proxy"
      ) as AuditFinding["fine_grained_type"],
      severity: item.confidence === "high" ? "high" : "medium",
      confidence: String(item.confidence) as AuditFinding["confidence"],
      flagged_object: featureName,
      evidence,
      why_it_matters:
        "Cross-check by Review Agent found additional leakage risk not caught in initial scan.",
      fix_recommendation: [
        `Review ${featureName} for ${item.leakage_type} leakage and consider removal or redesign.`,
      ],
      needs_human_review: true,
    });
  }
  return findings;
}

async function executeDeepDive(
  request: AuditRequest,
  featureName: string,
  currentFindingSummary: string,
): Promise<AuditFinding[]> {
  if (!request.csv_columns.includes(featureName)) return [];

  const result = await callOpenAIJson(
    `You are an ML auditor performing a deep-dive analysis of a suspicious feature. Provide additional evidence and a more confident assessment. You must respond with ONLY valid JSON.`,
    `Prediction task: ${request.prediction_goal}
Target: ${request.target_column}

Feature: ${featureName}
Previous finding: ${currentFindingSummary}

Preprocessing code context:
${request.preprocessing_code}

Provide a deeper analysis. Consider:
1. Edge cases where this feature might actually be safe
2. Additional evidence that it is or isn't leaking
3. A refined confidence level

Respond in JSON:
{
  "is_still_suspicious": true or false,
  "refined_reasoning": "detailed explanation",
  "refined_confidence": "high" or "medium" or "low",
  "additional_evidence": ["evidence point 1", "evidence point 2"]
}`,
  );

  if (!result.is_still_suspicious) return [];

  const additionalEvidence = (result.additional_evidence as string[]) ?? [];
  const evidence: EvidenceItem[] = [
    {
      claim: `Review Agent deep dive: ${result.refined_reasoning}`,
      source: { filename: "dataset.csv", location: `column '${featureName}'`, snippet: featureName },
    },
    ...additionalEvidence.map((e) => ({
      claim: e,
      source: { filename: "dataset.csv", location: `column '${featureName}'`, snippet: featureName },
    })),
  ];

  return [
    {
      id: `review-deepdive-${slugify(featureName)}`,
      title: `[Review Agent] Deep dive confirmed issue in ${featureName}`,
      macro_bucket: "Feature / proxy leakage",
      fine_grained_type: "proxy",
      severity: result.refined_confidence === "high" ? "critical" : "high",
      confidence: String(result.refined_confidence) as AuditFinding["confidence"],
      flagged_object: featureName,
      evidence,
      why_it_matters:
        "Deep-dive analysis by Review Agent provides stronger evidence for this finding.",
      fix_recommendation: [`Remove ${featureName} — confirmed by deep-dive analysis.`],
      needs_human_review: false,
    },
  ];
}

async function executeInteractionCheck(
  request: AuditRequest,
  featureA: string,
  featureB: string,
  hypothesis: string,
): Promise<AuditFinding[]> {
  const result = await callOpenAIJson(
    `You are an ML auditor checking whether two features together create a leakage risk. You must respond with ONLY valid JSON.`,
    `Prediction task: ${request.prediction_goal}
Target: ${request.target_column}

Feature A: ${featureA}
Feature B: ${featureB}
Hypothesis: ${hypothesis}

Can these two features be combined to reconstruct or closely approximate the target label?

Respond in JSON:
{
  "interaction_creates_leakage": true or false,
  "reasoning": "explanation",
  "confidence": "high" or "medium" or "low"
}`,
  );

  if (!result.interaction_creates_leakage) return [];

  const evidence: EvidenceItem[] = [
    {
      claim: `Review Agent interaction check: ${result.reasoning}`,
      source: { filename: "dataset.csv", location: `columns '${featureA}' and '${featureB}'`, snippet: `${featureA}, ${featureB}` },
    },
    {
      claim: `Hypothesis: ${hypothesis}`,
      source: { filename: "dataset.csv", location: `columns '${featureA}' and '${featureB}'`, snippet: `${featureA}, ${featureB}` },
    },
  ];

  return [
    {
      id: `review-interaction-${slugify(featureA)}-${slugify(featureB)}`,
      title: `[Review Agent] Feature interaction leakage: ${featureA} × ${featureB}`,
      macro_bucket: "Feature / proxy leakage",
      fine_grained_type: "proxy",
      severity: result.confidence === "high" ? "high" : "medium",
      confidence: String(result.confidence) as AuditFinding["confidence"],
      flagged_object: `${featureA} × ${featureB}`,
      evidence,
      why_it_matters:
        "Feature interactions can create leakage that single-feature analysis misses.",
      fix_recommendation: [
        `Review whether ${featureA} and ${featureB} should both remain in the feature set.`,
      ],
      needs_human_review: true,
    },
  ];
}

export async function reviewAgent(
  request: AuditRequest,
  phase1Findings: AuditFinding[],
): Promise<AuditFinding[]> {
  const MAX_ROUNDS = 3;
  const additionalFindings: AuditFinding[] = [];

  const findingsSummary = phase1Findings
    .map(
      (f) =>
        `- [${f.severity.toUpperCase()}/${f.confidence}] ${f.flagged_object}: ${f.title}`,
    )
    .join("\n");

  const featureColumns = request.csv_columns.filter(
    (c) => c !== request.target_column,
  );
  const featureList = featureColumns.map((f) => `- ${f}`).join("\n");

  const systemPrompt = `You are the Review Agent for Clarion, an ML pipeline auditor.

Phase 1 of the audit has completed. Your job is to review the initial findings and decide 
if any additional checks are needed. You have access to tools for:
- Cross-checking a feature for multiple leakage types
- Deep-diving into low-confidence findings for stronger evidence
- Checking if two features interact to create leakage

Review the findings carefully. Focus on:
1. Features flagged with "low" or "medium" confidence that deserve deeper analysis
2. Features that were only checked for one type of leakage but might have another
3. Pairs of features that might interact to leak information
4. Whether any safe features were incorrectly missed

When you are satisfied, call finalize_review. Be efficient — only do additional 
checks when genuinely warranted. Do not repeat checks that Phase 1 already did well.`;

  const initialUserMessage = `Here is the Phase 1 audit context:

Prediction task: ${request.prediction_goal}
Target column: ${request.target_column}

All feature columns:
${featureList}

Phase 1 findings:
${findingsSummary}

Review these findings and decide if any additional checks are needed.`;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: initialUserMessage },
  ];

  console.log(`[Review Agent] Starting review of ${phase1Findings.length} Phase 1 findings...`);

  for (let round = 0; round < MAX_ROUNDS; round++) {
    console.log(`[Review Agent] Round ${round + 1}/${MAX_ROUNDS}`);

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: REVIEW_TOOLS,
      temperature: 0.1,
    });

    const choice = response.choices[0];
    if (!choice) {
      console.log("[Review Agent] No response choice, exiting.");
      break;
    }

    if (
      choice.finish_reason === "stop" ||
      !choice.message.tool_calls?.length
    ) {
      console.log(`[Review Agent] Finished (reason: ${choice.finish_reason}, no tool calls). Additional findings: ${additionalFindings.length}`);
      break;
    }

    console.log(`[Review Agent] Tool calls requested: ${choice.message.tool_calls.map((tc) => tc.function.name).join(", ")}`);
    messages.push(choice.message);

    for (const toolCall of choice.message.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments);
      let toolResult = "";
      let newFindings: AuditFinding[] = [];

      switch (toolCall.function.name) {
        case "cross_check_feature":
          console.log(`[Review Agent]   → cross_check_feature("${args.feature_name}") reason: ${args.reason}`);
          newFindings = await executeCrossCheck(
            request,
            args.feature_name,
            args.reason,
          );
          toolResult =
            newFindings.length > 0
              ? `Cross-check found ${newFindings.length} new issue(s) for ${args.feature_name}.`
              : `Cross-check confirmed ${args.feature_name} has no additional issues.`;
          break;

        case "deep_dive_feature":
          console.log(`[Review Agent]   → deep_dive_feature("${args.feature_name}")`);
          newFindings = await executeDeepDive(
            request,
            args.feature_name,
            args.current_finding_summary,
          );
          toolResult =
            newFindings.length > 0
              ? `Deep dive confirmed and strengthened the finding for ${args.feature_name}.`
              : `Deep dive suggests ${args.feature_name} may actually be safe.`;
          break;

        case "check_feature_interaction":
          console.log(`[Review Agent]   → check_feature_interaction("${args.feature_a}" × "${args.feature_b}")`);
          newFindings = await executeInteractionCheck(
            request,
            args.feature_a,
            args.feature_b,
            args.hypothesis,
          );
          toolResult =
            newFindings.length > 0
              ? `Interaction check found leakage between ${args.feature_a} and ${args.feature_b}.`
              : `No interaction leakage found between ${args.feature_a} and ${args.feature_b}.`;
          break;

        case "finalize_review":
          console.log(`[Review Agent]   → finalize_review: "${args.summary}"`);
          console.log(`[Review Agent] Done. Additional findings: ${additionalFindings.length}`);
          return additionalFindings;

        default:
          toolResult = "Unknown tool called.";
      }

      console.log(`[Review Agent]   Result: ${toolResult}`);
      additionalFindings.push(...newFindings);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult,
      });
    }
  }

  console.log(`[Review Agent] Max rounds reached. Additional findings: ${additionalFindings.length}`);
  return additionalFindings;
}
