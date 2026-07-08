import { Request, Response } from 'express';
import axios from 'axios';
import vm from 'vm';

// Maps frontend language identifiers to Piston supported runtime config
const LANGUAGE_CONFIG_MAP: Record<string, { language: string; version: string; fileName: string }> = {
  javascript: { language: 'javascript', version: '18.15.0', fileName: 'main.js' },
  typescript: { language: 'typescript', version: '5.0.3', fileName: 'main.ts' },
  python: { language: 'python', version: '3.10.0', fileName: 'main.py' },
  cpp: { language: 'c++', version: '10.2.0', fileName: 'main.cpp' },
  java: { language: 'java', version: '15.0.2', fileName: 'Main.java' },
  go: { language: 'go', version: '1.16.2', fileName: 'main.go' },
};

// Local sandboxed JavaScript execution fallback
const runJsInLocalSandbox = (code: string, stdin?: string) => {
  const outputLog: string[] = [];
  
  // Custom sandbox context mapping
  const sandbox = {
    console: {
      log: (...args: any[]) => {
        outputLog.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
      },
      error: (...args: any[]) => {
        outputLog.push(`[ERROR] ${args.join(' ')}`);
      },
      warn: (...args: any[]) => {
        outputLog.push(`[WARN] ${args.join(' ')}`);
      },
    },
    // Mock standard process elements
    process: {
      argv: ['node', 'main.js', ...(stdin ? stdin.split(/\s+/) : [])],
      env: {},
    },
    setTimeout,
    clearTimeout,
  };

  try {
    // Strips out TypeScript type annotations if present (very basic syntax stripping)
    let cleanCode = code;
    if (code.includes(': number') || code.includes(': string') || code.includes(': any')) {
      cleanCode = code
        .replace(/:\s*number/g, '')
        .replace(/:\s*string/g, '')
        .replace(/:\s*boolean/g, '')
        .replace(/:\s*any/g, '')
        .replace(/:\s*void/g, '')
        .replace(/:\s*string\[\]/g, '')
        .replace(/:\s*number\[\]/g, '');
    }

    const script = new vm.Script(cleanCode);
    const context = vm.createContext(sandbox);
    
    // Execute with a 3-second hard timeout to block infinite loops
    script.runInContext(context, { timeout: 3000 });
    
    return {
      stdout: outputLog.join('\n'),
      stderr: '',
      code: 0,
    };
  } catch (err: any) {
    return {
      stdout: outputLog.join('\n'),
      stderr: err.toString(),
      code: 1,
    };
  }
};

export const executeCode = async (req: Request, res: Response) => {
  const { language, code, stdin } = req.body;

  if (!language || !code) {
    return res.status(400).json({ error: 'Language and code are required parameters' });
  }

  const config = LANGUAGE_CONFIG_MAP[language.toLowerCase()];
  if (!config) {
    return res.status(400).json({ error: `Language '${language}' is not supported` });
  }

  try {
    // 1. Try Piston Execution Engine
    const response = await axios.post(
      'https://emkc.org/api/v2/piston/execute',
      {
        language: config.language,
        version: config.version,
        files: [
          {
            name: config.fileName,
            content: code,
          },
        ],
        stdin: stdin || '',
        args: [],
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 6000, // 6s timeout for API
      }
    );

    const { run } = response.data;
    return res.status(200).json({
      stdout: run.stdout,
      stderr: run.stderr,
      code: run.code,
      signal: run.signal,
      output: run.output,
    });
  } catch (error: any) {
    console.warn(`Piston Engine failed (${error.message}). Invoking local sandbox fallback...`);

    // 2. Local Fallback for JS/TS
    if (['javascript', 'typescript'].includes(language.toLowerCase())) {
      const result = runJsInLocalSandbox(code, stdin);
      return res.status(200).json({
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code,
        output: result.stderr || result.stdout,
        isSandboxFallback: true,
      });
    }

    // Fallback for other languages (Python, Go, Java, C++)
    return res.status(200).json({
      stdout: '',
      stderr: `Code execution API proxy returned: ${error.message}. Local sandbox fallback is only available for JavaScript/TypeScript.`,
      code: 1,
      output: error.message,
    });
  }
};
