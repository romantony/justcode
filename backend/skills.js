import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { db } from './db.js';
import { mcpManager } from './mcp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_SKILLS_DIR = path.join(__dirname, 'temp_skills');

if (!fs.existsSync(TEMP_SKILLS_DIR)) {
  fs.mkdirSync(TEMP_SKILLS_DIR, { recursive: true });
}

// Simple list of stop words to filter out before codebase search
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between',
  'into', 'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up',
  'down', 'in', 'out', 'over', 'under', 'again', 'further', 'then', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'
]);

/**
 * Scans the workspace to find relevant files based on search keywords.
 * Returns file contents formatted for injection into LLM prompts.
 */
export async function getCodebaseContext(prompt, workspacePath, limitKB = 30) {
  if (!workspacePath) return '';
  
  // Extract keywords
  const keywords = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
    
  if (keywords.length === 0) return '';

  const scoredFiles = [];
  
  function scan(dir) {
    let list;
    try {
      list = fs.readdirSync(dir);
    } catch (e) {
      return;
    }
    
    for (const file of list) {
      const fullPath = path.join(dir, file);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }
      
      if (stat.isDirectory()) {
        if (file === 'node_modules' || file === '.git' || file === 'dist' || file === '.next' || file === 'build') continue;
        scan(fullPath);
      } else {
        // Only inspect text-like files
        const ext = path.extname(file).toLowerCase();
        const validExtensions = ['.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.py', '.md', '.yml', '.yaml', '.sh'];
        if (!validExtensions.includes(ext)) continue;
        
        try {
          // Read a chunk of the file or full file if it is small
          const content = fs.readFileSync(fullPath, 'utf-8');
          const contentLower = content.toLowerCase();
          
          let score = 0;
          for (const kw of keywords) {
            // Count frequencies
            let idx = contentLower.indexOf(kw);
            while (idx !== -1) {
              score++;
              idx = contentLower.indexOf(kw, idx + kw.length);
            }
          }
          
          if (score > 0) {
            const relPath = path.relative(workspacePath, fullPath);
            scoredFiles.push({
              path: relPath,
              fullPath,
              score,
              content,
              size: stat.size
            });
          }
        } catch (e) {
          // Skip file if unreadable
        }
      }
    }
  }

  scan(workspacePath);
  
  // Sort files by score descending
  scoredFiles.sort((a, b) => b.score - a.score);
  
  // Select files fitting within the size limit
  const selectedFiles = [];
  let totalBytes = 0;
  const maxBytes = limitKB * 1024;
  
  for (const file of scoredFiles) {
    if (totalBytes + file.size > maxBytes) {
      // If first file is too big, truncate or skip
      if (selectedFiles.length === 0) {
        selectedFiles.push({
          path: file.path,
          content: file.content.slice(0, maxBytes) + '\n... [TRUNCATED] ...'
        });
      }
      break;
    }
    selectedFiles.push({ path: file.path, content: file.content });
    totalBytes += file.size;
  }
  
  if (selectedFiles.length === 0) return '';
  
  let output = '### RELEVANT WORKSPACE CONTEXT FILES:\n';
  for (const f of selectedFiles) {
    output += `\n--- File: ${f.path} ---\n\`\`\`\n${f.content}\n\`\`\`\n`;
  }
  return output;
}

export async function executeSkill(skillId, workspacePath, params, metadata = null) {
  // Check if standard skill
  const skills = db.getSkills();
  const skill = skills[skillId];
  
  if (skill) {
    // Execute custom user-written or default JS skill
    const skillFile = path.join(TEMP_SKILLS_DIR, `${skillId}_${Date.now()}.js`);
    fs.writeFileSync(skillFile, skill.code, 'utf-8');
    
    try {
      const skillModule = await import(pathToFileURL(skillFile).href);
      if (typeof skillModule.run !== 'function') {
        throw new Error(`Skill [${skill.name}] does not export a run() function.`);
      }
      return await skillModule.run({ workspacePath, params, metadata });
    } catch (err) {
      console.error(`Error executing skill [${skill.name}]:`, err);
      throw err;
    } finally {
      // Cleanup
      try {
        if (fs.existsSync(skillFile)) {
          fs.unlinkSync(skillFile);
        }
      } catch (e) {
        // Ignore unlinking errors
      }
    }
  }
  
  // Check if MCP tool
  const mcpTools = mcpManager.getAllMCPTools();
  const mcpTool = mcpTools.find(t => t.name === skillId);
  if (mcpTool) {
    console.log(`Executing MCP tool [${skillId}] with params:`, params);
    const result = await mcpManager.callMCPTool(skillId, params);
    return result;
  }
  
  throw new Error(`Skill or MCP Tool [${skillId}] is not registered.`);
}
