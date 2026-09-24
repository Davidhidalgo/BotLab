import { createBotLabMessage } from '@botlab/model';
import { botLabTranslations } from './i18n';
import { formatBotLabMessage } from './workbench-labels';

describe('formatBotLabMessage', () => {
  const ca = botLabTranslations.ca;

  it('renders catalog entries with their parameters', () => {
    expect(
      formatBotLabMessage(
        createBotLabMessage('program.unsupported-block', 'Unsupported.', {
          block: 'botlab_microduck_kick',
        }),
        ca,
      ),
    ).toBe(`${ca.messages.unsupportedBlock} botlab_microduck_kick.`);
  });

  it('localizes execution statuses inside parameters', () => {
    expect(
      formatBotLabMessage(
        createBotLabMessage('flow.commands-sent', '3 command(s) sent.', {
          count: 3,
          status: 'dispatched',
        }),
        ca,
      ),
    ).toBe(`3 ${ca.messages.commandSentSuffix} ${ca.status.dispatched}.`);
  });

  it('falls back to the English text for codes without a translation', () => {
    expect(
      formatBotLabMessage(
        createBotLabMessage('flow.queue-empty', 'Nothing queued.'),
        ca,
      ),
    ).toBe('Nothing queued.');
  });
});
