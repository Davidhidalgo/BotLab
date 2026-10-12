import type { BlocksWorkspaceArtifact } from '@botlab/blocks';
import {
  parseHuggingFaceModel,
  usedImportedSkillNames,
} from './huggingface-models';

describe('Hugging Face project models', () => {
  it('accepts a model page or ONNX file URL and rejects another host or invalid metadata', () => {
    expect(
      parseHuggingFaceModel(
        'https://huggingface.co/joanfox/microduck-happy-hop',
        'happy-hop',
        3,
      ),
    ).toMatchObject({
      repo: 'joanfox/microduck-happy-hop',
      revision: 'main',
      filename: 'policy.onnx',
    });
    expect(
      parseHuggingFaceModel(
        'https://huggingface.co/owner/model/blob/a1/skills/hop.onnx',
        'hop',
        2,
      ),
    ).toMatchObject({
      revision: 'a1',
      filename: 'skills/hop.onnx',
    });
    expect(() =>
      parseHuggingFaceModel('https://evil.example/owner/model', 'hop', 2),
    ).toThrow();
    expect(() =>
      parseHuggingFaceModel(
        'https://huggingface.co/owner/model',
        'kick_left',
        2,
      ),
    ).toThrow();
    expect(() =>
      parseHuggingFaceModel('https://huggingface.co/owner/model', 'hop', 0),
    ).toThrow();
  });

  it('loads models connected to the green flag, including branches, while ignoring detached blocks', () => {
    const workspace = {
      format: 'scratch-xml',
      content: `<xml>
      <block type="event_whenflagclicked"><next><block type="control_if">
        <value name="CONDITION"><block type="botlab_microduck_is_stand" /></value>
        <statement name="SUBSTACK"><block type="botlab_microduck_community_skill"><field name="SKILL">happy-hop</field></block></statement>
      </block></next></block>
      <block type="botlab_microduck_community_skill"><field name="SKILL">detached</field></block>
    </xml>`,
    } as BlocksWorkspaceArtifact;
    expect([...usedImportedSkillNames(workspace)]).toEqual(['happy-hop']);
  });
});
