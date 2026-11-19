import messages from '../config/messages.json' with { type: 'json' };

// Replace named placeholders without interpreting the supplied values as code.
export function message(key: keyof typeof messages, values: Record<string, string | number> = {}) {
  return messages[key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}
