import { BotLabError, createBotLabMessage, toBotLabMessage } from './message';

describe('BotLab messages', () => {
  it('omits params when a message has none', () => {
    expect(createBotLabMessage('a.code', 'Text.')).toEqual({
      code: 'a.code',
      text: 'Text.',
    });
  });

  it('keeps the code and params of coded errors', () => {
    expect(
      toBotLabMessage(
        new BotLabError('program.unsupported-block', 'Unsupported: kick.', {
          block: 'kick',
        }),
      ),
    ).toEqual({
      code: 'program.unsupported-block',
      params: { block: 'kick' },
      text: 'Unsupported: kick.',
    });
  });

  it('keeps the text of plain errors and falls back for other values', () => {
    expect(toBotLabMessage(new Error('Boom.'))).toEqual({
      code: 'error.unknown',
      text: 'Boom.',
    });
    expect(toBotLabMessage('nope', 'Fallback.')).toEqual({
      code: 'error.unknown',
      text: 'Fallback.',
    });
  });
});
