/**
 * Shared types for the Command Code Go for vscode extension.
 */

// ---- API request/response types ----

/**
 * Reasoning effort values supported by the picker.
 *
 * `none` means "do not send any reasoning parameters" — the model runs in its
 * default non-thinking mode. `low` / `medium` / `high` map directly onto the
 * OpenAI-compatible `reasoning_effort` field for models that advertise
 * reasoning capability.
 */
export type ReasoningEffort = 'low' | 'medium' | 'high';

export type ThinkingEffort = 'none' | ReasoningEffort;

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
	role: ChatRole;
	/** Text content of the message. May be empty for tool/assistant turns. */
	content: string;
	tool_call_id?: string;
	tool_calls?: ChatToolCall[];
	reasoning_content?: string;
	/** Optional multimodal content for user messages (vision input). */
	parts?: ChatMessagePart[];
}

export type ChatMessagePart =
	| { type: 'text'; text: string }
	| {
			type: 'image_url';
			image_url: { url: string; detail?: 'auto' | 'low' | 'high' };
	  };

export interface ChatToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

export interface ChatTool {
	type: 'function';
	function: {
		name: string;
		description?: string;
		parameters?: Record<string, unknown>;
	};
}

/**
 * Tool definition used by Command Code's `/alpha/generate` envelope.
 *
 * This endpoint does not accept the OpenAI `{ type, function: {...} }` shape;
 * it expects the Vercel/CLI shape with the name and JSON schema at the top
 * level.
 */
export interface CommandCodeTool {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
}

export interface ChatUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
	prompt_cache_hit_tokens?: number;
	prompt_cache_miss_tokens?: number;
}

/** Workspace and Git metadata required by the Command Code generate endpoint. */
export interface CommandCodeRequestConfig {
	workingDir: string;
	date: string;
	environment: 'cli';
	structure: unknown[];
	isGitRepo: boolean;
	currentBranch: string;
	mainBranch: string;
	gitStatus: string;
	recentCommits: string[];
}

/** A message encoded in the `params.messages` format used by `/alpha/generate`. */
export interface CommandCodeGenerateMessage {
	role: ChatRole;
	content: CommandCodeMessagePart[];
}

/** Content parts accepted by the Vercel AI SDK message schema. */
export type CommandCodeMessagePart =
	| { type: 'text'; text: string }
	| { type: 'image'; image: string; mimeType?: string }
	| { type: 'reasoning'; text: string }
	| { type: 'tool-call'; toolCallId: string; toolName: string; input: Record<string, unknown> }
	| {
			type: 'tool-result';
			toolCallId: string;
			toolName: string;
			output: { type: 'text' | 'error-text'; value: string };
	  };

/** Parameters accepted by the Command Code generate endpoint. */
export interface CommandCodeGenerateParams {
	model: string;
	messages: CommandCodeGenerateMessage[];
	tools: CommandCodeTool[];
	system: string;
	max_tokens: number;
	temperature: number;
	stream: true;
	reasoning_effort?: ReasoningEffort;
}

/**
 * Request envelope used by `POST /alpha/generate`.
 *
 * `memory`, `taste`, and `skills` are deliberately empty for the VS Code
 * integration. Command Code's CLI owns those values; VS Code already sends
 * its chat context as `params.messages`.
 */
export interface ChatRequest {
	config: CommandCodeRequestConfig;
	memory: '';
	taste: '';
	skills: '';
	params: CommandCodeGenerateParams;
	threadId: string;
}

// ---- Stream callbacks ----

export interface StreamCallbacks {
	onContent: (content: string) => void;
	onThinking: (text: string) => void;
	onToolCall: (toolCall: ChatToolCall) => void;
	onError: (error: Error) => void;
	onDone?: () => void;
	onUsage?: (usage: ChatUsage) => void;
}

// ---- Model registry ----

export interface ThinkingCapability {
	/** Effort values that appear in the model picker dropdown. */
	supportedEfforts: readonly ReasoningEffort[];
	defaultEffort: ReasoningEffort;
	/** When true, `none` is offered alongside the configured efforts. */
	canDisable: boolean;
}

export interface ModelDefinition {
	id: string;
	name: string;
	family: string;
	version: string;
	detail: string;
	maxInputTokens: number;
	maxOutputTokens: number;
	capabilities: {
		/** `false` disables tools; a number limits tools per request. */
		toolCalling: false | number;
		imageInput: boolean;
		thinking: ThinkingCapability | false;
	};
	/** Optional category used to group models in logs/UI. */
	category?: string;
	/**
	 * True when the model was auto-discovered from the live catalog rather
	 * than maintained in the static registry. Used to surface the upstream
	 * model id in the picker's tooltip card.
	 */
	fetched?: boolean;
}

export interface ApiModelInfo {
	id: string;
	owned_by?: string;
	/** Human-readable model name reported by the upstream `/models` response. */
	name?: string;
	/**
	 * Total context window in tokens (input + output) as reported by
	 * `GET /provider/v1/models`. Consumed by the live catalog sync to keep
	 * the picker's reported context in step with the upstream registry.
	 */
	context_length?: number;
	/**
	 * Capability hints derived from the model registry. The upstream `/models`
	 * response is not yet guaranteed to include this — we infer it when known.
	 */
	capabilities?: {
		toolCalling?: boolean | number;
		imageInput?: boolean;
		thinking?: ThinkingCapability | false;
	};
}

/**
 * Raw shape returned by `GET /provider/v1/models`. We only consume `data`,
 * but keep the envelope so future fields (e.g. pagination) can be added
 * without changing the parser signature.
 */
export interface ApiModelsResponse {
	data?: ApiModelInfo[];
}
