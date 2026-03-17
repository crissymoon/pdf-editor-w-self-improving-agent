function resolveOptionDef(config, token) {
  const globalOptions = Array.isArray(config.options) ? config.options : [];
  for (const opt of globalOptions) {
    if (opt.name === token) {
      return opt;
    }
    if (Array.isArray(opt.aliases) && opt.aliases.includes(token)) {
      return opt;
    }
  }
  return null;
}

export function parseArgs(config, argv) {
  const options = new Set();
  const positionals = [];

  for (const token of argv) {
    if (token.startsWith("-")) {
      const optDef = resolveOptionDef(config, token);
      if (optDef) {
        options.add(optDef.name);
      }
      continue;
    }

    positionals.push(token);
  }

  return {
    positionals,
    options
  };
}
