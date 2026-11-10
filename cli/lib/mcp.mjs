/** Sillage as a Model Context Protocol server on stdio: the same tools as the
 * command line, with renders returned inline as images. One browser session
 * is kept open between calls, so the second render is fast.
 *
 *   claude mcp add sillage -- node /path/to/cli/sillage.mjs mcp
 *
 * JSON-RPC 2.0, one message per line. Nothing but protocol goes to stdout. */
import {createInterface} from 'node:readline';
import {errorJSON} from '../../src/sillage/errors.js';
import {TOOLS, createContext, runTool} from './tools.mjs';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS = 'Sillage draws 3D scenes as brush-stroke Gaussian splats. Start with list_scenes for the built-in scenes, or scene_format to write your own scene document as JSON. inspect_scene checks a document without drawing it; render draws one view and render_views a labelled sheet of several. Every error names what to send instead.';

export async function serveMCP({input = process.stdin, output = process.stdout, version = '0.0.0', cwd = process.cwd(), url} = {}) {
  const context = createContext({cwd, url}), send = message => output.write(JSON.stringify(message) + '\n');
  // Tool calls run one at a time: they share one page.
  let queue = Promise.resolve();

  async function handle(message) {
    const {id, method, params} = message;
    if (method === 'initialize') {
      return {protocolVersion: PROTOCOLS.includes(params?.protocolVersion) ? params.protocolVersion : PROTOCOLS[0], capabilities: {tools: {}}, serverInfo: {name: 'sillage', version}, instructions: INSTRUCTIONS};
    }
    if (method === 'ping') return {};
    if (method === 'tools/list') return {tools: TOOLS.map(({name, description, input_schema}) => ({name, description, inputSchema: input_schema}))};
    if (method === 'tools/call') {
      try {
        const result = await runTool(params?.name, params?.arguments ?? {}, context);
        const content = [{type: 'text', text: result.text}];
        for (const image of result.images) {
          content.push({type: 'text', text: `image: ${image.path}`});
          content.push({type: 'image', data: image.png.toString('base64'), mimeType: 'image/png'});
        }
        return {content, structuredContent: result.data ?? {}, isError: result.failed};
      } catch (error) {
        const problem = errorJSON(error);
        return {content: [{type: 'text', text: `Error [${problem.code}]: ${problem.message}${problem.hint ? `\nHint: ${problem.hint}` : ''}`}], isError: true};
      }
    }
    if (id === undefined) return undefined;
    throw Object.assign(new Error(`Method not found: ${method}`), {rpc: -32601});
  }

  const lines = createInterface({input, crlfDelay: Infinity});
  lines.on('line', line => {
    if (!line.trim()) return;
    let message;
    try { message = JSON.parse(line); } catch { send({jsonrpc: '2.0', id: null, error: {code: -32700, message: 'Parse error'}}); return; }
    queue = queue.then(async () => {
      try {
        const result = await handle(message);
        // Notifications carry no id and get no reply.
        if (message.id !== undefined && result !== undefined) send({jsonrpc: '2.0', id: message.id, result});
      } catch (error) {
        if (message.id !== undefined) send({jsonrpc: '2.0', id: message.id, error: {code: error.rpc ?? -32603, message: String(error.message)}});
      }
    });
  });
  await new Promise(resolve => lines.once('close', resolve));
  await queue;
  await context.close();
}
