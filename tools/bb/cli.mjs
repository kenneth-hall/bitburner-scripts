// CLI over driver.mjs so the game's read/act helpers are runnable from a shell
// (and, by extension, from Claude via the Bash tool) without an MCP server.
//
// Examples:
//   node tools/bb/cli.mjs stats
//   node tools/bb/cli.mjs terminal "home; scan"
//   node tools/bb/cli.mjs read-tail daemon
//   node tools/bb/cli.mjs aria
//   node tools/bb/cli.mjs shot ../out/screen.png
import * as bb from './driver.mjs';

const [cmd, ...args] = process.argv.slice(2);
const out = (v) => console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));

const USAGE =
  'commands: stats | terminal <cmd...> | read-terminal | read-tail <name> | aria | body | goto <section> | shot [path]';

await bb.withPage(async (page) => {
  switch (cmd) {
    case 'stats': return out(await bb.getStats(page));
    case 'terminal': return out(await bb.runCommand(page, args.join(' ')));
    case 'read-terminal': return out(await bb.readTerminal(page));
    case 'read-tail': return out(await bb.readTail(page, args[0]));
    case 'aria': return out(await bb.ariaSnapshot(page));
    case 'body': return out(await bb.bodyText(page));
    case 'goto': { await bb.goto(page, args.join(' ')); return out('ok -> ' + args.join(' ')); }
    case 'shot': { return out('saved ' + (await bb.screenshot(page, args[0] || 'bb-shot.png'))); }
    default: return out(USAGE);
  }
});
