import { botLabConcepts } from './botlab-model';

describe('botlabModel', () => {
  it('models the main BotLab concepts', () => {
    expect(botLabConcepts.map((entry) => entry.concept)).toContain('behavior');
  });
});
