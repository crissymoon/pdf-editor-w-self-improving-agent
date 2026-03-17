function canonicalize(value) {
  return String(value)
    .toLowerCase()
    .replace(/[:_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function commandKeys(command) {
  const keys = [command.name];
  if (Array.isArray(command.aliases)) {
    keys.push(...command.aliases);
  }
  return keys.map((key) => canonicalize(key));
}

function resolveFromGroups(config, tokens) {
  const groups = Array.isArray(config.groups) ? config.groups : [];
  if (groups.length === 0 || tokens.length === 0) {
    return null;
  }

  const groupCandidate = canonicalize(tokens[0]);
  for (const group of groups) {
    if (!commandKeys(group).includes(groupCandidate)) {
      continue;
    }

    if (tokens.length < 2) {
      return { type: "group", group, consumedTokens: 1 };
    }

    const subCandidate = canonicalize(tokens[1]);
    const subcommands = Array.isArray(group.subcommands) ? group.subcommands : [];
    for (const sub of subcommands) {
      if (commandKeys(sub).includes(subCandidate)) {
        return { type: "command", command: sub, consumedTokens: 2 };
      }
    }

    return { type: "group", group, consumedTokens: 1 };
  }

  return null;
}

export function resolveCommand(config, inputTokens) {
  const tokens = Array.isArray(inputTokens) ? inputTokens : [];
  if (tokens.length === 0) {
    return null;
  }

  const byLength = [...tokens.keys()].map((i) => i + 1).sort((a, b) => b - a);

  // Full-consume flat command matches (longest prefix, all tokens used).
  for (const length of byLength) {
    if (length !== tokens.length) continue;
    const candidate = canonicalize(tokens.slice(0, length).join(" "));
    for (const cmd of config.commands) {
      if (commandKeys(cmd).includes(candidate)) {
        return { type: "command", command: cmd, consumedTokens: length };
      }
    }
  }

  // Hierarchical group routing.
  const groupResult = resolveFromGroups(config, tokens);
  if (groupResult) {
    return groupResult;
  }

  // Partial-consume flat fallback for single-token aliases.
  for (const length of byLength) {
    const candidate = canonicalize(tokens.slice(0, length).join(" "));
    for (const cmd of config.commands) {
      if (commandKeys(cmd).includes(candidate)) {
        return { type: "command", command: cmd, consumedTokens: length };
      }
    }
  }

  return null;
}
