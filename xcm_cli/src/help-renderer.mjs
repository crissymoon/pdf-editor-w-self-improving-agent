export function renderHelp(config) {
  const lines = [];
  const name = config.meta?.name || "xcm";
  const version = config.meta?.version || "0.0.0";
  const description = config.meta?.description || "";

  lines.push(`${name} ${version}`);
  if (description) {
    lines.push(description);
  }
  lines.push("");
  lines.push("Usage:");
  lines.push("  xcm <command>");
  lines.push("");
  lines.push("Commands:");

  const maxCommandLength = Math.max(...config.commands.map((cmd) => cmd.name.length));
  for (const cmd of config.commands) {
    const aliases = Array.isArray(cmd.aliases) && cmd.aliases.length > 0
      ? ` (aliases: ${cmd.aliases.join(", ")})`
      : "";
    const padded = cmd.name.padEnd(maxCommandLength, " ");
    lines.push(`  ${padded}  ${cmd.summary || ""}${aliases}`.trimEnd());
  }

  if (Array.isArray(config.options) && config.options.length > 0) {
    lines.push("");
    lines.push("Global Options:");
    const maxOptionLength = Math.max(...config.options.map((opt) => opt.name.length));
    for (const opt of config.options) {
      const aliases = Array.isArray(opt.aliases) && opt.aliases.length > 0
        ? ` (aliases: ${opt.aliases.join(", ")})`
        : "";
      const padded = opt.name.padEnd(maxOptionLength, " ");
      lines.push(`  ${padded}  ${opt.summary || ""}${aliases}`.trimEnd());
    }
  }

  lines.push("");
  lines.push("Per-command options:");
  let foundCommandOptions = false;
  for (const cmd of config.commands) {
    if (!Array.isArray(cmd.options) || cmd.options.length === 0) {
      continue;
    }
    foundCommandOptions = true;
    lines.push(`  ${cmd.name}`);
    for (const opt of cmd.options) {
      const aliases = Array.isArray(opt.aliases) && opt.aliases.length > 0
        ? ` (aliases: ${opt.aliases.join(", ")})`
        : "";
      lines.push(`    ${opt.name}  ${opt.summary || ""}${aliases}`.trimEnd());
    }
  }
  if (!foundCommandOptions) {
    lines.push("  none");
  }

  if (Array.isArray(config.groups) && config.groups.length > 0) {
    lines.push("");
    lines.push("Command Groups:");
    const maxGroupLen = Math.max(...config.groups.map((g) => g.name.length));
    for (const group of config.groups) {
      const subnames = Array.isArray(group.subcommands)
        ? group.subcommands.map((s) => s.name).join(", ")
        : "none";
      const padded = group.name.padEnd(maxGroupLen, " ");
      lines.push(`  ${padded}  ${group.summary || ""}`.trimEnd());
      lines.push(`  ${" ".repeat(maxGroupLen)}    subcommands: ${subnames}`);
    }
  }

  lines.push("");
  lines.push("Tip: add a command in xcm_cli/config/commands.json and the CLI auto-picks it up.");

  return lines.join("\n");
}

export function renderGroupHelp(config, group) {
  const lines = [];
  const cliName = config.meta?.name || "xcm";

  lines.push(`${cliName} ${group.name}`);
  if (group.summary) {
    lines.push(group.summary);
  }
  lines.push("");
  lines.push("Usage:");
  lines.push(`  xcm ${group.name} <subcommand>`);
  lines.push("");
  lines.push("Subcommands:");

  const subcommands = Array.isArray(group.subcommands) ? group.subcommands : [];
  if (subcommands.length === 0) {
    lines.push("  none");
  } else {
    const maxLen = Math.max(...subcommands.map((s) => s.name.length));
    for (const sub of subcommands) {
      const aliases = Array.isArray(sub.aliases) && sub.aliases.length > 0
        ? ` (aliases: ${sub.aliases.join(", ")})`
        : "";
      const padded = sub.name.padEnd(maxLen, " ");
      lines.push(`  ${padded}  ${sub.summary || ""}${aliases}`.trimEnd());
    }
  }

  lines.push("");
  lines.push(`Tip: xcm ${group.name} --help shows this screen.`);

  return lines.join("\n");
}
