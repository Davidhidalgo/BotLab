import type { BlocksWorkspaceArtifact } from '@botlab/blocks';
import { readMicroDuckProgramFromWorkspace } from '@botlab/blocks';
import type { MicroDuckProgramStep } from '@botlab/model';

export interface HuggingFaceModel {
  url: string;
  repo: string;
  revision: string;
  filename: string;
  name: string;
  duration: number;
}

const skillName = /^[a-z][a-z0-9_-]{0,39}$/;
const repoPart = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const reserved = new Set([
  'sit_toggle',
  'ground_pick',
  'kick_left',
  'kick_right',
  'roulade',
]);

export function parseHuggingFaceModel(
  url: string,
  name: string,
  duration: number,
): HuggingFaceModel {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error('Enter a Hugging Face model URL.');
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  const filePage =
    (parts[2] === 'blob' || parts[2] === 'resolve') && parts.length >= 5;
  const treePage = parts[2] === 'tree' && parts.length === 4;
  const filename = filePage ? parts.slice(4).join('/') : 'policy.onnx';
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'huggingface.co' ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    (parsed.search && parsed.search !== '?download=true') ||
    parsed.hash ||
    !(parts.length === 2 || treePage || filePage) ||
    !repoPart.test(parts[0]) ||
    !repoPart.test(parts[1]) ||
    (parts.length > 2 && !/^[A-Za-z0-9_.-]+$/.test(parts[3])) ||
    !filename.endsWith('.onnx') ||
    filename.split('/').some((part) => !repoPart.test(part) || part === '..')
  )
    throw new Error(
      'Use a public Hugging Face model URL (https://huggingface.co/owner/model).',
    );
  if (!skillName.test(name) || reserved.has(name))
    throw new Error(
      'Choose a new lowercase skill name (letters, digits, _ or -).',
    );
  if (!Number.isFinite(duration) || duration <= 0 || duration > 30)
    throw new Error(
      'Duration must be greater than zero and at most 30 seconds.',
    );
  return {
    url: `https://huggingface.co/${parts[0]}/${parts[1]}${filePage ? `/blob/${parts[3]}/${filename}` : treePage ? `/tree/${parts[3]}` : ''}`,
    repo: `${parts[0]}/${parts[1]}`,
    revision: parts[3] ?? 'main',
    filename,
    name,
    duration,
  };
}

export function usedImportedSkillNames(workspace: BlocksWorkspaceArtifact) {
  const used = new Set<string>();
  function visit(steps: MicroDuckProgramStep[]) {
    for (const step of steps) {
      if (step.type === 'skill' && !reserved.has(step.skill))
        used.add(step.skill);
      if (step.type === 'repeat') visit(step.body);
      if (step.type === 'if') {
        visit(step.then);
        visit(step.else);
      }
    }
  }
  try {
    visit(readMicroDuckProgramFromWorkspace(workspace));
  } catch {
    // Invalid or incomplete programs cannot run; connecting should still work.
  }
  return used;
}
