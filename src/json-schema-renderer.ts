import type { JSONSchema7 } from '@ai-sdk/provider';

export interface JsonSchemaToInstructionOptions {
  includeDescriptions?: boolean;
  /** Number of spaces per indent level. Defaults to 2. */
  indent?: number;
}

interface WalkContext {
  includeDescriptions: boolean;
  indent: string;
  depth: number;
}

export function jsonSchemaToInstruction(
  schema: JSONSchema7,
  options: JsonSchemaToInstructionOptions = {},
): string {
  const ctx: WalkContext = {
    includeDescriptions: options.includeDescriptions ?? true,
    indent: ' '.repeat(options.indent ?? 2),
    depth: 0,
  };
  return walk(schema, ctx);
}

/**
 * Returns a representation of `schema`. For multi-line output, the FIRST
 * line is unindented — the caller decides where the rendered value lives on
 * its line (e.g. after `"key": `). Subsequent lines are indented to align
 * with `ctx.depth` (so they sit under the value, not flush left).
 */
function walk(schema: JSONSchema7 | undefined, ctx: WalkContext): string {
  if (!schema || typeof schema !== 'object') return '<unknown>';

  if (schema.anyOf) return walkUnion(schema.anyOf as JSONSchema7[], ctx);
  if (schema.oneOf) return walkUnion(schema.oneOf as JSONSchema7[], ctx);

  if (schema.type === 'object') return walkObject(schema, ctx);
  if (schema.type === 'array') return walkArray(schema, ctx);
  if (schema.type === 'string') return walkString(schema);
  if (schema.type === 'number') return walkNumber(schema, 'number');
  if (schema.type === 'integer') return walkNumber(schema, 'integer');
  if (schema.type === 'boolean') return '<boolean>';

  if (schema.const !== undefined) return formatValue(schema.const);

  return '<unknown>';
}

function walkObject(schema: JSONSchema7, ctx: WalkContext): string {
  const properties = (schema.properties ?? {}) as Record<string, JSONSchema7>;
  const required = schema.required ?? [];
  const keys = Object.keys(properties);
  if (keys.length === 0) return '{}';

  const inner = ctx.indent.repeat(ctx.depth + 1);
  const closer = ctx.indent.repeat(ctx.depth);
  const childCtx = { ...ctx, depth: ctx.depth + 1 };

  const lines: string[] = ['{'];
  for (const key of keys) {
    const prop = properties[key];
    if (ctx.includeDescriptions && prop.description) {
      lines.push(`${inner}// ${prop.description}`);
    }
    const optional = required.includes(key) ? '' : '?';
    const rendered = walk(prop, childCtx);
    const defaultSuffix =
      prop.default !== undefined
        ? ` (default: ${formatValue(prop.default)})`
        : '';
    lines.push(`${inner}"${key}"${optional}: ${rendered}${defaultSuffix},`);
  }
  lines.push(`${closer}}`);
  return lines.join('\n');
}

function walkArray(schema: JSONSchema7, ctx: WalkContext): string {
  const items = schema.items as JSONSchema7 | undefined;
  if (!items) return '[]';

  const inner = ctx.indent.repeat(ctx.depth + 1);
  const closer = ctx.indent.repeat(ctx.depth);
  const childCtx = { ...ctx, depth: ctx.depth + 1 };
  const rendered = walk(items, childCtx);
  return `[\n${inner}${rendered},\n${inner}// ...\n${closer}]`;
}

function walkUnion(options: JSONSchema7[], ctx: WalkContext): string {
  return options
    .map((opt) => {
      if (opt.const !== undefined) return formatValue(opt.const);
      return walk(opt, ctx);
    })
    .join(' | ');
}

function walkString(schema: JSONSchema7): string {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.map(formatValue).join(' | ');
  }
  return '<string>';
}

function walkNumber(schema: JSONSchema7, label: 'number' | 'integer'): string {
  const { minimum, maximum } = schema;
  if (minimum !== undefined && maximum !== undefined) {
    return `<${label}, ${minimum}–${maximum}>`;
  }
  if (minimum !== undefined) return `<${label}, ≥${minimum}>`;
  if (maximum !== undefined) return `<${label}, ≤${maximum}>`;
  return `<${label}>`;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}
